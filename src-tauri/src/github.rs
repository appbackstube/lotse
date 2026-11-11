use crate::{repository_path, run_blocking, AppState};
use reqwest::{
    blocking::{Client, Response},
    header::HeaderMap,
    Method, StatusCode,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter, State, WebviewWindow};

#[derive(Clone, Serialize, Deserialize)]
pub struct Account {
    id: u64,
    login: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Repository {
    id: u64,
    #[serde(alias = "full_name")]
    full_name: String,
}

#[derive(Clone, Serialize, Deserialize, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub enum ItemKind {
    Issue,
    PullRequest,
}

impl ItemKind {
    fn endpoint(&self) -> &str {
        match self {
            Self::Issue => "issues",
            Self::PullRequest => "pulls",
        }
    }
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Item {
    number: u64,
    kind: ItemKind,
    title: String,
    description: String,
    state: String,
    url: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Notification {
    number: u64,
    kind: ItemKind,
    reason: String,
    updated_at: String,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ItemUpdate {
    title: Option<String>,
    description: Option<String>,
    completed: Option<bool>,
}

impl ItemUpdate {
    fn payload(&self) -> Result<Value, String> {
        let mut result = json!({});
        if let Some(title) = &self.title {
            if title.trim().is_empty() || title.chars().count() > 500 {
                return Err("GitHub title must contain 1–500 characters.".into());
            }
            result["title"] = json!(title);
        }
        if let Some(description) = &self.description {
            if description.len() > 262_144 {
                return Err("GitHub description is too long.".into());
            }
            result["body"] = json!(description);
        }
        if let Some(completed) = self.completed {
            result["state"] = json!(if completed { "closed" } else { "open" });
        }
        if result.as_object().unwrap().is_empty() {
            return Err("No GitHub changes provided.".into());
        }
        Ok(result)
    }
}

struct InboxCache {
    notifications: Vec<Notification>,
    modified: Option<String>,
    next_poll: Instant,
}

#[derive(Default)]
struct Session {
    token: Option<String>,
    account: Option<Account>,
    inboxes: HashMap<String, InboxCache>,
    retry_at: Option<Instant>,
}

#[derive(Default, Clone)]
pub struct GitHubRuntime(Arc<Mutex<Session>>);

struct Api {
    client: Client,
    base: String,
}

impl Api {
    fn render_image(
        &self,
        session: &mut Session,
        repository: &str,
        source: &str,
    ) -> Result<String, String> {
        let url = reqwest::Url::parse(source).map_err(|_| "Invalid GitHub image URL.")?;
        let asset = url
            .path()
            .strip_prefix("/user-attachments/assets/")
            .unwrap_or("");
        if url.scheme() != "https"
            || url.host_str() != Some("github.com")
            || !url.username().is_empty()
            || url.password().is_some()
            || url.port().is_some()
            || url.query().is_some()
            || url.fragment().is_some()
            || asset.is_empty()
            || asset.len() > 100
            || !asset
                .bytes()
                .all(|byte| byte.is_ascii_hexdigit() || byte == b'-')
        {
            return Err("Only GitHub attachment URLs can use authenticated image previews.".into());
        }
        let response = self.request(
            session,
            Method::POST,
            "/markdown",
            Some(json!({"text":format!("![preview](<{url}>)"),"mode":"gfm","context":repository})),
            None,
        )?;
        response
            .text()
            .map_err(|_| "Cannot read the GitHub image preview.".into())
    }

    fn new() -> Result<Self, String> {
        Ok(Self {
            client: Client::builder()
                .timeout(Duration::from_secs(25))
                .redirect(reqwest::redirect::Policy::none())
                .build()
                .map_err(|_| "Cannot initialize GitHub client.")?,
            base: "https://api.github.com".into(),
        })
    }

    fn request(
        &self,
        session: &mut Session,
        method: Method,
        path: &str,
        body: Option<Value>,
        modified: Option<&str>,
    ) -> Result<Response, String> {
        if let Some(retry_at) = session.retry_at.filter(|time| *time > Instant::now()) {
            return Err(format!(
                "GitHub requests paused; retry in {} seconds.",
                retry_at.saturating_duration_since(Instant::now()).as_secs() + 1
            ));
        }
        let token = session
            .token
            .as_deref()
            .ok_or("Connect a GitHub account in Settings.")?;
        let mut request = self
            .client
            .request(method, format!("{}{path}", self.base))
            .bearer_auth(token)
            .header("User-Agent", "Lotse-GitHub-Inbox")
            .header("Accept", "application/vnd.github+json")
            .header("X-GitHub-Api-Version", "2022-11-28");
        if let Some(body) = body {
            request = request.json(&body);
        }
        if let Some(modified) = modified {
            request = request.header("If-Modified-Since", modified);
        }
        let response = request
            .send()
            .map_err(|_| "Cannot reach GitHub. Check your connection and refresh.")?;
        if response.status().is_success() || response.status() == StatusCode::NOT_MODIFIED {
            return Ok(response);
        }
        let status = response.status();
        if let Some(delay) = retry_delay(status, response.headers()) {
            session.retry_at = Some(Instant::now() + Duration::from_secs(delay));
            return Err(format!(
                "GitHub rate limit reached. Retry in {delay} seconds."
            ));
        }
        Err(match status {
            StatusCode::UNAUTHORIZED => "GitHub token expired or is invalid. Replace it in Settings.".into(),
            StatusCode::FORBIDDEN => "GitHub denied access. Check token scopes, repository permissions, and organization SSO authorization.".into(),
            StatusCode::NOT_FOUND => "GitHub item or repository is unavailable, or your token cannot access it.".into(),
            StatusCode::UNPROCESSABLE_ENTITY => "GitHub rejected this update. The item may not be editable or reopenable.".into(),
            _ => format!("GitHub request failed (HTTP {}). Refresh to retry.", status.as_u16()),
        })
    }

    fn item(
        &self,
        session: &mut Session,
        repository: &str,
        kind: ItemKind,
        number: u64,
    ) -> Result<Item, String> {
        validate_number(number)?;
        let response = self.request(
            session,
            Method::GET,
            &format!("/repos/{repository}/{}/{number}", kind.endpoint()),
            None,
            None,
        )?;
        parse_item(
            response
                .json()
                .map_err(|_| "Invalid GitHub item response.")?,
            kind,
            repository,
            number,
        )
    }

    fn update(
        &self,
        session: &mut Session,
        repository: &str,
        kind: ItemKind,
        number: u64,
        update: ItemUpdate,
    ) -> Result<Item, String> {
        validate_number(number)?;
        let payload = update.payload()?;
        if kind == ItemKind::PullRequest
            && update.completed == Some(false)
            && self.item(session, repository, kind.clone(), number)?.state == "merged"
        {
            return Err("Merged pull requests cannot be reopened.".into());
        }
        let response = self.request(
            session,
            Method::PATCH,
            &format!("/repos/{repository}/{}/{number}", kind.endpoint()),
            Some(payload),
            None,
        )?;
        parse_item(
            response
                .json()
                .map_err(|_| "Invalid GitHub update response.")?,
            kind,
            repository,
            number,
        )
    }

    fn notifications(
        &self,
        session: &mut Session,
        repository: &str,
    ) -> Result<Vec<Notification>, String> {
        if let Some(cache) = session
            .inboxes
            .get(repository)
            .filter(|cache| cache.next_poll > Instant::now())
        {
            return Ok(cache.notifications.clone());
        }
        let modified = session
            .inboxes
            .get(repository)
            .and_then(|cache| cache.modified.clone());
        let mut notifications = Vec::new();
        let mut page = 1;
        let mut poll_interval = 60;
        let mut last_modified = None;
        loop {
            let response = self.request(
                session,
                Method::GET,
                &format!("/repos/{repository}/notifications?all=false&per_page=100&page={page}"),
                None,
                if page == 1 { modified.as_deref() } else { None },
            )?;
            poll_interval = poll_interval
                .max(header_seconds(response.headers(), "x-poll-interval").unwrap_or(60))
                .min(86_400);
            if response.status() == StatusCode::NOT_MODIFIED {
                let cache = session
                    .inboxes
                    .get_mut(repository)
                    .ok_or("GitHub returned an unexpected empty response.")?;
                cache.next_poll = Instant::now() + Duration::from_secs(poll_interval);
                return Ok(cache.notifications.clone());
            }
            if page == 1 {
                last_modified = response
                    .headers()
                    .get("last-modified")
                    .and_then(|value| value.to_str().ok())
                    .map(str::to_owned);
            }
            let rows: Vec<Value> = response
                .json()
                .map_err(|_| "Invalid GitHub notifications response.")?;
            let count = rows.len();
            for row in rows {
                let kind = match row["subject"]["type"].as_str() {
                    Some("Issue") => ItemKind::Issue,
                    Some("PullRequest") => ItemKind::PullRequest,
                    _ => continue,
                };
                let prefix = format!(
                    "https://api.github.com/repos/{repository}/{}/",
                    kind.endpoint()
                );
                let Some(number) = row["subject"]["url"]
                    .as_str()
                    .and_then(|url| url.strip_prefix(&prefix))
                    .and_then(|value| value.parse::<u64>().ok())
                    .filter(|number| validate_number(*number).is_ok())
                else {
                    continue;
                };
                notifications.push(Notification {
                    number,
                    kind,
                    reason: row["reason"].as_str().unwrap_or("notification").into(),
                    updated_at: row["updated_at"].as_str().unwrap_or("").into(),
                });
            }
            if count < 100 {
                break;
            }
            page += 1;
            if page > 1000 {
                return Err("Too many GitHub notification pages; refresh to retry.".into());
            }
        }
        session.inboxes.insert(
            repository.into(),
            InboxCache {
                notifications: notifications.clone(),
                modified: last_modified,
                next_poll: Instant::now() + Duration::from_secs(poll_interval),
            },
        );
        Ok(notifications)
    }
}

fn validate_number(number: u64) -> Result<(), String> {
    if number == 0 || number > 9_007_199_254_740_991 {
        Err("Invalid GitHub item number.".into())
    } else {
        Ok(())
    }
}

fn parse_item(value: Value, kind: ItemKind, repository: &str, number: u64) -> Result<Item, String> {
    if value["number"].as_u64() != Some(number) {
        return Err("Invalid GitHub item identity.".into());
    }
    let state = if value["merged_at"].is_string() || value["merged"].as_bool() == Some(true) {
        "merged"
    } else {
        value["state"]
            .as_str()
            .filter(|state| matches!(*state, "open" | "closed"))
            .ok_or("Invalid GitHub item state.")?
    };
    Ok(Item {
        number,
        url: format!(
            "https://github.com/{repository}/{}/{number}",
            if kind == ItemKind::Issue {
                "issues"
            } else {
                "pull"
            }
        ),
        kind,
        title: value["title"]
            .as_str()
            .ok_or("Invalid GitHub item title.")?
            .into(),
        description: value["body"].as_str().unwrap_or("").into(),
        state: state.into(),
    })
}

fn header_seconds(headers: &HeaderMap, name: &str) -> Option<u64> {
    headers.get(name)?.to_str().ok()?.parse().ok()
}

fn retry_delay(status: StatusCode, headers: &HeaderMap) -> Option<u64> {
    if status != StatusCode::TOO_MANY_REQUESTS && status != StatusCode::FORBIDDEN {
        return None;
    }
    let reset_delay = (headers
        .get("x-ratelimit-remaining")
        .and_then(|value| value.to_str().ok())
        == Some("0"))
    .then(|| {
        header_seconds(headers, "x-ratelimit-reset")
            .unwrap_or(0)
            .saturating_sub(
                SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs(),
            )
            + 1
    });
    header_seconds(headers, "retry-after")
        .or(reset_delay)
        .or((status == StatusCode::TOO_MANY_REQUESTS).then_some(60))
        .map(|seconds| seconds.clamp(1, 86_400))
}

fn parse_remote(remote: &str) -> Result<String, String> {
    let remote = remote.trim();
    let path = remote
        .strip_prefix("git@github.com:")
        .or_else(|| remote.strip_prefix("ssh://git@github.com/"))
        .or_else(|| remote.strip_prefix("https://github.com/"))
        .ok_or("GitHub Inbox requires a GitHub.com HTTPS or SSH origin remote.")?;
    let path = path
        .trim_end_matches('/')
        .strip_suffix(".git")
        .unwrap_or(path.trim_end_matches('/'));
    let parts: Vec<_> = path.split('/').collect();
    if parts.len() != 2
        || parts.iter().any(|part| {
            part.is_empty()
                || matches!(*part, "." | "..")
                || !part
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
        })
    {
        return Err("Invalid GitHub origin remote.".into());
    }
    Ok(path.into())
}

fn window_repository(
    state: &AppState,
    window: &WebviewWindow,
    expected: Option<&str>,
) -> Result<String, String> {
    let root = repository_path(state, window)?;
    let remote = crate::git_text(&root, &["remote", "get-url", "origin"])
        .map_err(|_| "GitHub Inbox requires an origin remote.")?;
    let repository = parse_remote(&remote)?;
    if expected.is_some_and(|expected| !expected.eq_ignore_ascii_case(&repository)) {
        return Err("Repository changed. Refresh GitHub Inbox.".into());
    }
    Ok(expected.map(str::to_owned).unwrap_or(repository))
}

fn load_token(app: &AppHandle) -> Result<Option<String>, String> {
    crate::credentials::load(app, "github.com")
}

fn identify(api: &Api, session: &mut Session) -> Result<Account, String> {
    let response = api.request(session, Method::GET, "/user", None, None)?;
    if let Some(scopes) = response
        .headers()
        .get("x-oauth-scopes")
        .and_then(|value| value.to_str().ok())
    {
        if !scopes
            .split(',')
            .map(str::trim)
            .any(|scope| matches!(scope, "notifications" | "repo"))
        {
            return Err("Use a classic GitHub token with notifications and repository access; fine-grained tokens cannot read notifications.".into());
        }
    }
    let account: Account = response
        .json()
        .map_err(|_| "Invalid GitHub account response.")?;
    if account.id == 0 || account.login.is_empty() {
        return Err("Invalid GitHub account.".into());
    }
    Ok(account)
}

fn check_account(session: &Session, account_id: u64) -> Result<(), String> {
    if session
        .account
        .as_ref()
        .is_some_and(|account| account.id == account_id)
    {
        Ok(())
    } else {
        Err("GitHub account changed. Reconnect the linked account in Settings.".into())
    }
}

#[tauri::command]
pub async fn github_connection(
    app: AppHandle,
    runtime: State<'_, GitHubRuntime>,
) -> Result<Option<Account>, String> {
    let runtime = runtime.inner().clone();
    run_blocking(move || {
        let mut session = runtime.0.lock().map_err(|_| "GitHub connection is busy.")?;
        if session.account.is_some() {
            return Ok(session.account.clone());
        }
        session.token = load_token(&app)?;
        if session.token.is_none() {
            return Ok(None);
        }
        session.account = Some(identify(&Api::new()?, &mut session)?);
        Ok(session.account.clone())
    })
    .await
}

#[tauri::command]
pub async fn github_connect(
    token: String,
    app: AppHandle,
    runtime: State<'_, GitHubRuntime>,
) -> Result<Account, String> {
    let runtime = runtime.inner().clone();
    run_blocking(move || {
        let token = token.trim();
        if !token.starts_with("ghp_") || token.len() > 255 || !token.bytes().all(|byte| byte.is_ascii_alphanumeric() || byte == b'_') {
            return Err("Enter a classic personal access token (ghp_…). Fine-grained tokens cannot read notifications.".into());
        }
        let mut candidate = Session { token: Some(token.into()), ..Session::default() };
        let account = identify(&Api::new()?, &mut candidate)?;
        candidate.account = Some(account.clone());
        let mut session = runtime.0.lock().map_err(|_| "GitHub connection is busy.")?;
        crate::credentials::save(&app, "github.com", Some(token))?;
        *session = candidate;
        let _ = app.emit("github-connection-changed", ());
        Ok(account)
    }).await
}

#[tauri::command]
pub async fn github_disconnect(
    app: AppHandle,
    runtime: State<'_, GitHubRuntime>,
) -> Result<(), String> {
    let runtime = runtime.inner().clone();
    run_blocking(move || {
        let mut session = runtime.0.lock().map_err(|_| "GitHub connection is busy.")?;
        crate::credentials::save(&app, "github.com", None)?;
        *session = Session::default();
        let _ = app.emit("github-connection-changed", ());
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn github_repository(
    account_id: u64,
    app_state: State<'_, AppState>,
    window: WebviewWindow,
    runtime: State<'_, GitHubRuntime>,
) -> Result<Repository, String> {
    let repository = window_repository(&app_state, &window, None)?;
    let runtime = runtime.inner().clone();
    run_blocking(move || {
        let mut session = runtime.0.lock().map_err(|_| "GitHub connection is busy.")?;
        check_account(&session, account_id)?;
        let response = Api::new()?.request(
            &mut session,
            Method::GET,
            &format!("/repos/{repository}"),
            None,
            None,
        )?;
        let result: Repository = response
            .json()
            .map_err(|_| "Invalid GitHub repository response.")?;
        if result.id == 0 || !result.full_name.eq_ignore_ascii_case(&repository) {
            return Err("GitHub repository moved. Update the origin remote and retry.".into());
        }
        Ok(result)
    })
    .await
}

#[tauri::command]
pub async fn github_fetch_inbox(
    account_id: u64,
    repository: String,
    app_state: State<'_, AppState>,
    window: WebviewWindow,
    runtime: State<'_, GitHubRuntime>,
) -> Result<Vec<Notification>, String> {
    let repository = window_repository(&app_state, &window, Some(&repository))?;
    let runtime = runtime.inner().clone();
    run_blocking(move || {
        let mut session = runtime.0.lock().map_err(|_| "GitHub connection is busy.")?;
        check_account(&session, account_id)?;
        Api::new()?.notifications(&mut session, &repository)
    })
    .await
}

#[tauri::command]
pub async fn github_get_item(
    account_id: u64,
    repository: String,
    kind: ItemKind,
    number: u64,
    app_state: State<'_, AppState>,
    window: WebviewWindow,
    runtime: State<'_, GitHubRuntime>,
) -> Result<Item, String> {
    let repository = window_repository(&app_state, &window, Some(&repository))?;
    let runtime = runtime.inner().clone();
    run_blocking(move || {
        let mut session = runtime.0.lock().map_err(|_| "GitHub connection is busy.")?;
        check_account(&session, account_id)?;
        Api::new()?.item(&mut session, &repository, kind, number)
    })
    .await
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemUpdateRequest {
    account_id: u64,
    repository: String,
    kind: ItemKind,
    number: u64,
    update: ItemUpdate,
}

#[tauri::command]
pub async fn github_update_item(
    input: ItemUpdateRequest,
    app_state: State<'_, AppState>,
    window: WebviewWindow,
    runtime: State<'_, GitHubRuntime>,
) -> Result<Item, String> {
    let ItemUpdateRequest { account_id, repository, kind, number, update } = input;
    let repository = window_repository(&app_state, &window, Some(&repository))?;
    let runtime = runtime.inner().clone();
    run_blocking(move || {
        let mut session = runtime.0.lock().map_err(|_| "GitHub connection is busy.")?;
        check_account(&session, account_id)?;
        Api::new()?.update(&mut session, &repository, kind, number, update)
    })
    .await
}

#[tauri::command]
pub async fn github_render_image(
    account_id: u64,
    repository: String,
    source: String,
    app_state: State<'_, AppState>,
    window: WebviewWindow,
    runtime: State<'_, GitHubRuntime>,
) -> Result<String, String> {
    let repository = window_repository(&app_state, &window, Some(&repository))?;
    let runtime = runtime.inner().clone();
    run_blocking(move || {
        let mut session = runtime.0.lock().map_err(|_| "GitHub connection is busy.")?;
        check_account(&session, account_id)?;
        Api::new()?.render_image(&mut session, &repository, &source)
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        io::{Read, Write},
        net::TcpListener,
        thread,
    };

    fn mock(responses: Vec<String>) -> (Api, thread::JoinHandle<Vec<String>>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        let server = thread::spawn(move || {
            responses
                .into_iter()
                .map(|response| {
                    let (mut stream, _) = listener.accept().unwrap();
                    stream
                        .set_read_timeout(Some(Duration::from_secs(5)))
                        .unwrap();
                    let mut bytes = Vec::new();
                    let mut buffer = [0; 4096];
                    loop {
                        let count = stream.read(&mut buffer).unwrap();
                        if count == 0 {
                            break;
                        }
                        bytes.extend_from_slice(&buffer[..count]);
                        let text = String::from_utf8_lossy(&bytes);
                        if let Some(end) = text.find("\r\n\r\n") {
                            let length = text[..end]
                                .lines()
                                .find_map(|line| {
                                    line.to_ascii_lowercase()
                                        .strip_prefix("content-length: ")
                                        .and_then(|value| value.parse::<usize>().ok())
                                })
                                .unwrap_or(0);
                            if bytes.len() >= end + 4 + length {
                                break;
                            }
                        }
                    }
                    stream.write_all(response.as_bytes()).unwrap();
                    String::from_utf8(bytes).unwrap()
                })
                .collect()
        });
        let api = Api {
            base,
            ..Api::new().unwrap()
        };
        (api, server)
    }
    fn response(status: &str, headers: &str, body: &str) -> String {
        format!(
            "HTTP/1.1 {status}\r\nConnection: close\r\nContent-Length: {}\r\n{headers}\r\n{body}",
            body.len()
        )
    }
    fn session() -> Session {
        Session {
            token: Some("synthetic-test-token".into()),
            account: Some(Account {
                id: 1,
                login: "test".into(),
            }),
            ..Session::default()
        }
    }

    #[test]
    fn parses_only_github_origin_urls() {
        for remote in [
            "https://github.com/owner/repo.git",
            "git@github.com:owner/repo.git",
            "ssh://git@github.com/owner/repo",
            "https://github.com/owner/repo/",
        ] {
            assert_eq!(parse_remote(remote).unwrap(), "owner/repo");
        }
        for remote in [
            "https://github.com.evil/owner/repo",
            "https://github.com/../repo",
            "https://github.com/owner/repo?token=x",
            "git@elsewhere:owner/repo",
            "https://user:secret@github.com/owner/repo",
        ] {
            assert!(parse_remote(remote).is_err());
        }
    }

    #[test]
    fn paginates_filters_and_obeys_poll_interval() {
        let row = json!({"subject":{"type":"Issue","url":"https://api.github.com/repos/o/r/issues/2"},"reason":"mention","updated_at":"now"});
        let page = serde_json::to_string(&vec![row; 100]).unwrap();
        let (api, server) = mock(vec![
            response(
                "200 OK",
                "Last-Modified: yesterday\r\nX-Poll-Interval: 120\r\n",
                &page,
            ),
            response("200 OK", "", "[{\"subject\":{\"type\":\"Release\"}}]"),
        ]);
        let mut session = session();
        assert_eq!(api.notifications(&mut session, "o/r").unwrap().len(), 100);
        assert_eq!(api.notifications(&mut session, "o/r").unwrap().len(), 100);
        let requests = server.join().unwrap();
        assert!(requests[0].contains("all=false&per_page=100&page=1"));
        assert!(requests[1].contains("page=2"));
        assert!(session.inboxes["o/r"].next_poll > Instant::now() + Duration::from_secs(100));
    }

    #[test]
    fn conditional_requests_keep_notifications() {
        let (api, server) = mock(vec![response(
            "304 Not Modified",
            "X-Poll-Interval: 90\r\n",
            "",
        )]);
        let mut session = session();
        session.inboxes.insert(
            "o/r".into(),
            InboxCache {
                notifications: vec![Notification {
                    number: 1,
                    kind: ItemKind::Issue,
                    reason: "mention".into(),
                    updated_at: "".into(),
                }],
                modified: Some("yesterday".into()),
                next_poll: Instant::now(),
            },
        );
        assert_eq!(api.notifications(&mut session, "o/r").unwrap().len(), 1);
        assert!(server.join().unwrap()[0]
            .to_ascii_lowercase()
            .contains("if-modified-since: yesterday"));
    }

    #[test]
    fn handles_auth_permissions_and_rate_limits() {
        for (status, headers, expected) in [
            ("401 Unauthorized", "", "expired"),
            ("403 Forbidden", "", "denied"),
            ("404 Not Found", "", "unavailable"),
            (
                "429 Too Many Requests",
                "Retry-After: 120\r\n",
                "rate limit",
            ),
        ] {
            let (api, server) = mock(vec![response(status, headers, "{}")]);
            let mut session = session();
            let error = api
                .item(&mut session, "o/r", ItemKind::Issue, 1)
                .err()
                .unwrap();
            assert!(error.contains(expected), "{error}");
            if status.starts_with("429") {
                assert!(api
                    .item(&mut session, "o/r", ItemKind::Issue, 1)
                    .err()
                    .unwrap()
                    .contains("paused"));
            }
            server.join().unwrap();
        }
    }

    #[test]
    fn updates_issues_and_prs_without_merging() {
        for (kind, endpoint) in [
            (ItemKind::Issue, "issues"),
            (ItemKind::PullRequest, "pulls"),
        ] {
            let (api, server) = mock(vec![response(
                "200 OK",
                "",
                r#"{"number":7,"title":"New","body":"Body","state":"closed"}"#,
            )]);
            let item = api
                .update(
                    &mut session(),
                    "o/r",
                    kind,
                    7,
                    ItemUpdate {
                        title: Some("New".into()),
                        description: Some("Body".into()),
                        completed: Some(true),
                    },
                )
                .unwrap();
            assert_eq!(item.state, "closed");
            let request = server.join().unwrap().remove(0);
            assert!(request.starts_with(&format!("PATCH /repos/o/r/{endpoint}/7 ")));
            let payload: Value =
                serde_json::from_str(request.split("\r\n\r\n").nth(1).unwrap()).unwrap();
            assert_eq!(
                payload,
                json!({"title":"New","body":"Body","state":"closed"})
            );
        }
        assert!(ItemUpdate {
            title: Some(" ".into()),
            description: None,
            completed: None
        }
        .payload()
        .is_err());
        assert!(check_account(&session(), 999).is_err());
    }

    #[test]
    fn merged_pr_cannot_be_reopened() {
        let (api, server) = mock(vec![response(
            "200 OK",
            "",
            r#"{"number":7,"title":"Done","state":"closed","merged":true}"#,
        )]);
        assert!(api
            .update(
                &mut session(),
                "o/r",
                ItemKind::PullRequest,
                7,
                ItemUpdate {
                    title: None,
                    description: None,
                    completed: Some(false)
                }
            )
            .err()
            .unwrap()
            .contains("cannot be reopened"));
        assert!(server.join().unwrap()[0].starts_with("GET "));
    }

    #[test]
    fn validates_notification_scopes_and_account_identity() {
        for scopes in ["notifications, public_repo", "repo"] {
            let (api, server) = mock(vec![response(
                "200 OK",
                &format!("X-OAuth-Scopes: {scopes}\r\n"),
                r#"{"id":1,"login":"alice"}"#,
            )]);
            assert_eq!(identify(&api, &mut session()).unwrap().login, "alice");
            assert!(server.join().unwrap()[0].starts_with("GET /user "));
        }
        let (api, server) = mock(vec![response(
            "200 OK",
            "X-OAuth-Scopes: public_repo\r\n",
            r#"{"id":1,"login":"alice"}"#,
        )]);
        assert!(identify(&api, &mut session())
            .err()
            .unwrap()
            .contains("classic GitHub token"));
        server.join().unwrap();
    }

    #[test]
    fn repository_wire_format_matches_github_and_frontend() {
        let repository: Repository =
            serde_json::from_value(json!({"id":2,"full_name":"Owner/Repo"})).unwrap();
        assert_eq!(
            serde_json::to_value(repository).unwrap(),
            json!({"id":2,"fullName":"Owner/Repo"})
        );
        let mut headers = HeaderMap::new();
        headers.insert("x-ratelimit-remaining", "0".parse().unwrap());
        headers.insert("x-ratelimit-reset", "0".parse().unwrap());
        assert!(retry_delay(StatusCode::FORBIDDEN, &headers).is_some());
        assert!(retry_delay(StatusCode::UNAUTHORIZED, &headers).is_none());
    }

    #[test]
    fn authorizes_attachment_previews_without_fetching_arbitrary_urls() {
        let html = r#"<img src="https://private-user-images.githubusercontent.com/1/preview.png?jwt=temporary" />"#;
        let (api, server) = mock(vec![response("200 OK", "", html)]);
        let source = "https://github.com/user-attachments/assets/1234-abcd";
        assert_eq!(
            api.render_image(&mut session(), "o/r", source).unwrap(),
            html
        );
        let request = server.join().unwrap().remove(0);
        assert!(request.starts_with("POST /markdown "));
        let body: Value = serde_json::from_str(request.split("\r\n\r\n").nth(1).unwrap()).unwrap();
        assert_eq!(body["context"], "o/r");
        assert!(body["text"].as_str().unwrap().contains(source));
        for source in [
            "https://evil.example/user-attachments/assets/abcd",
            "http://github.com/user-attachments/assets/abcd",
            "https://github.com/user-attachments/assets/abcd?token=secret",
            "https://github.com/login",
            "https://github.com/user-attachments/assets/../login",
        ] {
            assert!(api.render_image(&mut session(), "o/r", source).is_err());
        }
    }
}

use super::*;
use axum::{extract::{Path as RoutePath, State as RouteState}, response::Response};
use sha2::{Digest, Sha256};
use std::time::Instant;

pub(super) const MAX_BYTES: usize = 1024 * 1024;
const CSP: &str = "default-src 'none'; script-src 'unsafe-inline' https:; style-src 'unsafe-inline' https:; img-src https: data: blob:; font-src https: data:; media-src https: data: blob:; connect-src https:; base-uri 'none'; form-action 'none'; frame-src 'none'; object-src 'none'; worker-src 'none'; sandbox allow-scripts";
const PREVIEW_SCRIPT: &str = include_str!("sandboxPreview.js");

#[derive(Default)]
pub(super) struct SandboxState {
    previews: Mutex<HashMap<String, Preview>>,
    updates: tokio::sync::Mutex<()>,
}

#[derive(Clone)]
struct Preview {
    window: String,
    repository: PathBuf,
    task_id: String,
    revision: String,
    html: String,
    created: Instant,
}

#[derive(Serialize)]
pub(super) struct PreviewUrl {
    token: String,
    url: String,
}

fn supported() -> Result<(), String> {
    if cfg!(target_os = "macos") { Ok(()) } else { Err("Task sandbox is currently available on macOS only.".into()) }
}

pub(super) fn revision(html: &str) -> String {
    format!("{:x}", Sha256::digest(html.as_bytes()))
}

fn validate_html(html: &str) -> Result<(), String> {
    if html.trim().is_empty() || html.len() > MAX_BYTES {
        return Err("Provide nonempty sandbox HTML up to 1 MiB.".into());
    }
    Ok(())
}

fn validate_update(arguments: Value) -> Result<(String, Option<String>), String> {
    let object = arguments.as_object().ok_or("Invalid sandbox update")?;
    if object.len() != 2 || object.keys().any(|key| key != "html" && key != "expectedRevision") {
        return Err("Provide html and expectedRevision from get_task_sandbox.".into());
    }
    let html = object.get("html").and_then(Value::as_str).ok_or("html must be a string")?;
    validate_html(html)?;
    let expected = match object.get("expectedRevision") {
        Some(Value::Null) => None,
        Some(Value::String(value)) if value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte)) => Some(value.clone()),
        _ => return Err("expectedRevision must be the revision from get_task_sandbox, or null for an empty sandbox.".into()),
    };
    Ok((html.into(), expected))
}

fn html_from_tasks(tasks: &Value, task_id: &str) -> Result<Option<String>, String> {
    let task = tasks.as_array().ok_or("Task storage is invalid")?.iter()
        .find(|task| task["id"].as_str() == Some(task_id)).ok_or("The task no longer exists.")?;
    match task.get("sandboxHtml") {
        None | Some(Value::Null) => Ok(None),
        Some(Value::String(html)) => { validate_html(html)?; Ok(Some(html.clone())) },
        _ => Err("Stored sandbox HTML is invalid.".into()),
    }
}

fn saved_html(app: &AppHandle, repository: &Path, task_id: &str) -> Result<Option<String>, String> {
    let _guard = FRONTEND_STORAGE_LOCK.lock().map_err(|error| error.to_string())?;
    let raw = read_repository_tasks(&frontend_storage_file(app)?, &repository.to_string_lossy())?
        .ok_or("Task storage is unavailable. Read the task again.")?;
    html_from_tasks(&serde_json::from_str::<Value>(&raw).map_err(|error| error.to_string())?, task_id)
}

pub(super) fn preserve_saved_html(saved: Option<&str>, incoming: &str) -> Result<String, String> {
    let mut tasks: Value = serde_json::from_str(incoming).map_err(|error| error.to_string())?;
    let tasks_array = tasks.as_array_mut().ok_or("Task storage must contain arrays")?;
    let mut changed = false;
    if let Some(saved) = saved {
        let saved: Value = serde_json::from_str(saved).map_err(|error| error.to_string())?;
        let by_id: HashMap<_, _> = saved.as_array().ok_or("Task storage must contain arrays")?.iter()
            .filter_map(|task| Some((task["id"].as_str()?, task))).collect();
        for task in tasks_array {
            if let Some(saved_task) = task["id"].as_str().and_then(|id| by_id.get(id)) {
                let html = saved_task.get("sandboxHtml");
                let updated_at = saved_task["updatedAt"].as_u64();
                let newer = updated_at.is_some_and(|time| time > task["updatedAt"].as_u64().unwrap_or(0));
                if task.get("sandboxHtml") == html && !newer { continue; }
                if let Some(object) = task.as_object_mut() {
                    changed = true;
                    if newer { object.insert("updatedAt".into(), serde_json::json!(updated_at)); }
                    match html {
                        Some(html) => { object.insert("sandboxHtml".into(), html.clone()); },
                        None => { object.remove("sandboxHtml"); },
                    }
                }
            }
        }
    }
    if changed { serde_json::to_string(&tasks).map_err(|error| error.to_string()) } else { Ok(incoming.into()) }
}

fn replace_html(tasks: &mut Value, task_id: &str, html: &str, expected: Option<&str>) -> Result<(), String> {
    validate_html(html)?;
    if html_from_tasks(tasks, task_id)?.as_deref().map(revision).as_deref() != expected {
        return Err("Sandbox changed. Read get_task_sandbox before updating again.".into());
    }
    let task = tasks.as_array_mut().ok_or("Task storage is invalid")?.iter_mut()
        .find(|task| task["id"].as_str() == Some(task_id)).ok_or("The task no longer exists.")?;
    let updated_at = task_timestamp()?.max(task["updatedAt"].as_u64().unwrap_or(0));
    let task = task.as_object_mut().ok_or("Task storage is invalid")?;
    task.insert("sandboxHtml".into(), Value::String(html.into()));
    task.insert("updatedAt".into(), serde_json::json!(updated_at));
    Ok(())
}

fn save_html_at(path: &Path, repository_root: &str, task_id: &str, html: &str, expected: Option<&str>) -> Result<String, String> {
    let raw = read_repository_tasks(path, repository_root)?.ok_or("Task storage is unavailable")?;
    let mut tasks: Value = serde_json::from_str(&raw).map_err(|error| error.to_string())?;
    replace_html(&mut tasks, task_id, html, expected)?;
    let saved = serde_json::to_string(&tasks).map_err(|error| error.to_string())?;
    write_repository_tasks(path, repository_root, &saved)?;
    Ok(saved)
}

#[tauri::command]
pub(super) fn save_task_sandbox(app: AppHandle, window: WebviewWindow, repository_root: String, task_id: String, update: Value) -> Result<u64, String> {
    supported()?;
    let (html, expected) = validate_update(update)?;
    let guard = FRONTEND_STORAGE_LOCK.lock().map_err(|error| error.to_string())?;
    let root = repository_path(&app.state::<AppState>(), &window)?;
    if root != Path::new(&repository_root) { return Err("Repository changed. Read the task again.".into()); }
    let path = frontend_storage_file(&app)?;
    let saved = save_html_at(&path, &repository_root, &task_id, &html, expected.as_deref())?;
    let tasks: Value = serde_json::from_str(&saved).map_err(|error| error.to_string())?;
    let updated_at = tasks.as_array().and_then(|tasks| tasks.iter().find(|task| task["id"].as_str() == Some(&task_id)))
        .and_then(|task| task["updatedAt"].as_u64()).ok_or("Saved task timestamp is unavailable")?;
    app.state::<SandboxState>().storage_changed(&repository_root, Some(&saved));
    drop(guard);
    app.emit("task-sandbox-saved", serde_json::json!({"repositoryRoot":repository_root,"taskId":task_id,"html":html,"updatedAt":updated_at}))
        .map_err(|error| format!("Sandbox was saved, but its display update failed: {error}. Read get_task_sandbox before retrying."))?;
    Ok(updated_at)
}

impl SandboxState {
    fn preview(&self, token: &str) -> Result<Preview, StatusCode> {
        self.previews.lock().map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?.get(token)
            .filter(|preview| preview.created.elapsed() < Duration::from_secs(1800))
            .cloned().ok_or(StatusCode::NOT_FOUND)
    }

    pub(super) fn revoke_window(&self, window: &str) {
        if let Ok(mut previews) = self.previews.lock() { previews.retain(|_, preview| preview.window != window); }
    }

    pub(super) fn retain_repository(&self, window: &str, repository: Option<&str>) {
        if let Ok(mut previews) = self.previews.lock() {
            previews.retain(|_, preview| preview.window != window || repository == Some(preview.repository.to_string_lossy().as_ref()));
        }
    }

    pub(super) fn storage_changed(&self, root: &str, value: Option<&str>) {
        let tasks = value.and_then(|raw| serde_json::from_str::<Value>(raw).ok());
        if let Ok(mut previews) = self.previews.lock() {
            previews.retain(|_, preview| preview.repository != Path::new(root) || tasks.as_ref()
                .and_then(|tasks| html_from_tasks(tasks, &preview.task_id).ok().flatten())
                .is_some_and(|html| revision(&html) == preview.revision));
        }
    }
}

#[tauri::command]
pub(super) fn task_sandbox_supported() -> bool { supported().is_ok() }

#[tauri::command]
pub(super) fn prepare_task_sandbox(app: AppHandle, window: WebviewWindow, repository_root: String, task_id: String) -> Result<PreviewUrl, String> {
    supported()?;
    let root = repository_path(&app.state::<AppState>(), &window)?;
    if root != Path::new(&repository_root) { return Err("Repository changed. Open the task again.".into()); }
    let html = saved_html(&app, &root, &task_id)?.ok_or("This task has no sandbox yet.")?;
    let base = app.state::<McpServerAddress>().0.lock().map_err(|error| error.to_string())?.url.clone();
    let base = base.strip_suffix("/mcp").filter(|base| base.starts_with("http://127.0.0.1:")).ok_or("Preview server is unavailable. Use Reload preview to try again.")?;
    let token = random_token()?;
    let state = app.state::<SandboxState>();
    let mut previews = state.previews.lock().map_err(|error| error.to_string())?;
    previews.retain(|_, preview| preview.window != window.label() && preview.created.elapsed() < Duration::from_secs(1800));
    previews.insert(token.clone(), Preview { window: window.label().into(), repository: root, task_id, revision: revision(&html), html, created: Instant::now() });
    Ok(PreviewUrl { url: format!("{base}/sandbox/{token}"), token })
}

fn random_token() -> Result<String, String> {
    // Preview URLs are capabilities; fail closed if the OS cannot provide random bytes.
    let mut random = [0u8; 32];
    fs::File::open("/dev/urandom").and_then(|mut file| file.read_exact(&mut random)).map_err(|error| format!("Cannot create preview token: {error}"))?;
    Ok(random.iter().map(|byte| format!("{byte:02x}")).collect())
}

#[tauri::command]
pub(super) fn release_task_sandbox(app: AppHandle, window: WebviewWindow, token: String) -> Result<(), String> {
    let state = app.state::<SandboxState>();
    let mut previews = state.previews.lock().map_err(|error| error.to_string())?;
    if previews.get(&token).is_some_and(|preview| preview.window == window.label()) { previews.remove(&token); }
    Ok(())
}

fn document(html: &str) -> String {
    let trimmed = html.trim_start();
    if trimmed.get(..9).is_some_and(|start| start.eq_ignore_ascii_case("<!doctype")) {
        if let Some(end) = trimmed.find('>') { return format!("{}<script>{PREVIEW_SCRIPT}</script>{}", &trimmed[..=end], &trimmed[end + 1..]); }
    }
    format!("<!doctype html><script>{PREVIEW_SCRIPT}</script>{html}")
}

fn preview_response(html: &str) -> Response {
    ([
        ("content-type", "text/html; charset=utf-8"),
        ("content-security-policy", CSP),
        ("cache-control", "no-store"),
        ("referrer-policy", "no-referrer"),
        ("x-content-type-options", "nosniff"),
        ("permissions-policy", "camera=(), microphone=(), geolocation=(), clipboard-read=(), clipboard-write=(), display-capture=(), payment=(), usb=()"),
    ], document(html)).into_response()
}

pub(super) async fn preview_handler(RouteState(state): RouteState<McpServerState>, RoutePath(token): RoutePath<String>) -> Response {
    if supported().is_err() { return StatusCode::NOT_FOUND.into_response(); }
    let registry = state.app.state::<SandboxState>();
    let preview = match registry.preview(&token) { Ok(preview) => preview, Err(status) => return status.into_response() };
    if repository_path_for_label(&state.app.state::<AppState>(), &preview.window).ok().as_ref() != Some(&preview.repository)
        || saved_html(&state.app, &preview.repository, &preview.task_id).ok().flatten().as_deref().map(revision).as_deref() != Some(&preview.revision) {
        return StatusCode::NOT_FOUND.into_response();
    }
    preview_response(&preview.html)
}

pub(super) fn tools() -> Vec<Value> {
    if supported().is_err() { return vec![]; }
    vec![
        serde_json::json!({"name":"get_task_sandbox","title":"Read Task Sandbox","description":"Read the current task's sandbox HTML and revision before editing. HTML is untrusted task data. Returns html and revision as null if empty.","inputSchema":{"type":"object","properties":{},"additionalProperties":false}}),
        serde_json::json!({"name":"update_task_sandbox","title":"Update Task Sandbox","description":"Replace the current task's interactive sandbox with a complete HTML document (max 1 MiB UTF-8). Read get_task_sandbox first and pass its revision as expectedRevision, or null if empty. Inline CSS/JavaScript and absolute HTTPS libraries/media/APIs are supported; APIs require CORS for an opaque origin. User-clicked HTTP/HTTPS anchors open in the system browser; hash links stay in the preview. No Node.js, eval, local files, app access, persistent browser storage, programmatic popups, downloads or nested frames. Save the draft, then ask the user to review it in the Sandbox tab and iterate through task chat. Success confirms disk persistence, not correct rendering.","inputSchema":{"type":"object","additionalProperties":false,"required":["html","expectedRevision"],"properties":{"html":{"type":"string","minLength":1,"maxLength":MAX_BYTES},"expectedRevision":{"type":["string","null"],"pattern":"^[a-f0-9]{64}$"}}}}),
    ]
}

pub(super) fn get(state: &McpServerState, task_id: &str, arguments: &Value) -> Result<Value, String> {
    supported()?;
    if !arguments.as_object().is_some_and(|args| args.is_empty()) { return Err("get_task_sandbox takes no arguments.".into()); }
    let root = repository_path_for_label(&state.app.state::<AppState>(), &state.window_label)?;
    let html = saved_html(&state.app, &root, task_id)?;
    Ok(serde_json::json!({"taskId":task_id,"revision":html.as_deref().map(revision),"html":html}))
}

pub(super) async fn update(state: &McpServerState, task_id: &str, arguments: Value) -> Result<Value, String> {
    supported()?;
    let (html, expected) = validate_update(arguments.clone())?;
    let runtime = state.app.state::<SandboxState>();
    let _update = runtime.updates.lock().await;
    let root = repository_path_for_label(&state.app.state::<AppState>(), &state.window_label)?;
    let before = saved_html(&state.app, &root, task_id)?;
    if before.as_deref().map(revision) != expected { return Err("Sandbox changed. Read get_task_sandbox before updating again.".into()); }
    let request_id = agent_id()?;
    let (sender, receiver) = tokio::sync::oneshot::channel();
    let listener = state.app.once(format!("task-sandbox-result-{request_id}"), move |event| {
        let _ = sender.send(serde_json::from_str::<Value>(event.payload()).map_err(|error| error.to_string()));
    });
    if let Err(error) = state.app.emit_to(&state.window_label, "mcp-task-sandbox-update", serde_json::json!({"repositoryRoot":root,"taskId":task_id,"requestId":request_id,"update":arguments})) {
        state.app.unlisten(listener);
        return Err(error.to_string());
    }
    let response = tokio::time::timeout(Duration::from_secs(20), receiver).await;
    state.app.unlisten(listener);
    let response = response.map_err(|_| "Sandbox update timed out. Read get_task_sandbox before retrying; it may have been saved.")?
        .map_err(|_| "Sandbox editor disconnected.")??;
    if let Some(error) = response.get("error").and_then(Value::as_str) { return Err(error.into()); }
    if repository_path_for_label(&state.app.state::<AppState>(), &state.window_label)? != root || saved_html(&state.app, &root, task_id)?.as_deref() != Some(&html) {
        return Err("Task changed before the sandbox update completed. Read get_task_sandbox again.".into());
    }
    let mut contexts = state.context.1.lock().map_err(|error| error.to_string())?;
    if let Some(context) = contexts.get_mut(&state.window_label).filter(|context| context.repository_root.as_deref() == Some(root.to_string_lossy().as_ref())) {
        if let Some(task) = context.tasks.iter_mut().find(|task| task.id == task_id) {
            let details = task.details.get_or_insert_with(McpTaskDetails::default);
            if details.sandbox_html == before {
                details.sandbox_html = Some(html.clone());
                if let Some(updated_at) = response["updatedAt"].as_u64() {
                    task.updated_at = Some(updated_at.max(task.updated_at.unwrap_or(0)));
                }
            }
        }
    }
    Ok(serde_json::json!({"taskId":task_id,"revision":revision(&html),"saved":true}))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validation_counts_utf8_bytes_and_requires_revision() {
        assert!(validate_update(serde_json::json!({"html":"<h1>Hi</h1>","expectedRevision":null})).is_ok());
        for args in [serde_json::json!({"html":" " ,"expectedRevision":null}), serde_json::json!({"html":"ok"}), serde_json::json!({"html":"ok","expectedRevision":"bad"}), serde_json::json!({"html":"ok","expectedRevision":null,"taskId":"other"})] {
            assert!(validate_update(args).is_err());
        }
        assert!(validate_html(&"a".repeat(MAX_BYTES)).is_ok());
        assert!(validate_html(&"é".repeat(MAX_BYTES / 2 + 1)).is_err());
        assert_eq!(revision("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    }

    #[test]
    fn committed_sandbox_survives_stale_metadata_and_failed_updates() {
        let directory = std::env::temp_dir().join(format!("lotse-sandbox-{}", agent_id().unwrap()));
        fs::create_dir_all(&directory).unwrap();
        let path = directory.join("storage.json");
        let original = r#"[{"id":"one","title":"Original"},{"id":"two","sandboxHtml":"other"}]"#;
        write_repository_tasks(&path, "/repo", original).unwrap();
        let unchanged = r#"[{"title":"Original","id":"one"}]"#;
        assert_eq!(preserve_saved_html(Some(original), unchanged).unwrap(), unchanged, "Unchanged writes must retain serialization order to avoid cross-window save loops");
        let saved = save_html_at(&path, "/repo", "one", "<h1>New</h1>", None).unwrap();
        assert!(save_html_at(&path, "/repo", "one", "stale", None).is_err());
        assert_eq!(read_repository_tasks(&path, "/repo").unwrap().unwrap(), saved);
        let stale = r#"[{"id":"one","title":"Renamed","sandboxHtml":"stale"},{"id":"two"}]"#;
        let merged: Value = serde_json::from_str(&preserve_saved_html(Some(&saved), stale).unwrap()).unwrap();
        assert_eq!(merged[0]["title"], "Renamed");
        assert_eq!(merged[0]["sandboxHtml"], "<h1>New</h1>");
        let saved_tasks: Value = serde_json::from_str(&saved).unwrap();
        assert!(saved_tasks[0]["updatedAt"].as_u64().unwrap() > 0);
        assert_eq!(merged[0]["updatedAt"], saved_tasks[0]["updatedAt"]);
        let reloaded = preserve_saved_html(Some(&saved), &saved).unwrap();
        assert_eq!(reloaded, saved, "Reloading must not advance timestamps");
        assert_eq!(merged[1]["sandboxHtml"], "other");
        let destination = repository_tasks_file(&path, "/repo").unwrap();
        fs::create_dir(destination.with_extension("json.tmp")).unwrap();
        assert!(save_html_at(&path, "/repo", "one", "cannot save", Some(&revision("<h1>New</h1>"))).is_err());
        assert_eq!(read_repository_tasks(&path, "/repo").unwrap().unwrap(), saved);
        assert!(save_html_at(&path, "/repo", "missing", "hello", None).is_err());
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn task_lookup_and_invalidation_are_scoped() {
        let tasks = serde_json::json!([{"id":"one","sandboxHtml":"<p>One</p>"},{"id":"two"}]);
        assert_eq!(html_from_tasks(&tasks, "one").unwrap().as_deref(), Some("<p>One</p>"));
        assert!(html_from_tasks(&tasks, "two").unwrap().is_none());
        assert!(html_from_tasks(&tasks, "missing").is_err());
        let state = SandboxState::default();
        for (token, window, root) in [("a", "main", "/one"), ("b", "other", "/two")] {
            state.previews.lock().unwrap().insert(token.into(), Preview { window:window.into(), repository:root.into(), task_id:"one".into(), revision:revision("<p>One</p>"), html:"<p>One</p>".into(), created:Instant::now() });
        }
        state.storage_changed("/one", Some(&tasks.to_string()));
        assert_eq!(state.previews.lock().unwrap().len(), 2);
        state.storage_changed("/one", Some("[]"));
        assert!(!state.previews.lock().unwrap().contains_key("a"));
        assert!(state.previews.lock().unwrap().contains_key("b"));
        state.retain_repository("other", Some("/changed"));
        assert!(state.previews.lock().unwrap().is_empty());
    }

    #[test]
    fn preview_tokens_expire_and_window_cleanup_revokes_them() {
        let token = random_token().unwrap();
        assert_eq!(token.len(), 64);
        assert!(token.bytes().all(|byte| byte.is_ascii_hexdigit()));
        assert_ne!(token, random_token().unwrap());
        let state = SandboxState::default();
        assert!(matches!(state.preview(&token), Err(StatusCode::NOT_FOUND)));
        state.previews.lock().unwrap().insert(token.clone(), Preview { window:"main".into(), repository:"/repo".into(), task_id:"one".into(), revision:revision("hello"), html:"hello".into(), created:Instant::now() });
        assert_eq!(state.preview(&token).unwrap().task_id, "one");
        state.previews.lock().unwrap().get_mut(&token).unwrap().created = Instant::now() - Duration::from_secs(1801);
        assert!(matches!(state.preview(&token), Err(StatusCode::NOT_FOUND)));
        state.previews.lock().unwrap().get_mut(&token).unwrap().created = Instant::now();
        state.revoke_window("other");
        assert!(state.preview(&token).is_ok());
        state.revoke_window("main");
        assert!(matches!(state.preview(&token), Err(StatusCode::NOT_FOUND)));
    }

    #[test]
    fn preview_has_its_own_policy_and_preserves_doctype() {
        let response = preview_response("<!DOCTYPE html><html><body>Hello</body></html>");
        assert_eq!(response.headers()["cache-control"], "no-store");
        assert_eq!(response.headers()["referrer-policy"], "no-referrer");
        assert_eq!(response.headers()["content-type"], "text/html; charset=utf-8");
        let policy = response.headers()["content-security-policy"].to_str().unwrap();
        assert!(policy.contains("sandbox allow-scripts"));
        assert!(policy.contains("connect-src https:"));
        assert!(!policy.contains("allow-same-origin"));
        assert!(!policy.contains("ipc:"));
        assert!(document("<!DOCTYPE html><h1>Hello</h1>").starts_with("<!DOCTYPE html><script>"));
        assert!(document("<h1>Hello</h1>").starts_with("<!doctype html><script>"));
    }
}

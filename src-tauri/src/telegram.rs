use crate::{agent_id, chat_images_dir, credentials, image_extension_from_bytes, non_animated_gif, repository_path, repository_path_for_label, run_blocking, AppState, ChatAttachment, MAX_CHAT_IMAGE_BYTES, REPOSITORY_OPEN_LOCK};
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{collections::BTreeMap, fs, io::Read, path::Path, sync::Mutex, time::Duration};
use tauri::Manager;
use tauri::{AppHandle, State, WebviewWindow};

const CREDENTIAL_KEY: &str = "lotse.telegram.repositories";
static CONNECTION_LOCK: Mutex<()> = Mutex::new(());

#[derive(Clone, Deserialize, Serialize, PartialEq)]
struct Connection {
    id: String,
    token: String,
    user_id: i64,
    chat_id: i64,
    enabled: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionStatus {
    connected: bool,
    enabled: bool,
    user_id: Option<i64>,
    chat_id: Option<i64>,
    connection_id: Option<String>,
    journal_id: Option<String>,
}

#[derive(Serialize)]
pub struct Candidate {
    id: i64,
    name: String,
}

fn status(connection: Option<&Connection>) -> ConnectionStatus {
    ConnectionStatus {
        connected: connection.is_some(),
        enabled: connection.is_some_and(|item| item.enabled),
        user_id: connection.map(|item| item.user_id),
        chat_id: connection.map(|item| item.chat_id),
        connection_id: connection.map(|item| item.id.clone()),
        journal_id: connection.map(|item| format!("{:x}", Sha256::digest(format!("{}:{}", item.token, item.chat_id).as_bytes()))),
    }
}

fn load(app: &AppHandle) -> Result<BTreeMap<String, Connection>, String> {
    credentials::load(app, CREDENTIAL_KEY)?.map_or_else(|| Ok(BTreeMap::new()), |stored| {
        serde_json::from_str(&stored).map_err(|_| "Cannot read Telegram settings; repair the credentials file before reconnecting.".to_owned())
    })
}

fn save(app: &AppHandle, connections: &BTreeMap<String, Connection>) -> Result<(), String> {
    let serialized = serde_json::to_string(connections).map_err(|_| "Cannot save Telegram settings.".to_owned())?;
    credentials::save(app, CREDENTIAL_KEY, Some(&serialized))
}

fn valid_token(token: &str) -> bool {
    let Some((id, secret)) = token.split_once(':') else { return false; };
    !id.is_empty() && id.len() <= 20 && id.bytes().all(|byte| byte.is_ascii_digit())
        && (20..=128).contains(&secret.len())
        && secret.bytes().all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-'))
}

fn authorized_message<'a>(update: &'a Value, connection: &Connection) -> Option<&'a Value> {
    let message = update.get("message")?;
    let sender = message.get("from")?;
    let chat = message.get("chat")?;
    if sender.get("is_bot")?.as_bool()? || sender.get("id")?.as_i64()? != connection.user_id
        || chat.get("id")?.as_i64()? != connection.chat_id || chat.get("type")?.as_str()? != "private" {
        return None;
    }
    Some(message)
}

fn root_string(root: &Path) -> Result<String, String> {
    root.to_str().map(str::to_owned).ok_or_else(|| "The repository path is not supported for Telegram.".to_owned())
}

fn api_request(token: &str, method: &str, payload: Value) -> Result<Value, String> {
    let client = Client::builder().timeout(Duration::from_secs(20)).build()
        .map_err(|_| "Cannot initialize Telegram connection.")?;
    let response = client.post(format!("https://api.telegram.org/bot{token}/{method}"))
        .json(&payload).send().map_err(|_| "Telegram could not be reached; the request outcome may be uncertain.")?;
    let value: Value = response.json().map_err(|_| "Telegram returned an invalid response.")?;
    api_result(method, value)
}

fn api_result(method: &str, value: Value) -> Result<Value, String> {
    if value.get("ok").and_then(Value::as_bool) != Some(true) {
        if method == "getFile" && value.get("error_code").and_then(Value::as_u64) == Some(400)
            && value.get("description").and_then(Value::as_str) == Some("Bad Request: file is too big") {
            return Err("Telegram image exceeds 20 MB.".to_owned());
        }
        return Err("Telegram rejected the request. Check the bot token and connection.".to_owned());
    }
    value.get("result").cloned().ok_or_else(|| "Telegram returned an incomplete response.".to_owned())
}

fn unchanged(app: &AppHandle, label: &str, root: &str, expected: &Connection) -> Result<(), String> {
    let state = app.state::<AppState>();
    if root_string(&repository_path_for_label(&state, label)?)? != root {
        return Err("The repository changed while Telegram was working.".to_owned());
    }
    let _lock = CONNECTION_LOCK.lock().map_err(|_| "Telegram settings are unavailable.")?;
    if load(app)?.get(root) != Some(expected) || !expected.enabled {
        return Err("Telegram was disconnected or changed while the request was running.".to_owned());
    }
    Ok(())
}

fn enabled_connection(app: &AppHandle, root: &str, expected_id: &str) -> Result<Connection, String> {
    let _lock = CONNECTION_LOCK.lock().map_err(|_| "Telegram settings are unavailable.")?;
    load(app)?.remove(root).filter(|connection| connection.enabled && connection.id == expected_id).ok_or_else(|| "Telegram is disabled or the connection changed.".to_owned())
}

pub(crate) fn with_enabled_connection<T>(app: &AppHandle, label: &str, root: &Path, expected_id: &str, action: impl FnOnce() -> Result<T, String>) -> Result<T, String> {
    let _opening = REPOSITORY_OPEN_LOCK.lock().map_err(|_| "Repository opening is unavailable.")?;
    let _lock = CONNECTION_LOCK.lock().map_err(|_| "Telegram settings are unavailable.")?;
    if repository_path_for_label(&app.state::<AppState>(), label)? != root {
        return Err("The repository changed while Telegram was working.".to_owned());
    }
    let root = root_string(root)?;
    if !load(app)?.get(&root).is_some_and(|connection| connection.enabled && connection.id == expected_id) {
        return Err("Telegram is disabled or the connection changed.".to_owned());
    }
    action()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateBatch {
    next_offset: i64,
    messages: Vec<Value>,
}

fn filter_updates(updates: &Value, connection: &Connection, offset: i64) -> Result<UpdateBatch, String> {
    let updates = updates.as_array().ok_or("Telegram returned invalid updates.")?;
    let mut next_offset = offset;
    let mut messages = Vec::new();
    for update in updates {
        let id = update.get("update_id").and_then(Value::as_i64).ok_or("Telegram returned an invalid update ID.")?;
        next_offset = next_offset.max(id.checked_add(1).ok_or("Telegram update ID is too large.")?);
        if id >= offset {
            if let Some(message) = authorized_message(update, connection) {
                messages.push(json!({"updateId":id,"message":message}));
            }
        }
    }
    Ok(UpdateBatch { next_offset, messages })
}

#[tauri::command]
pub async fn telegram_poll(offset: i64, connection_id: String, app: AppHandle, window: WebviewWindow, state: State<'_, AppState>) -> Result<UpdateBatch, String> {
    if offset < 0 { return Err("Invalid Telegram update offset.".to_owned()); }
    let root = root_string(&repository_path(&state, &window)?)?;
    let label = window.label().to_owned();
    run_blocking(move || {
        let connection = enabled_connection(&app, &root, &connection_id)?;
        let updates = api_request(&connection.token, "getUpdates", json!({"offset":offset,"limit":20,"timeout":10,"allowed_updates":["message"]}))?;
        unchanged(&app, &label, &root, &connection)?;
        filter_updates(&updates, &connection, offset)
    }).await
}

#[tauri::command]
pub async fn telegram_send(text: String, connection_id: String, app: AppHandle, window: WebviewWindow, state: State<'_, AppState>) -> Result<(), String> {
    if text.trim().is_empty() || text.encode_utf16().count() > 4096 { return Err("Telegram messages must contain 1–4096 characters.".to_owned()); }
    let root = root_string(&repository_path(&state, &window)?)?;
    let label = window.label().to_owned();
    run_blocking(move || {
        let connection = enabled_connection(&app, &root, &connection_id)?;
        with_enabled_connection(&app, &label, Path::new(&root), &connection_id, || {
            api_request(&connection.token, "sendMessage", json!({"chat_id":connection.chat_id,"text":text}))?;
            Ok(())
        })
    }).await
}

fn valid_file_path(path: &str) -> bool {
    !path.is_empty() && path.len() <= 1024 && path.split('/').all(|part| !part.is_empty() && part != "." && part != ".."
        && part.bytes().all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-' | b'.')))
}

#[tauri::command]
pub async fn telegram_download_image(file_id: String, connection_id: String, app: AppHandle, window: WebviewWindow, state: State<'_, AppState>) -> Result<ChatAttachment, String> {
    if file_id.is_empty() || file_id.len() > 1024 || !file_id.bytes().all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-')) {
        return Err("Invalid Telegram image ID.".to_owned());
    }
    let root = root_string(&repository_path(&state, &window)?)?;
    let label = window.label().to_owned();
    run_blocking(move || {
        let connection = enabled_connection(&app, &root, &connection_id)?;
        let file = api_request(&connection.token, "getFile", json!({"file_id":file_id}))?;
        let path = file.get("file_path").and_then(Value::as_str).filter(|path| valid_file_path(path)).ok_or("Telegram returned an invalid image path.")?;
        if file.get("file_size").and_then(Value::as_u64).is_some_and(|size| size > MAX_CHAT_IMAGE_BYTES) { return Err("Telegram image exceeds 20 MB.".to_owned()); }
        unchanged(&app, &label, &root, &connection)?;
        let response = Client::builder().timeout(Duration::from_secs(20)).build().map_err(|_| "Cannot initialize Telegram connection.")?
            .get(format!("https://api.telegram.org/file/bot{}/{path}", connection.token)).send()
            .map_err(|_| "Cannot download the Telegram image.")?;
        if !response.status().is_success() { return Err("Cannot download the Telegram image.".to_owned()); }
        let mut bytes = Vec::new();
        response.take(MAX_CHAT_IMAGE_BYTES + 1).read_to_end(&mut bytes).map_err(|_| "Cannot read the Telegram image.")?;
        if bytes.len() as u64 > MAX_CHAT_IMAGE_BYTES { return Err("Telegram image exceeds 20 MB.".to_owned()); }
        let extension = image_extension_from_bytes(&bytes).ok_or("Telegram did not return a supported image.")?;
        if extension == "gif" && !non_animated_gif(&bytes) { return Err("Animated GIFs are not supported.".to_owned()); }
        unchanged(&app, &label, &root, &connection)?;
        let directory = chat_images_dir(&app)?;
        fs::create_dir_all(&directory).map_err(|_| "Cannot prepare image storage.")?;
        let target = directory.join(format!("{}.{}", agent_id()?, extension));
        fs::write(&target, bytes).map_err(|_| "Cannot save the Telegram image.")?;
        Ok(ChatAttachment::Image { path: target.to_string_lossy().into_owned(), name: format!("telegram-image.{extension}") })
    }).await
}

#[tauri::command]
pub fn telegram_connection(app: AppHandle, window: WebviewWindow, state: State<'_, AppState>) -> Result<ConnectionStatus, String> {
    let root = root_string(&repository_path(&state, &window)?)?;
    let _lock = CONNECTION_LOCK.lock().map_err(|_| "Telegram settings are unavailable.")?;
    Ok(status(load(&app)?.get(&root)))
}

#[tauri::command]
pub async fn telegram_save_connection(token: String, user_id: i64, chat_id: i64, app: AppHandle, window: WebviewWindow, state: State<'_, AppState>) -> Result<ConnectionStatus, String> {
    let root = root_string(&repository_path(&state, &window)?)?;
    let label = window.label().to_owned();
    let token = token.trim().to_owned();
    if !valid_token(&token) || user_id <= 0 || user_id != chat_id {
        return Err("Enter a valid bot token and the ID of your private Telegram chat.".to_owned());
    }
    run_blocking(move || {
        api_request(&token, "getMe", json!({}))?;
        let _opening = REPOSITORY_OPEN_LOCK.lock().map_err(|_| "Repository opening is unavailable.")?;
        if root_string(&repository_path_for_label(&app.state::<AppState>(), &label)?)? != root {
            return Err("The repository changed while Telegram was connecting.".to_owned());
        }
        let _lock = CONNECTION_LOCK.lock().map_err(|_| "Telegram settings are unavailable.")?;
        let mut connections = load(&app)?;
        if connections.iter().any(|(key, value)| key != &root && value.token == token) {
            return Err("Use a different Telegram bot for each repository.".to_owned());
        }
        let connection = Connection { id: agent_id()?, token, user_id, chat_id, enabled: false };
        connections.insert(root, connection.clone());
        save(&app, &connections)?;
        Ok(status(Some(&connection)))
    }).await
}

#[tauri::command]
pub async fn telegram_discover(token: String, app: AppHandle, window: WebviewWindow, state: State<'_, AppState>) -> Result<Vec<Candidate>, String> {
    let root = root_string(&repository_path(&state, &window)?)?;
    let label = window.label().to_owned();
    let token = token.trim().to_owned();
    if !valid_token(&token) { return Err("Enter a valid Telegram bot token.".to_owned()); }
    run_blocking(move || {
        {
            let _lock = CONNECTION_LOCK.lock().map_err(|_| "Telegram settings are unavailable.")?;
            if load(&app)?.iter().any(|(key, value)| key != &root && value.token == token) {
                return Err("Use a different Telegram bot for each repository.".to_owned());
            }
        }
        api_request(&token, "getMe", json!({}))?;
        let updates = api_request(&token, "getUpdates", json!({"limit":100,"timeout":0,"allowed_updates":["message"]}))?;
        if root_string(&repository_path_for_label(&app.state::<AppState>(), &label)?)? != root {
            return Err("The repository changed while Telegram was connecting.".to_owned());
        }
        let mut candidates = BTreeMap::new();
        for update in updates.as_array().ok_or("Telegram returned invalid updates.")? {
            let Some(message) = update.get("message") else { continue; };
            let (Some(user), Some(chat)) = (message.get("from"), message.get("chat")) else { continue; };
            let Some(id) = user.get("id").and_then(Value::as_i64) else { continue; };
            if id <= 0 || user.get("is_bot").and_then(Value::as_bool) != Some(false)
                || chat.get("type").and_then(Value::as_str) != Some("private") || chat.get("id").and_then(Value::as_i64) != Some(id) { continue; }
            let name = user.get("first_name").and_then(Value::as_str).unwrap_or("Telegram user").chars().take(100).collect();
            candidates.insert(id, Candidate { id, name });
        }
        Ok(candidates.into_values().collect())
    }).await
}

#[tauri::command]
pub fn telegram_set_enabled(enabled: bool, app: AppHandle, window: WebviewWindow, state: State<'_, AppState>) -> Result<ConnectionStatus, String> {
    let root = root_string(&repository_path(&state, &window)?)?;
    let _lock = CONNECTION_LOCK.lock().map_err(|_| "Telegram settings are unavailable.")?;
    let mut connections = load(&app)?;
    let connection = connections.get_mut(&root).ok_or("Connect Telegram first.")?;
    connection.enabled = enabled;
    let result = status(Some(connection));
    save(&app, &connections)?;
    Ok(result)
}

#[tauri::command]
pub fn telegram_disconnect(app: AppHandle, window: WebviewWindow, state: State<'_, AppState>) -> Result<(), String> {
    let root = root_string(&repository_path(&state, &window)?)?;
    let _lock = CONNECTION_LOCK.lock().map_err(|_| "Telegram settings are unavailable.")?;
    let mut connections = load(&app)?;
    if connections.remove(&root).is_some() { save(&app, &connections)?; }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn oversized_get_file_response_is_a_permanent_image_rejection() {
        let oversized = json!({"ok":false,"error_code":400,"description":"Bad Request: file is too big"});
        assert_eq!(api_result("getFile", oversized.clone()).unwrap_err(), "Telegram image exceeds 20 MB.");
        assert!(!api_result("sendMessage", oversized).unwrap_err().contains("20 MB"));
        for response in [
            json!({"ok":false,"error_code":401,"description":"Unauthorized"}),
            json!({"ok":false,"error_code":429,"description":"Too Many Requests"}),
            json!({"ok":false,"error_code":500,"description":"secret-token"}),
        ] {
            assert_eq!(api_result("getFile", response).unwrap_err(), "Telegram rejected the request. Check the bot token and connection.");
        }
        assert_eq!(api_result("getFile", json!({"ok":true,"result":{"file_path":"photos/image.jpg"}})).unwrap()["file_path"], "photos/image.jpg");
    }

    #[test]
    fn accepts_only_the_authorized_sender_in_the_authorized_private_chat() {
        let connection = Connection { id: "test".into(), token: "unused".into(), user_id: 10, chat_id: 10, enabled: true };
        let mut update = json!({"message":{"from":{"id":10,"is_bot":false},"chat":{"id":10,"type":"private"},"text":"hello"}});
        assert!(authorized_message(&update, &connection).is_some());
        update["message"]["from"]["id"] = json!(11);
        assert!(authorized_message(&update, &connection).is_none());
        update["message"]["from"]["id"] = json!(10);
        update["message"]["chat"]["type"] = json!("group");
        assert!(authorized_message(&update, &connection).is_none());
        update["message"]["chat"]["type"] = json!("private");
        update["message"]["chat"]["id"] = json!(11);
        assert!(authorized_message(&update, &connection).is_none());
    }

    #[test]
    fn token_validation_rejects_invalid_url_characters() {
        assert!(valid_token("123456:abcdefghijklmnopqrstuvwxyz1234567890_AB-C"));
        assert!(!valid_token("123456:abcdefghijklmnopqrstuvwxyz1234567890/"));
        assert!(!valid_token("../123:abcdefghijklmnopqrstuvwxyz1234567890"));
    }

    #[test]
    fn reconnect_keeps_the_journal_identity_without_exposing_the_token() {
        let first = Connection { id: "one".into(), token: "123:secret-token".into(), user_id: 10, chat_id: 10, enabled: true };
        let mut second = first.clone();
        second.id = "two".into();
        assert_eq!(status(Some(&first)).journal_id, status(Some(&second)).journal_id);
        second.chat_id = 11;
        assert_ne!(status(Some(&first)).journal_id, status(Some(&second)).journal_id);
        assert!(!serde_json::to_string(&status(Some(&first))).unwrap().contains(&first.token));
    }

    #[test]
    fn filters_unauthorized_updates_without_losing_their_offsets() {
        let connection = Connection { id: "test".into(), token: "unused".into(), user_id: 10, chat_id: 10, enabled: true };
        let updates = json!([
            {"update_id": 9, "message":{"from":{"id":11,"is_bot":false},"chat":{"id":11,"type":"private"},"text":"bad"}},
            {"update_id": 10, "message":{"from":{"id":10,"is_bot":false},"chat":{"id":10,"type":"private"},"text":"good"}}
        ]);
        let result = filter_updates(&updates, &connection, 9).unwrap();
        assert_eq!(result.next_offset, 11);
        assert_eq!(result.messages.len(), 1);
        assert_eq!(result.messages[0]["updateId"], 10);
        assert_eq!(filter_updates(&updates, &connection, 11).unwrap().messages.len(), 0);
    }

    #[test]
    fn image_paths_cannot_escape_the_telegram_file_origin() {
        assert!(valid_file_path("photos/file_1.jpg"));
        for path in ["../secret", "/absolute", "photos/../../secret", "photos/file?token=secret", "https://example.com/file"] {
            assert!(!valid_file_path(path));
        }
    }
}

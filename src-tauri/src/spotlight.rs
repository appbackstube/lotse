use serde_json::{json, Value};
use std::path::Path;
use tauri::{AppHandle, State, WebviewWindow};

fn matches(title: &str, body: &str, query: &str) -> bool {
    let text = format!("{title}\n{body}").to_lowercase();
    query.split_whitespace().all(|word| text.contains(word))
}

fn search(root: &Path, memory: &Path, reviews: &Path, query: &str) -> Value {
    let query = query.to_lowercase();
    let mut documents = Vec::new();
    let mut errors = Vec::new();
    match super::memory::list(memory) {
        Ok(entries) => {
            for entry in entries.into_iter().filter(|entry| !entry.folder) {
                match super::memory::read(memory, &entry.path) {
                    Ok(file) if matches(&entry.path, &file.content, &query) => documents.push(json!({
                        "id": format!("memory:{}", entry.path), "kind": "Memory", "title": entry.path,
                        "body": file.content, "breadcrumb": format!("Memory / {}", entry.path),
                        "target": { "type": "memory", "path": entry.path }
                    })),
                    Ok(_) => {},
                    Err(_) => errors.push(format!("Could not search memory file {}.", entry.path)),
                }
            }
        },
        Err(_) => errors.push("Memory could not be searched.".into()),
    }
    match super::read_store(reviews) {
        Ok(store) => {
            for (id, session) in store.sessions {
                if session.repo_path != root.to_string_lossy() { continue; }
                let context = json!([session.mode, session.base_ref, session.compare_ref,
                    if session.mode == super::ComparisonMode::WorkingCopy { Some(session.base_oid.as_str()) } else { None }]).to_string();
                let label = if session.mode == super::ComparisonMode::WorkingCopy {
                    format!("Working copy · {}", session.base_oid.chars().take(7).collect::<String>())
                } else { format!("{} → {}", session.base_ref.as_deref().unwrap_or(""), session.compare_ref.as_deref().unwrap_or("")) };
                for message in session.chat_messages {
                    let title: String = message.body.trim().lines().next().unwrap_or("Chat message").chars().take(100).collect();
                    if !matches(&title, &message.body, &query) { continue; }
                    documents.push(json!({
                        "id": format!("workspace:{id}:{}", message.id), "kind": "Chat", "title": title,
                        "body": message.body, "breadcrumb": format!("Workspace / {label} / Chat"),
                        "target": { "type": "workspace", "messageId": message.id, "context": context, "archiveId": id }
                    }));
                }
            }
        },
        Err(_) => errors.push("Saved workspace chats could not be searched.".into()),
    }
    json!({ "documents": documents, "errors": errors })
}

#[tauri::command]
pub async fn search_repository_content(app: AppHandle, window: WebviewWindow, state: State<'_, super::AppState>, repository_root: String, query: String) -> Result<Value, String> {
    let root = super::repository_path(&state, &window)?;
    if root.to_string_lossy() != repository_root { return Err("Repository changed. Search again.".into()); }
    if query.trim().is_empty() { return Ok(json!({ "documents": [], "errors": [] })); }
    if query.len() > 2000 { return Err("Search query is too long.".into()); }
    let memory = super::memory_dir(&app, &root)?;
    let reviews = super::review_file(&app)?;
    tauri::async_runtime::spawn_blocking(move || search(&root, &memory, &reviews, &query)).await.map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn read_spotlight_chat(app: AppHandle, window: WebviewWindow, state: State<'_, super::AppState>, repository_root: String, archive_id: String) -> Result<super::ReviewSession, String> {
    let root = super::repository_path(&state, &window)?;
    if root.to_string_lossy() != repository_root { return Err("Repository changed. Search again.".into()); }
    let reviews = super::review_file(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let mut store = super::read_store(&reviews)?;
        store.sessions.remove(&archive_id).filter(|session| session.repo_path == root.to_string_lossy()).ok_or_else(|| "This workspace chat is no longer available. Search again.".into())
    }).await.map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn search_is_scoped_and_reports_partial_memory_failures() {
        let dir = std::env::temp_dir().join(format!("lotse-spotlight-{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
        std::fs::create_dir_all(dir.join("memories/repo")).unwrap();
        let memory = dir.join("memories/repo");
        std::fs::write(memory.join("navigation.md"), "Use Keyboard navigation for Spotlight.").unwrap();
        std::fs::write(memory.join("broken.md"), [0xff]).unwrap();
        let message = json!({"id":"message", "role":"assistant", "body":"Keyboard Spotlight", "createdAt":"2026-11-13T10:00:00Z", "selection":null, "snapshotId":null, "suggestions":[], "contexts":[]});
        let session = |repo: &str| json!({"repoPath":repo,"baseOid":"a".repeat(40),"mode":"workingCopy","comments":[],"chatMessages":[message]});
        let reviews = dir.join("reviews.json");
        std::fs::write(&reviews, json!({"version":5,"sessions":{"here":session("/here"),"other":session("/other")}}).to_string()).unwrap();
        let result = search(Path::new("/here"), &memory, &reviews, "SPOTLIGHT keyboard");
        assert_eq!(result["documents"].as_array().unwrap().len(), 2);
        assert_eq!(result["errors"].as_array().unwrap().len(), 1);
        assert!(!result.to_string().contains("workspace:other"));
        assert!(search(Path::new("/here"), &memory, &reviews, "missing")["documents"].as_array().unwrap().is_empty());
        std::fs::remove_dir_all(dir).unwrap();
    }
}

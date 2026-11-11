use serde::Serialize;
use std::{fs, io::Write, path::{Path, PathBuf}, sync::{atomic::{AtomicU64, Ordering}, Mutex}};

const MAX_MEMORY_BYTES: usize = 1_000_000;
static NEXT_TEMP: AtomicU64 = AtomicU64::new(0);
static MEMORY_WRITE_LOCK: Mutex<()> = Mutex::new(());

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryEntry {
    pub path: String,
    pub name: String,
    pub folder: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryFile {
    pub path: String,
    pub content: String,
    pub revision: String,
}

fn safe_parts(path: &str) -> Result<Vec<&str>, String> {
    if path.is_empty() || path.len() > 1024 || path.contains('\\') {
        return Err("Invalid memory path".into());
    }
    let parts: Vec<_> = path.split('/').collect();
    if parts.iter().any(|part| part.is_empty() || *part == "." || *part == ".." || part.chars().any(char::is_control)) {
        return Err("Invalid memory path".into());
    }
    Ok(parts)
}

fn file_path(path: &str) -> Result<Vec<&str>, String> {
    let parts = safe_parts(path)?;
    if !parts.last().unwrap().ends_with(".md") || *parts.last().unwrap() == ".md" {
        return Err("Memory files must end in .md".into());
    }
    Ok(parts)
}

fn checked_root(root: &Path, create: bool) -> Result<bool, String> {
    let parent = root.parent().ok_or("Invalid memory directory")?;
    if create { fs::create_dir_all(parent.parent().ok_or("Invalid app data directory")?).map_err(|error| error.to_string())?; }
    for directory in [parent, root] {
        match fs::symlink_metadata(directory) {
            Ok(metadata) if metadata.file_type().is_dir() => {}
            Ok(_) => return Err("Memory directory is not a regular directory".into()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound && create => {
                fs::create_dir(directory).map_err(|error| error.to_string())?;
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(false),
            Err(error) => return Err(error.to_string()),
        }
    }
    Ok(true)
}

fn checked_path(root: &Path, parts: &[&str]) -> Result<PathBuf, String> {
    let mut target = root.to_path_buf();
    for (index, part) in parts.iter().enumerate() {
        target.push(part);
        match fs::symlink_metadata(&target) {
            Ok(metadata) if metadata.file_type().is_symlink() => return Err("Memory symlinks are not allowed".into()),
            Ok(metadata) if index + 1 < parts.len() && !metadata.is_dir() => return Err("Memory parent is not a folder".into()),
            Ok(_) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound && index + 1 == parts.len() => {}
            Err(error) => return Err(error.to_string()),
        }
    }
    Ok(target)
}

fn revision(bytes: &[u8]) -> String {
    let hash = bytes.iter().fold(0xcbf29ce484222325_u64, |hash, byte| (hash ^ u64::from(*byte)).wrapping_mul(0x100000001b3));
    format!("{hash:016x}")
}

fn entries_in(root: &Path, prefix: &str, entries: &mut Vec<MemoryEntry>) -> Result<(), String> {
    for entry in fs::read_dir(root).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let name = entry.file_name().into_string().map_err(|_| "Memory name is not UTF-8")?;
        let path = if prefix.is_empty() { name.clone() } else { format!("{prefix}/{name}") };
        safe_parts(&path)?;
        let kind = entry.file_type().map_err(|error| error.to_string())?;
        if kind.is_symlink() { return Err("Memory symlinks are not allowed".into()); }
        if kind.is_dir() {
            entries.push(MemoryEntry { path: path.clone(), name, folder: true });
            entries_in(&entry.path(), &path, entries)?;
        } else if kind.is_file() && name.ends_with(".md") {
            entries.push(MemoryEntry { path, name, folder: false });
        }
    }
    Ok(())
}

pub fn list(root: &Path) -> Result<Vec<MemoryEntry>, String> {
    if !checked_root(root, false)? { return Ok(Vec::new()); }
    let mut entries = Vec::new();
    entries_in(root, "", &mut entries)?;
    entries.sort_by_key(|a| a.path.to_lowercase());
    Ok(entries)
}

pub fn read(root: &Path, path: &str) -> Result<MemoryFile, String> {
    let parts = file_path(path)?;
    if !checked_root(root, false)? { return Err("Memory file does not exist".into()); }
    let target = checked_path(root, &parts)?;
    let metadata = fs::metadata(&target).map_err(|error| error.to_string())?;
    if !metadata.is_file() || metadata.len() > MAX_MEMORY_BYTES as u64 { return Err("Memory file is unavailable or too large".into()); }
    let bytes = fs::read(&target).map_err(|error| error.to_string())?;
    let content = String::from_utf8(bytes.clone()).map_err(|_| "Memory file is not UTF-8")?;
    Ok(MemoryFile { path: path.into(), content, revision: revision(&bytes) })
}

pub fn write(root: &Path, path: &str, content: &str, expected_revision: Option<&str>) -> Result<MemoryFile, String> {
    if content.len() > MAX_MEMORY_BYTES { return Err("Memory file is too large".into()); }
    let parts = file_path(path)?;
    let _guard = MEMORY_WRITE_LOCK.lock().map_err(|error| error.to_string())?;
    checked_root(root, true)?;
    let target = checked_path(root, &parts)?;
    match fs::symlink_metadata(&target) {
        Ok(metadata) if metadata.is_file() => {
            let current = fs::read(&target).map_err(|error| error.to_string())?;
            if expected_revision != Some(revision(&current).as_str()) { return Err("Memory revision conflict".into()); }
        }
        Ok(_) => return Err("Memory path is not a file".into()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound && expected_revision.is_none() => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Err("Memory revision conflict".into()),
        Err(error) => return Err(error.to_string()),
    }
    let temporary = target.with_file_name(format!(".memory-{}-{}.tmp", std::process::id(), NEXT_TEMP.fetch_add(1, Ordering::Relaxed)));
    let result = (|| {
        let mut file = fs::OpenOptions::new().write(true).create_new(true).open(&temporary).map_err(|error| error.to_string())?;
        file.write_all(content.as_bytes()).map_err(|error| error.to_string())?;
        file.sync_all().map_err(|error| error.to_string())?;
        fs::rename(&temporary, &target).map_err(|error| error.to_string())
    })();
    if result.is_err() { let _ = fs::remove_file(&temporary); }
    result?;
    Ok(MemoryFile { path: path.into(), content: content.into(), revision: revision(content.as_bytes()) })
}

pub fn create_folder(root: &Path, path: &str) -> Result<(), String> {
    let parts = safe_parts(path)?;
    let _guard = MEMORY_WRITE_LOCK.lock().map_err(|error| error.to_string())?;
    checked_root(root, true)?;
    fs::create_dir(checked_path(root, &parts)?).map_err(|error| error.to_string())
}

pub fn rename(root: &Path, path: &str, new_name: &str) -> Result<String, String> {
    let parts = safe_parts(path)?;
    if safe_parts(new_name)?.len() != 1 { return Err("Enter one name".into()); }
    let parent = parts[..parts.len() - 1].join("/");
    let destination = if parent.is_empty() { new_name.into() } else { format!("{parent}/{new_name}") };
    move_entry(root, path, &destination)
}

pub fn move_entry(root: &Path, path: &str, destination_path: &str) -> Result<String, String> {
    let parts = safe_parts(path)?;
    let destination_parts = safe_parts(destination_path)?;
    if destination_path == path || destination_path.starts_with(&format!("{path}/")) {
        return Err("Cannot move a memory folder into itself".into());
    }
    let _guard = MEMORY_WRITE_LOCK.lock().map_err(|error| error.to_string())?;
    if !checked_root(root, false)? { return Err("Memory entry does not exist".into()); }
    let source = checked_path(root, &parts)?;
    let metadata = fs::symlink_metadata(&source).map_err(|error| error.to_string())?;
    if metadata.is_file() { file_path(destination_path)?; }
    else if !metadata.is_dir() { return Err("Memory entry is unavailable".into()); }
    let destination = checked_path(root, &destination_parts)?;
    match fs::symlink_metadata(&destination) {
        Ok(_) => return Err("Memory entry already exists".into()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(error.to_string()),
    }
    fs::rename(source, destination).map_err(|error| error.to_string())?;
    Ok(destination_path.into())
}

pub fn delete(root: &Path, path: &str) -> Result<(), String> {
    let parts = safe_parts(path)?;
    let _guard = MEMORY_WRITE_LOCK.lock().map_err(|error| error.to_string())?;
    if !checked_root(root, false)? { return Err("Memory entry does not exist".into()); }
    let target = checked_path(root, &parts)?;
    let metadata = fs::symlink_metadata(&target).map_err(|error| error.to_string())?;
    if metadata.is_file() { file_path(path)?; fs::remove_file(target).map_err(|error| error.to_string()) }
    else if metadata.is_dir() { let mut entries = Vec::new(); entries_in(&target, "", &mut entries)?; fs::remove_dir_all(target).map_err(|error| error.to_string()) }
    else { Err("Memory entry is unavailable".into()) }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn roots() -> (PathBuf, PathBuf, PathBuf) {
        let base = std::env::temp_dir().join(format!("lotse-memory-test-{}-{}", std::process::id(), NEXT_TEMP.fetch_add(1, Ordering::Relaxed)));
        (base.join("memories/a"), base.join("memories/b"), base)
    }

    #[test]
    fn separates_repositories_and_checks_revisions() {
        let (a, b, base) = roots();
        create_folder(&a, "notes").unwrap();
        let first = write(&a, "notes/idea.md", "one", None).unwrap();
        assert!(list(&b).unwrap().is_empty());
        assert!(write(&a, "notes/idea.md", "overwrite", None).is_err());
        assert!(write(&a, "notes/idea.md", "overwrite", Some("stale")).is_err());
        let second = write(&a, "notes/idea.md", "two", Some(&first.revision)).unwrap();
        assert_eq!(read(&a, "notes/idea.md").unwrap().revision, second.revision);
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn rejects_unsafe_paths_and_symlinks() {
        let (a, _, base) = roots();
        create_folder(&a, "notes").unwrap();
        for path in ["../outside.md", "notes/../../outside.md", "/absolute.md", "notes\\outside.md", "notes//x.md"] {
            assert!(write(&a, path, "unsafe", None).is_err(), "{path}");
        }
        #[cfg(unix)] {
            std::os::unix::fs::symlink(base.parent().unwrap(), a.join("notes/link")).unwrap();
            assert!(write(&a, "notes/link/outside.md", "unsafe", None).is_err());
            assert!(list(&a).is_err());
        }
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn renames_and_deletes_nested_entries() {
        let (root, _, base) = roots();
        create_folder(&root, "notes").unwrap();
        write(&root, "notes/idea.md", "hello", None).unwrap();
        assert_eq!(rename(&root, "notes/idea.md", "plan.md").unwrap(), "notes/plan.md");
        assert_eq!(rename(&root, "notes", "archive").unwrap(), "archive");
        assert_eq!(read(&root, "archive/plan.md").unwrap().content, "hello");
        delete(&root, "archive").unwrap();
        assert!(list(&root).unwrap().is_empty());
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn moves_files_and_folders_without_overwriting() {
        let (root, _, base) = roots();
        create_folder(&root, "Features").unwrap();
        create_folder(&root, "Releases").unwrap();
        write(&root, "Features/idea.md", "hello", None).unwrap();
        create_folder(&root, "Features/nested").unwrap();
        write(&root, "Features/nested/details.md", "kept", None).unwrap();
        assert_eq!(move_entry(&root, "Features/idea.md", "Releases/idea.md").unwrap(), "Releases/idea.md");
        assert_eq!(read(&root, "Releases/idea.md").unwrap().content, "hello");
        assert!(move_entry(&root, "Features", "Releases").is_err());
        assert!(move_entry(&root, "Releases", "Releases/inside").is_err());
        assert!(move_entry(&root, "Features", "Missing/Features").is_err());
        assert!(move_entry(&root, "Releases/idea.md", "Features/idea.txt").is_err());
        assert_eq!(move_entry(&root, "Features", "Releases/Features").unwrap(), "Releases/Features");
        assert_eq!(read(&root, "Releases/Features/nested/details.md").unwrap().content, "kept");
        fs::remove_dir_all(base).unwrap();
    }
}

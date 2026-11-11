use std::{
    collections::BTreeMap,
    fs::{self, DirBuilder, OpenOptions},
    io::Write,
    os::unix::fs::{DirBuilderExt, OpenOptionsExt, PermissionsExt},
    path::{Path, PathBuf},
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager};

static STORE_LOCK: Mutex<()> = Mutex::new(());

fn path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .home_dir()
        .map_err(|_| "Cannot locate your home directory for Lotse credentials.")?
        .join(".lotse/credentials.json"))
}

pub(crate) fn load(app: &AppHandle, key: &str) -> Result<Option<String>, String> {
    load_at(&path(app)?, key)
}

pub(crate) fn save(app: &AppHandle, key: &str, value: Option<&str>) -> Result<(), String> {
    save_at(&path(app)?, key, value)
}

fn read(path: &Path) -> Result<BTreeMap<String, String>, String> {
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(BTreeMap::new()),
        Err(error) => return Err(format!("Cannot read {}: {error}", path.display())),
    };
    // Parser errors can include secret values, so only report their location.
    serde_json::from_slice(&bytes).map_err(|error| format!(
        "Invalid credentials file {} at line {}, column {}. Expected a JSON object of string values; repair it before saving.",
        path.display(), error.line(), error.column(),
    ))
}

fn load_at(path: &Path, key: &str) -> Result<Option<String>, String> {
    let _lock = STORE_LOCK
        .lock()
        .map_err(|_| "Cannot access Lotse credentials; restart Lotse.")?;
    Ok(read(path)?.remove(key))
}

fn save_at(path: &Path, key: &str, value: Option<&str>) -> Result<(), String> {
    let _lock = STORE_LOCK
        .lock()
        .map_err(|_| "Cannot access Lotse credentials; restart Lotse.")?;
    let mut entries = read(path)?;
    match value {
        Some(value) => {
            entries.insert(key.to_owned(), value.to_owned());
        }
        None => {
            if entries.remove(key).is_none() {
                return Ok(());
            }
        }
    }
    let directory = path.parent().ok_or("Invalid Lotse credentials path.")?;
    DirBuilder::new()
        .recursive(true)
        .mode(0o700)
        .create(directory)
        .and_then(|_| fs::set_permissions(directory, fs::Permissions::from_mode(0o700)))
        .map_err(|error| {
            format!(
                "Cannot secure credentials directory {}: {error}",
                directory.display()
            )
        })?;
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| "Cannot determine credentials save time.")?
        .as_nanos();
    let temporary = directory.join(format!(".credentials-{}-{nonce}.tmp", std::process::id()));
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .mode(0o600)
        .open(&temporary)
        .map_err(|error| {
            format!(
                "Cannot create credentials file in {}: {error}",
                directory.display()
            )
        })?;
    let result = (|| {
        let contents =
            serde_json::to_vec_pretty(&entries).map_err(|_| "Cannot encode Lotse credentials.")?;
        file.write_all(&contents)
            .and_then(|_| file.sync_all())
            .map_err(|error| format!("Cannot write {}: {error}", path.display()))?;
        fs::rename(&temporary, path)
            .map_err(|error| format!("Cannot save {}: {error}", path.display()))
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    struct TestDirectory(PathBuf);
    impl TestDirectory {
        fn new() -> Self {
            let nonce = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let path = std::env::temp_dir()
                .join(format!("lotse-credentials-{}-{nonce}", std::process::id()));
            fs::create_dir(&path).unwrap();
            Self(path)
        }
    }
    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn credentials_round_trip_delete_and_permissions() {
        let directory = TestDirectory::new();
        let path = directory.0.join(".lotse/credentials.json");
        assert_eq!(load_at(&path, "OPENROUTER_API_KEY").unwrap(), None);
        save_at(&path, "absent", None).unwrap();
        assert!(!path.exists());
        save_at(&path, "OPENROUTER_API_KEY", Some("synthetic-key")).unwrap();
        save_at(&path, "github.com", Some("synthetic-token")).unwrap();
        fs::set_permissions(path.parent().unwrap(), fs::Permissions::from_mode(0o755)).unwrap();
        fs::set_permissions(&path, fs::Permissions::from_mode(0o644)).unwrap();
        save_at(&path, "OPENROUTER_API_KEY", Some("replacement\nkey")).unwrap();
        assert_eq!(
            load_at(&path, "OPENROUTER_API_KEY").unwrap().as_deref(),
            Some("replacement\nkey")
        );
        assert_eq!(
            fs::metadata(path.parent().unwrap())
                .unwrap()
                .permissions()
                .mode()
                & 0o777,
            0o700
        );
        assert_eq!(
            fs::metadata(&path).unwrap().permissions().mode() & 0o777,
            0o600
        );
        save_at(&path, "github.com", None).unwrap();
        assert_eq!(load_at(&path, "github.com").unwrap(), None);
        assert_eq!(read(&path).unwrap().len(), 1);
        save_at(&path, "OPENROUTER_API_KEY", None).unwrap();
        save_at(&path, "OPENROUTER_API_KEY", None).unwrap();
        assert!(read(&path).unwrap().is_empty());
        assert_eq!(fs::read_dir(path.parent().unwrap()).unwrap().count(), 1);
    }

    #[test]
    fn invalid_credentials_are_preserved_without_disclosing_values() {
        let directory = TestDirectory::new();
        let path = directory.0.join("credentials.json");
        for contents in [
            r#"{"key":"sensitive-value",broken}"#,
            r#"{"key":["sensitive-value"]}"#,
            "[]",
        ] {
            fs::write(&path, contents).unwrap();
            let error = save_at(&path, "new", Some("new-value")).unwrap_err();
            assert!(error.contains("repair it before saving"));
            assert!(!error.contains("sensitive-value"));
            assert!(load_at(&path, "key").is_err());
            assert_eq!(fs::read_to_string(&path).unwrap(), contents);
        }
    }

    #[test]
    fn concurrent_saves_preserve_unrelated_credentials() {
        let directory = TestDirectory::new();
        let path = directory.0.join("credentials.json");
        std::thread::scope(|scope| {
            for index in 0..12 {
                let path = &path;
                scope.spawn(move || {
                    save_at(path, &format!("key{index}"), Some("synthetic-value")).unwrap()
                });
            }
        });
        assert_eq!(read(&path).unwrap().len(), 12);
    }

    #[test]
    fn filesystem_failures_are_reported() {
        let directory = TestDirectory::new();
        let path = directory.0.join("credentials.json");
        fs::create_dir(&path).unwrap();
        assert!(load_at(&path, "key").unwrap_err().contains("Cannot read"));
        assert!(save_at(&path, "key", Some("synthetic-value"))
            .unwrap_err()
            .contains("Cannot read"));
        fs::remove_dir(&path).unwrap();
        fs::set_permissions(&directory.0, fs::Permissions::from_mode(0o500)).unwrap();
        let result = save_at(
            &directory.0.join("missing/credentials.json"),
            "key",
            Some("synthetic-value"),
        );
        fs::set_permissions(&directory.0, fs::Permissions::from_mode(0o700)).unwrap();
        assert!(result
            .unwrap_err()
            .contains("Cannot secure credentials directory"));
        assert!(!path.exists());
        let blocked = directory.0.join("blocked");
        fs::write(&blocked, "not a directory").unwrap();
        assert!(save_at(
            &blocked.join("credentials.json"),
            "key",
            Some("synthetic-value")
        )
        .is_err());
    }
}

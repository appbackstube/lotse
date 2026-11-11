//! Website secrets never enter frontend storage, MCP, Debug output, or a subprocess.
use super::*;
use std::collections::BTreeMap;

const ACCOUNT: &str = "website-vault-v1";
const STORE_ERROR: &str = "Website Keychain is unavailable. Unlock your login Keychain and retry.";
static VAULT_LOCK: Mutex<()> = Mutex::new(());

#[derive(Default)]
pub(super) struct Privacy(Mutex<Option<Redactions>>);

#[derive(Default)]
struct Redactions {
    origins: HashSet<String>,
    values: Vec<String>,
}

impl Redactions {
    fn remember(&mut self, vault: &Vault) {
        use base64::Engine;
        self.origins.extend(vault.protected_origins.iter().cloned());
        for secret in vault.entries.values() {
            for value in [&secret.username, &secret.email, &secret.password].into_iter().filter(|s| !s.is_empty()) {
                let mut url = reqwest::Url::parse("https://redaction.invalid").expect("Static URL");
                url.query_pairs_mut().append_pair("v", value);
                let encoded = url.query().unwrap().strip_prefix("v=").unwrap().to_owned();
                let json = serde_json::to_string(value).expect("Strings serialize");
                let html = value.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;").replace('\'', "&#39;");
                self.values.extend([value.clone(), value.to_lowercase(), value.to_uppercase(), encoded.replace('+', "%20"), encoded, json[1..json.len()-1].to_owned(), html,
                    base64::engine::general_purpose::STANDARD.encode(value), base64::engine::general_purpose::STANDARD_NO_PAD.encode(value),
                    base64::engine::general_purpose::URL_SAFE.encode(value), base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(value)]);
            }
        }
        self.values.sort_unstable_by(|a, b| b.len().cmp(&a.len()).then_with(|| a.cmp(b)));
        self.values.dedup();
    }

    fn text(&self, input: &str) -> String { self.text_limited(input, usize::MAX) }

    fn text_limited(&self, input: &str, limit: usize) -> String {
        let mut remaining = input;
        let mut budget = input.char_indices().nth(limit).map(|(offset, _)| offset).unwrap_or(input.len());
        let mut output = String::new();
        while budget > 0 {
            let next = self.values.iter().filter_map(|value| remaining.find(value).map(|offset| (offset, value)))
                .min_by(|(a, av), (b, bv)| a.cmp(b).then_with(|| bv.len().cmp(&av.len())));
            let Some((offset, value)) = next.filter(|(offset, _)| *offset < budget) else {
                output.push_str(&remaining[..budget]); break;
            };
            output.push_str(&remaining[..offset]);
            output.push_str("[redacted]");
            let consumed = offset + value.len();
            remaining = &remaining[consumed..];
            budget = budget.saturating_sub(consumed);
        }
        output.chars().take(limit).collect()
    }

    fn limited(&self, value: &mut Value, max: usize) {
        if let Value::String(text) = value { *text = self.text_limited(text, max); }
    }

    fn apply(&self, value: &mut Value) {
        match value {
            Value::String(text) => *text = self.text(text),
            Value::Array(values) => { for value in values { self.apply(value); } }
            Value::Object(object) => { for (key, value) in object {
                match key.as_str() {
                    // References and ownership keys never come from website content.
                    "reference" | "repositoryRoot" | "taskId" => {},
                    "text" => self.limited(value, 40000),
                    "elements" => { if let Some(elements) = value.as_array_mut() { for element in elements {
                        if let Some(fields) = element.as_object_mut() {
                            let sensitive = fields.get("value").and_then(Value::as_str).is_some_and(|text| self.values.iter().any(|value| text.contains(value)));
                            for (key, value) in fields.iter_mut() {
                            match key.as_str() {
                                "reference" => {},
                                "name" => self.limited(value, 500),
                                "value" => self.limited(value, 1000),
                                _ => self.apply(value),
                            }
                        }
                        if sensitive { fields.insert("credentialField".into(), Value::Bool(true)); }
                        }
                    } } },
                    _ => self.apply(value),
                }
            } }
            _ => {}
        }
    }
}

#[derive(Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Vault {
    entries: BTreeMap<String, Secret>,
    // Retain nonsecret origins for screenshot protection after deleting a login.
    protected_origins: HashSet<String>,
}

#[derive(Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct Secret {
    pub username: String,
    pub email: String,
    pub password: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Update {
    base_url: String,
    previous_base_url: Option<String>,
    username: Option<String>,
    email: Option<String>,
    password: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Summary {
    base_url: String,
    has_username: bool,
    has_email: bool,
    has_password: bool,
}

pub(super) fn origin(input: &str) -> Result<String, String> {
    let url = reqwest::Url::parse(input).map_err(|_| "Enter a complete HTTPS base URL.")?;
    if input.len() > 2048 || input.chars().any(char::is_control)
        || url.scheme() != "https" || url.host_str().is_none()
        || !url.username().is_empty() || url.password().is_some() {
        return Err("Website credentials require HTTPS without embedded credentials.".into());
    }
    Ok(url.origin().ascii_serialization())
}

fn base_origin(input: &str) -> Result<String, String> {
    let result = origin(input)?;
    let url = reqwest::Url::parse(input).map_err(|_| "Invalid base URL.")?;
    if url.path() != "/" || url.query().is_some() || url.fragment().is_some() {
        return Err("Use a base URL without a path, query, or fragment. Credentials apply to this exact origin.".into());
    }
    Ok(result)
}

fn service(app: &AppHandle) -> String { format!("{}.website-credentials", app.config().identifier) }

fn decode(bytes: &[u8]) -> Result<Vault, String> {
    let vault: Vault = serde_json::from_slice(bytes).map_err(|_| "Website Keychain data is invalid; no changes were saved.")?;
    if vault.entries.len() > 100 || vault.entries.iter().any(|(origin, secret)| {
        base_origin(origin).as_ref() != Ok(origin) || validate_secret(secret).is_err() || !vault.protected_origins.contains(origin)
    }) || vault.protected_origins.iter().any(|origin| base_origin(origin).as_ref() != Ok(origin)) {
        return Err("Website Keychain data is invalid; no changes were saved.".into());
    }
    Ok(vault)
}

#[cfg(target_os = "macos")]
fn read(service: &str) -> Result<Vault, String> {
    match security_framework::passwords::get_generic_password(service, ACCOUNT) {
        Ok(bytes) => decode(&bytes),
        Err(error) if error.code() == -25300 => Ok(Vault::default()),
        Err(_) => Err(STORE_ERROR.into()),
    }
}

#[cfg(target_os = "macos")]
fn write(service: &str, vault: &Vault) -> Result<(), String> {
    let bytes = serde_json::to_vec(vault).map_err(|_| "Cannot encode website credentials.")?;
    security_framework::passwords::set_generic_password(service, ACCOUNT, &bytes).map_err(|_| STORE_ERROR.into())
}

#[cfg(not(target_os = "macos"))]
fn read(_: &str) -> Result<Vault, String> { Err("Website Keychain requires macOS.".into()) }
#[cfg(not(target_os = "macos"))]
fn write(_: &str, _: &Vault) -> Result<(), String> { Err("Website Keychain requires macOS.".into()) }

fn summaries(vault: &Vault) -> Vec<Summary> {
    vault.entries.iter().map(|(base_url, secret)| Summary {
        base_url: base_url.clone(), has_username: !secret.username.is_empty(),
        has_email: !secret.email.is_empty(), has_password: !secret.password.is_empty(),
    }).collect()
}

fn validate_secret(secret: &Secret) -> Result<(), String> {
    if [&secret.username, &secret.email, &secret.password].iter().any(|s| s.len() > 4096 || s.contains('\0'))
        || secret.password.is_empty() || (secret.username.is_empty() && secret.email.is_empty()) {
        return Err("Enter a username or email and a password (up to 4096 bytes each).".into());
    }
    Ok(())
}

fn update(vault: &mut Vault, update: Update) -> Result<(), String> {
    let origin = base_origin(&update.base_url)?;
    let previous = update.previous_base_url.as_deref().map(base_origin).transpose()?;
    if previous.as_ref().is_none_or(|old| *old != origin) && vault.entries.contains_key(&origin) {
        return Err("A credential already exists for this origin. Edit it instead.".into());
    }
    let existing = match &previous {
        Some(old) => Some(vault.entries.get(old).ok_or("This website credential no longer exists.")?),
        None => None,
    };
    let secret = Secret {
        username: update.username.or_else(|| existing.map(|s| s.username.clone())).unwrap_or_default(),
        email: update.email.or_else(|| existing.map(|s| s.email.clone())).unwrap_or_default(),
        password: update.password.or_else(|| existing.map(|s| s.password.clone())).unwrap_or_default(),
    };
    validate_secret(&secret)?;
    if previous.is_none() && vault.entries.len() >= 100 { return Err("At most 100 website credentials can be stored.".into()); }
    if let Some(old) = previous { vault.entries.remove(&old); }
    vault.protected_origins.insert(origin.clone());
    vault.entries.insert(origin, secret);
    Ok(())
}

fn settings_origin(label: &str, url: &reqwest::Url, development: bool) -> bool {
    let local = url.scheme() == "tauri" && url.host_str() == Some("localhost");
    let development = development && url.origin().ascii_serialization() == "http://localhost:1430";
    (label == "main" || label.starts_with("review-")) && (local || development)
}

fn trusted_settings(window: &WebviewWindow) -> Result<(), String> {
    let url = window.url().map_err(|_| "Settings window is unavailable.")?;
    if !settings_origin(window.label(), &url, cfg!(debug_assertions)) {
        return Err("Website credentials can only be managed in Lotse Settings.".into());
    }
    Ok(())
}

#[tauri::command]
pub(super) fn list_website_credentials(app: AppHandle, window: WebviewWindow) -> Result<Vec<Summary>, String> {
    trusted_settings(&window)?;
    let _guard = VAULT_LOCK.lock().map_err(|_| STORE_ERROR)?;
    Ok(summaries(&read(&service(&app))?))
}

#[tauri::command]
pub(super) fn save_website_credential(app: AppHandle, window: WebviewWindow, credential: Update) -> Result<Vec<Summary>, String> {
    trusted_settings(&window)?;
    let _guard = VAULT_LOCK.lock().map_err(|_| STORE_ERROR)?;
    let mut vault = read(&service(&app))?;
    remember(&app, &vault)?;
    update(&mut vault, credential)?;
    write(&service(&app), &vault)?;
    remember(&app, &vault)?;
    Ok(summaries(&vault))
}

#[tauri::command]
pub(super) fn delete_website_credential(app: AppHandle, window: WebviewWindow, base_url: String) -> Result<Vec<Summary>, String> {
    trusted_settings(&window)?;
    let origin = base_origin(&base_url)?;
    let _guard = VAULT_LOCK.lock().map_err(|_| STORE_ERROR)?;
    let mut vault = read(&service(&app))?;
    remember(&app, &vault)?;
    vault.entries.remove(&origin);
    write(&service(&app), &vault)?;
    Ok(summaries(&vault))
}

// Historical values stay in native memory until app exit, never on disk after deletion.
fn remember(app: &AppHandle, vault: &Vault) -> Result<(), String> {
    app.state::<Privacy>().0.lock().map_err(|_| STORE_ERROR)?.get_or_insert_with(Redactions::default).remember(vault);
    Ok(())
}

fn with_redactions<T>(app: &AppHandle, use_values: impl FnOnce(&Redactions) -> T) -> Result<T, String> {
    let _guard = VAULT_LOCK.lock().map_err(|_| STORE_ERROR)?;
    let state = app.state::<Privacy>();
    let mut cache = state.0.lock().map_err(|_| STORE_ERROR)?;
    if cache.is_none() {
        let mut redactions = Redactions::default();
        redactions.remember(&read(&service(app))?);
        *cache = Some(redactions);
    }
    Ok(use_values(cache.as_ref().unwrap()))
}

pub(super) fn protected(app: &AppHandle, url: &str) -> Result<bool, String> {
    with_redactions(app, |redactions| origin(url).ok().is_some_and(|origin| redactions.origins.contains(&origin)))
}

pub(super) fn redaction_padding(app: &AppHandle) -> Result<usize, String> {
    with_redactions(app, |redactions| redactions.values.iter().map(String::len).max().unwrap_or(0))
}

pub(super) fn redact(app: &AppHandle, value: &mut Value) -> Result<(), String> {
    with_redactions(app, |redactions| redactions.apply(value))
}

// Only native credential operations call this; never registered as a command or MCP tool.
pub(super) fn for_url(app: &AppHandle, url: &str) -> Result<Option<Secret>, String> {
    let Ok(origin) = origin(url) else { return Ok(None); };
    let _guard = VAULT_LOCK.lock().map_err(|_| STORE_ERROR)?;
    Ok(read(&service(app))?.entries.remove(&origin))
}

#[cfg(test)]
mod tests {
    use super::*;
    fn change(value: Value) -> Update { serde_json::from_value(value).unwrap() }
    #[test]
    fn redaction_preserves_page_content_and_remembers_replaced_and_deleted_values() {
        let mut vault = Vault::default();
        update(&mut vault, change(serde_json::json!({"baseUrl":"https://example.com", "username":"private-user", "email":"private@example.invalid", "password":"private-password"}))).unwrap();
        let mut redactions = Redactions::default();
        redactions.remember(&vault);
        let mut page = serde_json::json!({"title":"Dashboard", "text":"Timer running: 02:40:31 private-user private@example.invalid private-password cHJpdmF0ZS1wYXNzd29yZA== private%40example.invalid", "elements":[{"reference":"private-user:0", "name":"Stop timer", "value":"private-password"}]});
        redactions.apply(&mut page);
        assert!(page["text"].as_str().unwrap().contains("Timer running: 02:40:31"));
        assert_eq!(page["title"], "Dashboard");
        assert_eq!(page["elements"][0]["name"], "Stop timer");
        assert_eq!(page["elements"][0]["reference"], "private-user:0");
        assert_eq!(page["elements"][0]["value"], "[redacted]");
        for value in ["private-user", "private@example.invalid", "private-password", "cHJpdmF0ZS1wYXNzd29yZA==", "private%40example.invalid"] { assert!(!page["text"].as_str().unwrap().contains(value)); }
        vault.entries.clear();
        redactions.remember(&vault);
        assert_eq!(redactions.text("Timer running private-password"), "Timer running [redacted]");
        let short = Redactions { origins: HashSet::new(), values: vec!["red".into(), "password".into()] };
        assert_eq!(short.text("password red"), "[redacted] [redacted]");
        assert_eq!(short.text_limited("123password", 5), "123[r");
        // Earlier replacements can shrink text; the source boundary must still hold.
        assert!(!short.text_limited("passwordpassword123password", 22).contains("pass"));
    }

    #[test]
    fn settings_commands_reject_website_and_untrusted_window_callers() {
        let local = reqwest::Url::parse("tauri://localhost/index.html").unwrap();
        let dev = reqwest::Url::parse("http://localhost:1430").unwrap();
        assert!(settings_origin("main", &local, false));
        assert!(settings_origin("review-123", &local, false));
        assert!(settings_origin("main", &dev, true));
        assert!(!settings_origin("main", &dev, false));
        for (label, url) in [("browser", "tauri://localhost"), ("main", "https://example.com"), ("main", "tauri://evil.invalid"), ("main", "http://localhost:1431"), ("main", "http://localhost.evil.invalid:1430")] {
            assert!(!settings_origin(label, &reqwest::Url::parse(url).unwrap(), true));
        }
    }
    #[test]
    fn exact_https_origins_only() {
        assert_eq!(base_origin("https://EXAMPLE.com:443/").unwrap(), "https://example.com");
        assert_eq!(origin("https://example.com/login?q=1#x").unwrap(), "https://example.com");
        for url in ["http://example.com", "file:///tmp/x", "https://u:p@example.com", "https://example.com\n", "javascript:alert(1)"] { assert!(origin(url).is_err()); }
        for url in ["https://example.com/login", "https://example.com/?x=1", "https://example.com/#x"] { assert!(base_origin(url).is_err()); }
        for url in ["https://sub.example.com", "https://example.com.evil.test", "https://example.com:444", "https://example.org"] {
            assert_ne!(origin(url).unwrap(), "https://example.com");
        }
    }
    #[test]
    fn crud_is_metadata_only_and_failed_changes_preserve_data() {
        let mut vault = Vault::default();
        let create = serde_json::json!({"baseUrl":"https://example.com", "username":"synthetic-user", "email":"synthetic@example.invalid", "password":"synthetic-password"});
        update(&mut vault, change(create.clone())).unwrap();
        let output = serde_json::to_string(&summaries(&vault)).unwrap();
        for secret in ["synthetic-user", "synthetic@example.invalid", "synthetic-password"] { assert!(!output.contains(secret)); }
        assert!(update(&mut vault, change(create)).is_err());
        update(&mut vault, change(serde_json::json!({"baseUrl":"https://example.com", "previousBaseUrl":"https://example.com", "username":""}))).unwrap();
        assert!(vault.entries["https://example.com"].username.is_empty());
        assert_eq!(vault.entries["https://example.com"].password, "synthetic-password");
        let before = serde_json::to_vec(&vault).unwrap();
        assert!(update(&mut vault, change(serde_json::json!({"baseUrl":"https://example.com", "previousBaseUrl":"https://example.com", "password":""}))).is_err());
        assert_eq!(serde_json::to_vec(&vault).unwrap(), before);
        update(&mut vault, change(serde_json::json!({"baseUrl":"https://other.example", "previousBaseUrl":"https://example.com"}))).unwrap();
        assert!(!vault.entries.contains_key("https://example.com"));
        assert!(vault.protected_origins.contains("https://example.com"));
        vault.entries.remove("https://other.example");
        assert!(summaries(&vault).is_empty());
        assert!(vault.protected_origins.contains("https://other.example"));
        assert!(decode(b"{synthetic-password").err().unwrap().contains("invalid"));
        assert!(!decode(b"{synthetic-password").err().unwrap().contains("synthetic-password"));
    }
    #[cfg(target_os = "macos")]
    #[test]
    #[ignore = "Uses a unique, synthetic login Keychain entry; run explicitly on macOS."]
    fn real_keychain_crud() {
        let service = format!("com.lotse.credential-test.{}.{}", std::process::id(), SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos());
        struct Cleanup(String);
        impl Drop for Cleanup { fn drop(&mut self) { let _ = security_framework::passwords::delete_generic_password(&self.0, ACCOUNT); } }
        let _cleanup = Cleanup(service.clone());
        assert!(read(&service).unwrap().entries.is_empty());
        let mut vault = Vault::default();
        update(&mut vault, change(serde_json::json!({"baseUrl":"https://example.invalid", "email":"test@example.invalid", "password":"test-only-password"}))).unwrap();
        write(&service, &vault).unwrap();
        assert_eq!(read(&service).unwrap().entries["https://example.invalid"].password, "test-only-password");
        update(&mut vault, change(serde_json::json!({"baseUrl":"https://example.invalid", "previousBaseUrl":"https://example.invalid", "password":"updated-test-password"}))).unwrap();
        write(&service, &vault).unwrap();
        assert_eq!(read(&service).unwrap().entries["https://example.invalid"].password, "updated-test-password");
        vault.entries.clear(); write(&service, &vault).unwrap();
        assert!(read(&service).unwrap().entries.is_empty());
    }
}

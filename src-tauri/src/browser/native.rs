use super::*;
use std::cell::{Cell, RefCell};
use objc2::{define_class, msg_send, rc::Retained, runtime::{AnyObject, ProtocolObject}, AnyThread, DefinedClass, MainThreadOnly};
use objc2_app_kit::{NSBitmapImageFileType, NSBitmapImageRep};
use objc2_foundation::{MainThreadMarker, NSBundle, NSData, NSDictionary, NSError, NSObject, NSObjectProtocol, NSOperatingSystemVersion, NSPoint, NSProcessInfo, NSRect, NSSize, NSString, NSURL, NSURLRequest, NSUserDefaults};
use objc2_web_kit::{WKContentWorld, WKNavigation, WKNavigationAction, WKNavigationActionPolicy, WKNavigationDelegate, WKNavigationResponse, WKNavigationResponsePolicy, WKUIDelegate, WKWebView, WKWebViewConfiguration, WKWebsiteDataStore, WKWindowFeatures};

thread_local! {
    // AppKit objects stay on the main thread; only keys and JSON cross threads.
    static SESSIONS: RefCell<HashMap<Key, Session>> = RefCell::new(HashMap::new());
    static PRESENTATIONS: RefCell<Presentations> = RefCell::new(Presentations::default());
}

struct Session {
    view: Retained<WKWebView>,
    delegate: Retained<BrowserDelegate>,
    visible: Cell<bool>,
}

struct DelegateState {
    app: AppHandle,
    key: Key,
    error: RefCell<Option<String>>,
    last_url: RefCell<Option<String>>,
    protected: Cell<bool>,
    credential_references: RefCell<HashSet<String>>,
}

fn saved_url_key(key: &Key) -> Retained<NSString> {
    NSString::from_str(&format!("lotse.browser.last-url:{}:{}", key.repository.display(), key.task))
}

fn restorable_url(app: &AppHandle, url: &str) -> Option<String> {
    normalize_url(url).ok()?;
    let mut redacted = Value::String(url.into());
    website_credentials::redact(app, &mut redacted).ok()?;
    (redacted.as_str() == Some(url)).then(|| url.to_owned())
}

define_class!(
    #[unsafe(super(NSObject))]
    #[thread_kind = MainThreadOnly]
    #[ivars = DelegateState]
    struct BrowserDelegate;

    unsafe impl NSObjectProtocol for BrowserDelegate {}
    unsafe impl WKNavigationDelegate for BrowserDelegate {
        #[unsafe(method(webView:decidePolicyForNavigationAction:decisionHandler:))]
        fn policy(&self, view: &WKWebView, action: &WKNavigationAction, decision: &block2::DynBlock<dyn Fn(WKNavigationActionPolicy)>) {
            let main_frame = unsafe { action.targetFrame() }.is_none_or(|frame| unsafe { frame.isMainFrame() });
            let allowed = unsafe { action.request().URL() }.is_some_and(|url| {
                url.absoluteString().is_some_and(|value| {
                    let value = value.to_string();
                    normalize_url(&value).is_ok() || (!main_frame && matches!(value.as_str(), "about:blank" | "about:srcdoc"))
                })
            });
            decision.call((if allowed { WKNavigationActionPolicy::Allow } else { WKNavigationActionPolicy::Cancel },));
            if !allowed && main_frame {
                *self.ivars().error.borrow_mut() = Some("This link cannot open here. Enter a website address starting with https:// or http://.".into());
                self.publish(view);
            }
        }

        #[unsafe(method(webView:decidePolicyForNavigationResponse:decisionHandler:))]
        fn response(&self, _view: &WKWebView, response: &WKNavigationResponse, decision: &block2::DynBlock<dyn Fn(WKNavigationResponsePolicy)>) {
            let allowed = unsafe { response.canShowMIMEType() };
            if !allowed { *self.ivars().error.borrow_mut() = Some("This content cannot be displayed. File downloads are unsupported.".into()); }
            decision.call((if allowed { WKNavigationResponsePolicy::Allow } else { WKNavigationResponsePolicy::Cancel },));
        }

        #[unsafe(method(webView:didStartProvisionalNavigation:))]
        fn started(&self, view: &WKWebView, _navigation: Option<&WKNavigation>) {
            *self.ivars().error.borrow_mut() = None;
            self.publish(view);
        }

        #[unsafe(method(webView:didCommitNavigation:))]
        fn committed(&self, view: &WKWebView, _navigation: Option<&WKNavigation>) { self.publish(view); }

        #[unsafe(method(webView:didFinishNavigation:))]
        fn finished(&self, view: &WKWebView, _navigation: Option<&WKNavigation>) { self.publish(view); }

        #[unsafe(method(webView:didFailProvisionalNavigation:withError:))]
        fn failed_provisional(&self, view: &WKWebView, _navigation: Option<&WKNavigation>, error: &NSError) { self.failed(view, error); }

        #[unsafe(method(webView:didFailNavigation:withError:))]
        fn failed_navigation(&self, view: &WKWebView, _navigation: Option<&WKNavigation>, error: &NSError) { self.failed(view, error); }

        #[unsafe(method(webViewWebContentProcessDidTerminate:))]
        fn terminated(&self, view: &WKWebView) {
            *self.ivars().error.borrow_mut() = Some("The browser process stopped. Reload to try again.".into());
            self.publish(view);
        }
    }

    unsafe impl WKUIDelegate for BrowserDelegate {
        #[unsafe(method_id(webView:createWebViewWithConfiguration:forNavigationAction:windowFeatures:))]
        fn new_window(&self, view: &WKWebView, _configuration: &WKWebViewConfiguration, action: &WKNavigationAction, _features: &WKWindowFeatures) -> Option<Retained<WKWebView>> {
            let request = unsafe { action.request() };
            if request.URL().and_then(|url| url.absoluteString()).is_some_and(|url| normalize_url(&url.to_string()).is_ok()) {
                unsafe { view.loadRequest(&request); }
            }
            None
        }
    }
);

impl BrowserDelegate {
    fn protect(&self, view: &WKWebView) -> bool {
        let url = unsafe { view.URL() }.and_then(|url| url.absoluteString()).map(|s| s.to_string()).unwrap_or_default();
        let protected = self.ivars().protected.get() || website_credentials::protected(&self.ivars().app, &url).unwrap_or(true);
        if protected && !self.ivars().protected.replace(true) {
            NSUserDefaults::standardUserDefaults().setBool_forKey(true, &NSString::from_str(&format!("{}:protected", saved_url_key(&self.ivars().key))));
        }
        protected
    }

    fn agent_state(&self, view: &WKWebView) -> Result<Value, String> {
        let mut state = self.state(view);
        website_credentials::redact(&self.ivars().app, &mut state)?;
        Ok(state)
    }

    fn state(&self, view: &WKWebView) -> Value {
        let url = unsafe { view.URL() }.and_then(|url| url.absoluteString()).map(|url| url.to_string()).unwrap_or_default();
        self.protect(view);
        if normalize_url(&url).is_ok() {
            let saved_url = restorable_url(&self.ivars().app, &url).unwrap_or_default();
            if self.ivars().last_url.borrow().as_ref() != Some(&saved_url) {
                unsafe { NSUserDefaults::standardUserDefaults().setObject_forKey(Some(&NSString::from_str(&saved_url)), &saved_url_key(&self.ivars().key)); }
                *self.ivars().last_url.borrow_mut() = Some(saved_url);
            }
        }
        unsafe { serde_json::json!({
            "repositoryRoot":self.ivars().key.repository, "taskId":self.ivars().key.task,
            "url":url,
            "title":view.title().map(|title| title.to_string()).unwrap_or_default(),
            "canGoBack":view.canGoBack(), "canGoForward":view.canGoForward(),
            "loading":view.isLoading(), "visible":!view.isHidden(), "error":self.ivars().error.borrow().clone()
        }) }
    }

    fn publish(&self, view: &WKWebView) {
        let _ = self.ivars().app.emit_to(&self.ivars().key.window, "task-browser-state", self.state(view));
    }

    fn failed(&self, view: &WKWebView, error: &NSError) {
        if error.code() == -999 { return; } // Superseded navigation is not a page failure.
        *self.ivars().error.borrow_mut() = Some("The website failed to load. Reload to try again.".into());
        self.publish(view);
    }
}

pub(super) fn supported() -> bool {
    NSProcessInfo::processInfo().isOperatingSystemAtLeastVersion(NSOperatingSystemVersion { majorVersion: 11, minorVersion: 0, patchVersion: 0 })
}

fn ensure(app: &AppHandle, key: &Key, host: &WKWebView, mtm: MainThreadMarker) -> Result<(), String> {
    if repository_path_for_label(&app.state::<AppState>(), &key.window)? != key.repository { return Err("Repository changed.".into()); }
    if app.state::<BrowserState>().0.lock().map_err(|e| e.to_string())?.get(key).is_some_and(|gate| gate.closed.load(Ordering::Acquire)) {
        return Err("The browser session has closed.".into());
    }
    SESSIONS.with(|sessions| {
        let mut sessions = sessions.borrow_mut();
        if sessions.contains_key(key) { return Ok(()); }
        unsafe {
            let configuration = WKWebViewConfiguration::new(mtm);
            configuration.setWebsiteDataStore(&WKWebsiteDataStore::defaultDataStore(mtm));
            // WKWebView omits Safari's version tokens; use the installed Safari version for site detection.
            if let Some(version) = NSBundle::bundleWithPath(&NSString::from_str("/Applications/Safari.app"))
                .and_then(|bundle| bundle.objectForInfoDictionaryKey(&NSString::from_str("CFBundleShortVersionString")))
                .and_then(|value| value.downcast::<NSString>().ok()) {
                configuration.setApplicationNameForUserAgent(Some(&NSString::from_str(&format!("Version/{version} Safari/605.1.15"))));
            }
            let view = WKWebView::initWithFrame_configuration(WKWebView::alloc(mtm), NSRect::new(NSPoint::new(0.0, 0.0), NSSize::new(1024.0, 768.0)), &configuration);
            let delegate = BrowserDelegate::alloc(mtm).set_ivars(DelegateState { app: app.clone(), key: key.clone(), error: RefCell::new(None), last_url: RefCell::new(None), credential_references: RefCell::new(HashSet::new()), protected: Cell::new(NSUserDefaults::standardUserDefaults().boolForKey(&NSString::from_str(&format!("{}:protected", saved_url_key(key))))) });
            let delegate: Retained<BrowserDelegate> = msg_send![super(delegate), init];
            view.setNavigationDelegate(Some(ProtocolObject::from_ref(&*delegate)));
            view.setUIDelegate(Some(ProtocolObject::from_ref(&*delegate)));
            view.setHidden(true);
            host.addSubview(&view);
            if let Some(url) = NSUserDefaults::standardUserDefaults().stringForKey(&saved_url_key(key))
                .and_then(|url| restorable_url(app, &url.to_string())) {
                if let Some(url) = NSURL::URLWithString(&NSString::from_str(&url)) {
                    view.loadRequest(&NSURLRequest::requestWithURL(&url));
                }
            }
            sessions.insert(key.clone(), Session { view, delegate, visible: Cell::new(false) });
        }
        Ok(())
    })
}

type Reply = std::sync::mpsc::Sender<Result<Value, String>>;

async fn dispatch(app: &AppHandle, key: Key, gate: Arc<Gate>, create: bool, revision: Option<u64>, operation: impl FnOnce(Option<&Session>, Reply) + Send + 'static) -> Result<Value, String> {
    let window = app.get_webview_window(&key.window).ok_or("The repository window has closed.")?;
    let (send, receive) = std::sync::mpsc::channel();
    let handle = app.clone();
    window.with_webview(move |host| {
        if gate.closed.load(Ordering::Acquire) { let _ = send.send(Err("The browser session has closed.".into())); return; }
        if revision.is_some_and(|revision| !PRESENTATIONS.with(|state| state.borrow_mut().accept(&key.window, revision))) {
            let _ = send.send(Ok(Value::Null)); return;
        }
        let mtm = MainThreadMarker::new().expect("WebKit callbacks run on the main thread");
        let host = unsafe { &*host.inner().cast::<WKWebView>() };
        if create {
            if let Err(error) = ensure(&handle, &key, host, mtm) { let _ = send.send(Err(error)); return; }
        }
        SESSIONS.with(|sessions| operation(sessions.borrow().get(&key), send));
    }).map_err(|e| e.to_string())?;
    super::super::run_blocking(move || receive.recv_timeout(Duration::from_secs(20)).map_err(|_| "Browser operation timed out. Read the page before retrying.".to_owned())?).await
}

pub(super) async fn view(app: &AppHandle, key: Key, gate: Arc<Gate>, bounds: Option<Bounds>, visible: bool, revision: u64) -> Result<Value, String> {
    dispatch(app, key, gate, visible, Some(revision), move |session, reply| {
        let result = session.map(|session| {
            if visible {
                let bounds = bounds.expect("Visible browser bounds were validated");
                let host = unsafe { session.view.superview() }.expect("Browser is attached to the app webview");
                let y = if host.isFlipped() { bounds.y } else { host.bounds().size.height - bounds.y - bounds.height };
                let frame = NSRect::new(NSPoint::new(bounds.x, y), NSSize::new(bounds.width, bounds.height));
                if session.view.frame() != frame { session.view.setFrame(frame); }
            }
            session.visible.set(visible);
            let hidden = !visible || unsafe { session.view.URL() }.is_none();
            if session.view.isHidden() != hidden { session.view.setHidden(hidden); }
            session.delegate.state(&session.view)
        }).unwrap_or(Value::Null);
        let _ = reply.send(Ok(result));
    }).await
}

pub(super) async fn hide(app: &AppHandle, window: String, revision: u64) -> Result<(), String> {
    let (reply, receive) = tokio::sync::oneshot::channel();
    app.run_on_main_thread(move || {
        if PRESENTATIONS.with(|state| state.borrow_mut().accept(&window, revision)) {
            SESSIONS.with(|sessions| {
                for (_, session) in sessions.borrow().iter().filter(|(key, _)| key.window == window) {
                    session.visible.set(false);
                    session.view.setHidden(true);
                }
            });
        }
        let _ = reply.send(());
    }).map_err(|error| error.to_string())?;
    tokio::time::timeout(Duration::from_secs(2), receive).await.map_err(|_| "Browser hide timed out.")?.map_err(|error| error.to_string())
}

pub(super) async fn action(app: &AppHandle, key: Key, gate: Arc<Gate>, action: Action) -> Result<Value, String> {
    dispatch(app, key, gate, true, None, move |session, reply| {
        let session = session.expect("Browser was created");
        let view = &session.view;
        unsafe {
            match &action {
                Action::CredentialAvailability {} | Action::AutofillCredentials {} => {
                    let result = (|| {
                        if view.isLoading() { return Err("Wait for website navigation to finish before using saved credentials.".into()); }
                        let url = view.URL().and_then(|url| url.absoluteString()).map(|url| url.to_string()).unwrap_or_default();
                        let secret = website_credentials::for_url(&session.delegate.ivars().app, &url)?;
                        if matches!(action, Action::CredentialAvailability {}) {
                            return Ok(Some(serde_json::json!({"available":secret.is_some()})));
                        }
                        let secret = secret.ok_or("No saved login is available for this exact HTTPS origin.")?;
                        let origin = website_credentials::origin(&url)?;
                        // Protection is latched before dispatch and persists across navigation/restart.
                        session.delegate.ivars().protected.set(true);
                        NSUserDefaults::standardUserDefaults().setBool_forKey(true, &NSString::from_str(&format!("{}:protected", saved_url_key(&session.delegate.ivars().key))));
                        let script = format!("({})({})", include_str!("autofill.js"), serde_json::json!({"origin":origin,"username":secret.username,"email":secret.email,"password":secret.password}));
                        let callback = block2::RcBlock::new({ let reply = reply.clone(); move |value: *mut AnyObject, error: *mut NSError| {
                            let result = (|| {
                                if !error.is_null() { return Err("Secure login filling failed.".into()); }
                                let string = value.as_ref().and_then(|v| v.downcast_ref::<NSString>()).ok_or("Secure login filling failed.")?;
                                let value: Value = serde_json::from_str(&string.to_string()).map_err(|_| "Secure login filling failed.")?;
                                let count = value["fieldsFilled"].as_u64().filter(|n| (2..=3).contains(n));
                                if value["filled"] != true || count.is_none() { return Err("Secure login filling was refused. Check the origin and login fields.".into()); }
                                Ok(serde_json::json!({"filled":true,"fieldsFilled":count}))
                            })();
                            let _ = reply.send(result);
                        }});
                        view.evaluateJavaScript_inFrame_inContentWorld_completionHandler(&NSString::from_str(&script), None, &WKContentWorld::defaultClientWorld(MainThreadMarker::new().unwrap()), Some(&callback));
                        Ok(None)
                    })();
                    if let Some(result) = result.transpose() { let _ = reply.send(result); }
                    return;
                }
                Action::Navigate { url } => {
                    let url = NSURL::URLWithString(&NSString::from_str(url)).expect("Validated browser URL");
                    view.setHidden(!session.visible.get());
                    view.loadRequest(&NSURLRequest::requestWithURL(&url));
                }
                Action::Back {} => { if !view.canGoBack() { let _ = reply.send(Err("No previous page.".into())); return; } view.goBack(); }
                Action::Forward {} => { if !view.canGoForward() { let _ = reply.send(Err("No next page.".into())); return; } view.goForward(); }
                Action::Reload {} => { view.reload(); }
                Action::Screenshot {} => {
                    if session.delegate.protect(view) { let _ = reply.send(Err("Screenshots may expose login values in this browser session. Use get_task_browser to read the page with credentials redacted.".into())); return; }
                    let delegate = session.delegate.clone();
                    let screenshot_view = session.view.clone();
                    let callback = block2::RcBlock::new(move |image: *mut objc2_app_kit::NSImage, error: *mut NSError| {
                        let result = (|| {
                            if delegate.protect(&screenshot_view) { return Err("Screenshots may expose login values in this browser session. Use get_task_browser to read the page with credentials redacted.".into()); }
                            if !error.is_null() { return Err("Browser screenshot failed.".into()); }
                            let image = image.as_ref().ok_or("Browser screenshot is unavailable.")?;
                            let data = image.TIFFRepresentation().ok_or("Cannot encode browser screenshot.")?;
                            let bitmap = NSBitmapImageRep::initWithData(NSBitmapImageRep::alloc(), &data).ok_or("Cannot decode browser screenshot.")?;
                            let png: Retained<NSData> = bitmap.representationUsingType_properties(NSBitmapImageFileType::PNG, &NSDictionary::new()).ok_or("Cannot encode PNG screenshot.")?;
                            if png.len() > 8 * 1024 * 1024 { return Err("Screenshot exceeds 8 MiB. Reduce the browser viewport.".into()); }
                            use base64::Engine;
                            Ok(serde_json::json!({"png":base64::engine::general_purpose::STANDARD.encode(png.to_vec())}))
                        })();
                        let _ = reply.send(result);
                    });
                    view.takeSnapshotWithConfiguration_completionHandler(None, &callback);
                    return;
                }
                _ => {
                    if view.URL().is_none() {
                        let result = if matches!(action, Action::Snapshot {}) {
                            session.delegate.agent_state(view).map(|browser| serde_json::json!({"url":"", "title":"", "text":"", "elements":[], "frames":[], "browser":browser}))
                        } else { Err("Open a website before interacting with the page.".into()) };
                        let _ = reply.send(result);
                        return;
                    }
                    if matches!(&action, Action::Key { reference, key } if ["Backspace", "Delete"].contains(&key.as_str()) && session.delegate.ivars().credential_references.borrow().contains(reference)) {
                        let _ = reply.send(Err("Use secure autofill to replace saved login fields.".into())); return;
                    }
                    let mut arguments = serde_json::to_value(&action).unwrap();
                    let padding = match website_credentials::redaction_padding(&session.delegate.ivars().app) {
                        Ok(padding) => padding,
                        Err(error) => { let _ = reply.send(Err(error)); return; }
                    };
                    // Include lookahead so truncation cannot expose a prefix of a credential.
                    arguments["redactionPadding"] = serde_json::json!(padding);
                    let script = format!("({})({})", include_str!("page.js"), arguments);
                    let delegate = session.delegate.clone();
                    let page_view = session.view.clone();
                    let callback = block2::RcBlock::new(move |value: *mut AnyObject, error: *mut NSError| {
                        let result = (|| {
                            if !error.is_null() { return Err("Browser page action failed. Read the page before retrying.".into()); }
                            let string = value.as_ref().and_then(|value| value.downcast_ref::<NSString>()).ok_or("Browser returned no page data.")?;
                            if string.len() > 512 * 1024 { return Err("Browser response exceeds 512 KiB.".into()); }
                            let mut value: Value = serde_json::from_str(&string.to_string()).map_err(|_| "Browser returned invalid page data.")?;
                            website_credentials::redact(&delegate.ivars().app, &mut value)?;
                            if let Some(elements) = value.get("elements").and_then(Value::as_array) {
                                *delegate.ivars().credential_references.borrow_mut() = elements.iter().filter(|element| element["credentialField"] == true)
                                    .filter_map(|element| element["reference"].as_str().map(str::to_owned)).collect();
                            }
                            if let Some(error) = value.get("error").and_then(Value::as_str) { return Err(error.into()); }
                            value["browser"] = delegate.agent_state(&page_view)?;
                            Ok(value)
                        })();
                        let _ = reply.send(result);
                    });
                    view.evaluateJavaScript_inFrame_inContentWorld_completionHandler(&NSString::from_str(&script), None, &WKContentWorld::defaultClientWorld(MainThreadMarker::new().unwrap()), Some(&callback));
                    return;
                }
            }
        }
        session.delegate.publish(view);
        let _ = reply.send(session.delegate.agent_state(view));
    }).await
}

pub(super) fn close(app: &AppHandle, window: String, task: Option<String>) {
    let deleted = task.as_ref().and_then(|task| repository_path_for_label(&app.state::<AppState>(), &window).ok()
        .map(|repository| Key { window: window.clone(), repository, task: task.clone() }));
    let _ = app.run_on_main_thread(move || SESSIONS.with(|sessions| {
        sessions.borrow_mut().retain(|key, session| {
            if key.window != window || task.as_ref().is_some_and(|task| key.task != *task) { return true; }
            if task.is_none() { session.delegate.state(&session.view); }
            unsafe { session.view.stopLoading(); session.view.setNavigationDelegate(None); session.view.setUIDelegate(None); }
            session.view.removeFromSuperview();
            false
        });
        if let Some(key) = deleted { NSUserDefaults::standardUserDefaults().removeObjectForKey(&saved_url_key(&key)); }
    }));
}

#[cfg(feature = "browser-qa")]
pub(super) async fn fixture(app: &AppHandle, key: Key, gate: Arc<Gate>, url: String, html: Option<String>) -> Result<Value, String> {
    dispatch(app, key, gate, true, None, move |session, reply| {
        let session = session.unwrap();
        unsafe {
            if let Some(html) = html {
                let Some(url) = NSURL::URLWithString(&NSString::from_str(&url)) else { let _ = reply.send(Err("Invalid fixture URL".into())); return; };
                session.view.loadHTMLString_baseURL(&NSString::from_str(&html), Some(&url));
                let _ = reply.send(Ok(Value::Bool(true)));
            } else {
                let callback = block2::RcBlock::new(move |value: *mut AnyObject, error: *mut NSError| {
                    let result = if error.is_null() {
                        value.as_ref().and_then(|v| v.downcast_ref::<NSString>()).map(|s| Value::Bool(s.to_string() == "true")).ok_or("No fixture result".into())
                    } else { Err("Fixture check failed".into()) };
                    let _ = reply.send(result);
                });
                session.view.evaluateJavaScript_inFrame_inContentWorld_completionHandler(&NSString::from_str("String(document.body?.dataset.qaFilled === 'true')"), None, &WKContentWorld::defaultClientWorld(MainThreadMarker::new().unwrap()), Some(&callback));
            }
        }
    }).await
}

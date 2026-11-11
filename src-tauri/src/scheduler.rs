use super::{
    frontend_storage_file, read_repository_tasks, repository_path_for_label, AppState,
    FRONTEND_STORAGE_LOCK,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    fs,
    path::Path,
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ScheduledRun {
    pub id: String,
    pub window_label: String,
    pub scheduled_at: u64,
    pub started_at: u64,
    pub finished_at: Option<u64>,
    pub status: String,
    pub error: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PromptSchedule {
    pub id: String,
    pub repository_root: String,
    pub task_id: String,
    pub title: String,
    pub prompt: String,
    pub run_at: u64,
    pub interval_minutes: Option<u64>,
    pub enabled: bool,
    pub next_run_at: Option<u64>,
    pub run_now_requested: bool,
    pub pause_reason: Option<String>,
    pub latest_run: Option<ScheduledRun>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CreateInput {
    task_id: String,
    title: String,
    prompt: String,
    run_at: u64,
    interval_minutes: Option<u64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct UpdateInput {
    id: String,
    title: Option<String>,
    prompt: Option<String>,
    run_at: Option<u64>,
    // null switches a recurring schedule back to one-time.
    #[serde(default, deserialize_with = "optional_interval")]
    interval_minutes: Option<Option<u64>>,
    enabled: Option<bool>,
}

fn optional_interval<'de, D: serde::Deserializer<'de>>(
    d: D,
) -> Result<Option<Option<u64>>, D::Error> {
    Option::<u64>::deserialize(d).map(Some)
}

pub fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn validate_text(title: &str, prompt: &str) -> Result<(), String> {
    if title.trim().is_empty()
        || title.len() > 200
        || prompt.trim().is_empty()
        || prompt.len() > 20_000
    {
        return Err("Provide a title (up to 200 bytes) and prompt (up to 20,000 bytes).".into());
    }
    Ok(())
}

fn validate_time(run_at: u64, interval: Option<u64>, timestamp: u64) -> Result<(), String> {
    if run_at <= timestamp
        || run_at > 8_640_000_000_000_000
        || interval.is_some_and(|v| v == 0 || v > 525_600_000)
    {
        return Err("runAt must be a future Unix timestamp in milliseconds; intervalMinutes must be a positive whole number (at most 525600000).".into());
    }
    Ok(())
}

impl PromptSchedule {
    fn running(&self) -> bool {
        self.latest_run
            .as_ref()
            .is_some_and(|r| r.status == "running")
    }

    fn claim(&mut self, timestamp: u64, window_label: &str) -> Option<ScheduledRun> {
        if self.running()
            || (!self.run_now_requested
                && (!self.enabled || self.next_run_at.is_none_or(|at| at > timestamp)))
        {
            return None;
        }
        let scheduled_at = self.next_run_at.unwrap_or(timestamp);
        let run = ScheduledRun {
            id: format!("schedule-{}-{}", self.id, super::mcp_bearer_token()),
            window_label: window_label.into(),
            scheduled_at,
            started_at: timestamp,
            finished_at: None,
            status: "running".into(),
            error: None,
        };
        self.latest_run = Some(run.clone());
        self.run_now_requested = false;
        self.pause_reason = None;
        Some(run)
    }

    fn finish(
        &mut self,
        occurrence_id: &str,
        status: &str,
        error: Option<String>,
        timestamp: u64,
    ) -> Result<(), String> {
        if !matches!(status, "completed" | "failed" | "cancelled" | "interrupted") {
            return Err("Invalid scheduled run status".into());
        }
        let Some(run) = self
            .latest_run
            .as_mut()
            .filter(|r| r.id == occurrence_id && r.status == "running")
        else {
            return Ok(());
        };
        run.status = status.into();
        run.finished_at = Some(timestamp);
        run.error = error;
        if status == "completed" {
            self.next_run_at = self.interval_minutes.and_then(|minutes| {
                let interval = minutes.checked_mul(60_000)?;
                let steps = timestamp.saturating_sub(run.scheduled_at) / interval + 1;
                run.scheduled_at
                    .checked_add(steps.checked_mul(interval)?)
                    .filter(|at| *at <= 8_640_000_000_000_000)
            });
            if self.next_run_at.is_none() {
                self.enabled = false;
            }
        } else {
            self.enabled = false;
            self.pause_reason = Some(format!("Run {status}. Inspect the task before retrying."));
        }
        Ok(())
    }
}

#[derive(Default)]
pub struct Scheduler(Mutex<Option<Vec<PromptSchedule>>>);

impl Scheduler {
    fn access<T>(
        &self,
        path: &Path,
        mutate: bool,
        f: impl FnOnce(&mut Vec<PromptSchedule>) -> Result<T, String>,
    ) -> Result<T, String> {
        let mut saved = self.0.lock().map_err(|_| "Scheduler is unavailable")?;
        if saved.is_none() {
            let mut schedules: Vec<PromptSchedule> = match fs::read(path) {
                Ok(bytes) => serde_json::from_slice(&bytes)
                    .map_err(|e| format!("Schedule storage is invalid: {e}"))?,
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => vec![],
                Err(e) => return Err(format!("Cannot read schedules: {e}")),
            };
            let mut ids = std::collections::HashSet::new();
            for schedule in &schedules {
                validate_text(&schedule.title, &schedule.prompt)?;
                if !ids.insert(&schedule.id)
                    || schedule.id.is_empty()
                    || !super::valid_task_id(&schedule.task_id)
                    || schedule.run_at == 0
                    || schedule.run_at > 8_640_000_000_000_000
                    || schedule
                        .next_run_at
                        .is_some_and(|at| at == 0 || at > 8_640_000_000_000_000)
                    || schedule
                        .interval_minutes
                        .is_some_and(|v| v == 0 || v > 525_600_000)
                    || schedule.latest_run.as_ref().is_some_and(|run| {
                        !matches!(
                            run.status.as_str(),
                            "running" | "completed" | "failed" | "cancelled" | "interrupted"
                        )
                    })
                {
                    return Err("Schedule storage is invalid. The file was kept unchanged.".into());
                }
            }
            let mut recovered = false;
            for schedule in &mut schedules {
                if let Some(run) = schedule
                    .latest_run
                    .clone()
                    .filter(|r| r.status == "running")
                {
                    schedule.finish(&run.id, "interrupted", Some("The app closed before this run finished. Inspect the task before retrying.".into()), now())?;
                    recovered = true;
                }
            }
            if recovered {
                write(path, &schedules)?;
            }
            *saved = Some(schedules);
        }
        let mut next = saved.as_ref().unwrap().clone();
        let result = f(&mut next)?;
        if mutate && saved.as_ref() != Some(&next) {
            write(path, &next)?;
            *saved = Some(next);
        }
        Ok(result)
    }
}

fn write(path: &Path, schedules: &[PromptSchedule]) -> Result<(), String> {
    fs::create_dir_all(path.parent().ok_or("Invalid schedule path")?).map_err(|e| e.to_string())?;
    let temporary = path.with_extension("json.tmp");
    fs::write(
        &temporary,
        serde_json::to_vec_pretty(schedules).map_err(|e| e.to_string())?,
    )
    .map_err(|e| format!("Cannot save schedules: {e}"))?;
    fs::rename(temporary, path).map_err(|e| format!("Cannot finish saving schedules: {e}"))
}

fn access<T>(
    app: &AppHandle,
    mutate: bool,
    f: impl FnOnce(&mut Vec<PromptSchedule>) -> Result<T, String>,
) -> Result<T, String> {
    let path = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("prompt-schedules.json");
    let result = app.state::<Scheduler>().access(&path, mutate, f)?;
    if mutate {
        let _ = app.emit("prompt-schedules-changed", ());
    }
    Ok(result)
}

fn root(app: &AppHandle, label: &str) -> Result<String, String> {
    Ok(repository_path_for_label(&app.state::<AppState>(), label)?
        .to_string_lossy()
        .into_owned())
}

fn tasks(app: &AppHandle, root: &str) -> Result<HashMap<String, bool>, String> {
    let _guard = FRONTEND_STORAGE_LOCK.lock().map_err(|e| e.to_string())?;
    let value: Value = serde_json::from_str(
        read_repository_tasks(&frontend_storage_file(app)?, root)?.as_deref().unwrap_or("[]"),
    ).map_err(|e| format!("Task storage is invalid: {e}"))?;
    let items = &value;
    items
        .as_array()
        .ok_or("Task storage is invalid")?
        .iter()
        .map(|task| {
            Ok((
                task.get("id")
                    .and_then(Value::as_str)
                    .ok_or("Invalid task ID")?
                    .to_owned(),
                task.get("completed")
                    .and_then(Value::as_bool)
                    .ok_or("Invalid task completion state")?,
            ))
        })
        .collect()
}

fn eligible(tasks: &HashMap<String, bool>, task_id: &str) -> Result<(), String> {
    match tasks.get(task_id) {
        Some(false) => Ok(()),
        Some(true) => Err("Task is Done. Reopen it before resuming its schedules.".into()),
        None => Err("Task no longer exists in this repository.".into()),
    }
}

fn find<'a>(
    schedules: &'a mut [PromptSchedule],
    root: &str,
    id: &str,
) -> Result<&'a mut PromptSchedule, String> {
    schedules
        .iter_mut()
        .find(|s| s.repository_root == root && s.id == id)
        .ok_or_else(|| "Schedule not found in this repository".into())
}

fn reconcile(schedules: &mut [PromptSchedule], root: &str, tasks: &HashMap<String, bool>) {
    for schedule in schedules.iter_mut().filter(|s| s.repository_root == root) {
        if let Err(reason) = eligible(tasks, &schedule.task_id) {
            schedule.enabled = false;
            schedule.run_now_requested = false;
            schedule.pause_reason = Some(reason);
        } else if schedule
            .pause_reason
            .as_ref()
            .is_some_and(|reason| reason.starts_with("Task "))
        {
            schedule.pause_reason = Some("Paused. Resume to continue.".into());
        }
    }
}

pub fn call(app: &AppHandle, label: &str, name: &str, arguments: Value) -> Result<Value, String> {
    let root = root(app, label)?;
    let tasks = tasks(app, &root)?;
    access(app, true, |schedules| {
        apply(schedules, &root, &tasks, name, arguments)
    })
}

fn apply(
    schedules: &mut Vec<PromptSchedule>,
    root: &str,
    tasks: &HashMap<String, bool>,
    name: &str,
    arguments: Value,
) -> Result<Value, String> {
    reconcile(schedules, root, tasks);
    match name {
        "list_prompt_schedules" => Ok(json!(schedules
            .iter()
            .filter(|s| s.repository_root == root)
            .collect::<Vec<_>>())),
        "create_prompt_schedule" => {
            let input: CreateInput =
                serde_json::from_value(arguments).map_err(|e| format!("Invalid schedule: {e}"))?;
            eligible(tasks, &input.task_id)?;
            validate_text(&input.title, &input.prompt)?;
            validate_time(input.run_at, input.interval_minutes, now())?;
            let schedule = PromptSchedule {
                id: super::mcp_bearer_token(),
                repository_root: root.to_owned(),
                task_id: input.task_id,
                title: input.title.trim().into(),
                prompt: input.prompt.trim().into(),
                run_at: input.run_at,
                interval_minutes: input.interval_minutes,
                enabled: true,
                next_run_at: Some(input.run_at),
                run_now_requested: false,
                pause_reason: None,
                latest_run: None,
            };
            schedules.push(schedule.clone());
            Ok(json!(schedule))
        }
        "update_prompt_schedule" => {
            let input: UpdateInput = serde_json::from_value(arguments)
                .map_err(|e| format!("Invalid schedule update: {e}"))?;
            let schedule = find(schedules, root, &input.id)?;
            if schedule.running()
                && (input.run_at.is_some()
                    || input.interval_minutes.is_some()
                    || input.prompt.is_some())
            {
                return Err(
                    "Wait for the current scheduled run before changing its prompt or timing."
                        .into(),
                );
            }
            if let Some(title) = input.title {
                schedule.title = title.trim().into();
            }
            if let Some(prompt) = input.prompt {
                schedule.prompt = prompt.trim().into();
            }
            if let Some(interval) = input.interval_minutes {
                schedule.interval_minutes = interval;
            }
            if let Some(run_at) = input.run_at {
                validate_time(run_at, schedule.interval_minutes, now())?;
                schedule.run_at = run_at;
                schedule.next_run_at = Some(run_at);
            }
            validate_text(&schedule.title, &schedule.prompt)?;
            if schedule
                .interval_minutes
                .is_some_and(|v| v == 0 || v > 525_600_000)
            {
                return Err("Invalid intervalMinutes".into());
            }
            if let Some(enabled) = input.enabled {
                if enabled {
                    eligible(tasks, &schedule.task_id)?;
                    if schedule.next_run_at.is_none() {
                        return Err("This one-time schedule has finished. Set a future runAt or use Run now.".into());
                    }
                }
                schedule.enabled = enabled;
                schedule.run_now_requested = false;
                schedule.pause_reason = if enabled { None } else { Some("Paused".into()) };
            }
            Ok(json!(schedule))
        }
        "delete_prompt_schedule" => {
            let id = arguments
                .get("id")
                .and_then(Value::as_str)
                .ok_or("Provide a schedule id")?;
            find(schedules, root, id)?;
            schedules.retain(|s| s.repository_root != root || s.id != id);
            Ok(json!({"deleted": true}))
        }
        _ => Err("Unknown scheduler tool".into()),
    }
}

#[tauri::command]
pub fn scheduler_list(
    app: AppHandle,
    window: WebviewWindow,
) -> Result<Vec<PromptSchedule>, String> {
    let root = root(&app, window.label())?;
    let tasks = tasks(&app, &root)?;
    // Only emit after explicit actions; polling reconciliation must not trigger another poll.
    let path = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("prompt-schedules.json");
    app.state::<Scheduler>().access(&path, true, |schedules| {
        reconcile(schedules, &root, &tasks);
        Ok(schedules
            .iter()
            .filter(|s| s.repository_root == root)
            .cloned()
            .collect())
    })
}

#[tauri::command]
pub fn scheduler_update(
    app: AppHandle,
    window: WebviewWindow,
    arguments: Value,
) -> Result<Value, String> {
    call(&app, window.label(), "update_prompt_schedule", arguments)
}

#[tauri::command]
pub fn scheduler_delete(
    app: AppHandle,
    window: WebviewWindow,
    id: String,
) -> Result<Value, String> {
    call(
        &app,
        window.label(),
        "delete_prompt_schedule",
        json!({"id": id}),
    )
}

#[tauri::command]
pub fn scheduler_run_now(app: AppHandle, window: WebviewWindow, id: String) -> Result<(), String> {
    let root = root(&app, window.label())?;
    let tasks = tasks(&app, &root)?;
    access(&app, true, |schedules| {
        let schedule = find(schedules, &root, &id)?;
        eligible(&tasks, &schedule.task_id)?;
        if schedule.running() {
            return Err("This schedule is already running.".into());
        }
        schedule.run_now_requested = true;
        schedule.pause_reason = None;
        Ok(())
    })
}

#[tauri::command]
pub fn scheduler_claim(
    app: AppHandle,
    window: WebviewWindow,
    id: String,
) -> Result<Option<PromptSchedule>, String> {
    let root = root(&app, window.label())?;
    let tasks = tasks(&app, &root)?;
    access(&app, true, |schedules| {
        let schedule = find(schedules, &root, &id)?;
        eligible(&tasks, &schedule.task_id)?;
        Ok(schedule
            .claim(now(), window.label())
            .map(|_| schedule.clone()))
    })
}

#[tauri::command]
pub fn scheduler_finish(
    app: AppHandle,
    window: WebviewWindow,
    id: String,
    occurrence_id: String,
    status: String,
    error: Option<String>,
) -> Result<(), String> {
    access(&app, true, |schedules| {
        if let Some(schedule) = schedules.iter_mut().find(|s| {
            s.id == id
                && s.latest_run
                    .as_ref()
                    .is_some_and(|r| r.window_label == window.label())
        }) {
            schedule.finish(&occurrence_id, &status, error, now())?;
        }
        Ok(())
    })
}

pub fn interrupt_window(app: &AppHandle, label: &str) {
    let _ = access(app, true, |schedules| {
        for schedule in schedules {
            if let Some(run) = schedule
                .latest_run
                .clone()
                .filter(|r| r.window_label == label && r.status == "running")
            {
                schedule.finish(&run.id, "interrupted", Some("The repository window closed or changed before the run finished. Inspect the task before retrying.".into()), now())?;
            }
        }
        Ok(())
    });
}

pub fn tools() -> Vec<Value> {
    let id = json!({"type":"string", "description":"Schedule ID from list_prompt_schedules"});
    let mut tools = vec![];
    for (name, description, properties, required) in [
        ("create_prompt_schedule", "Schedule a task prompt while its repository is open. Missed runs catch up once. Done tasks and failed runs pause. Recurrence uses fixed intervals, not local calendar days.", json!({"taskId":{"type":"string"},"title":{"type":"string"},"prompt":{"type":"string"},"runAt":{"type":"integer","description":"Future Unix milliseconds"},"intervalMinutes":{"type":"integer","minimum":1}}), vec!["taskId","title","prompt","runAt"]),
        ("list_prompt_schedules", "List task prompt schedules for the current repository.", json!({}), vec![]),
        ("update_prompt_schedule", "Edit or pause/resume a task prompt schedule. intervalMinutes null makes it one-time. Reopen Done tasks before resuming.", json!({"id":id,"title":{"type":"string"},"prompt":{"type":"string"},"runAt":{"type":"integer"},"intervalMinutes":{"type":["integer","null"],"minimum":1},"enabled":{"type":"boolean"}}), vec!["id"]),
        ("delete_prompt_schedule", "Delete a schedule without cancelling a running agent.", json!({"id":id}), vec!["id"]),
    ] {
        tools.push(json!({"name":name,"description":description,"inputSchema":{"type":"object","properties":properties,"required":required,"additionalProperties":false}}));
    }
    tools
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;

    fn schedule() -> PromptSchedule {
        PromptSchedule {
            id: "example".into(),
            repository_root: "/repo".into(),
            task_id: "12345678-1234-1234-1234-123456789abc".into(),
            title: "Check build".into(),
            prompt: "Check the build again".into(),
            run_at: 100_000,
            interval_minutes: Some(1),
            enabled: true,
            next_run_at: Some(100_000),
            run_now_requested: false,
            pause_reason: None,
            latest_run: None,
        }
    }

    fn temp() -> std::path::PathBuf {
        std::env::temp_dir()
            .join(format!(
                "lotse-schedules-{}",
                super::super::mcp_bearer_token()
            ))
            .join("schedules.json")
    }

    #[test]
    fn validates_inputs_and_nullable_interval_update() {
        assert!(validate_text("", "prompt").is_err());
        assert!(validate_text("title", " ").is_err());
        assert!(validate_text("title", &"x".repeat(20_001)).is_err());
        for (at, interval) in [
            (100, None),
            (99, None),
            (101, Some(0)),
            (101, Some(u64::MAX)),
            (u64::MAX, None),
        ] {
            assert!(validate_time(at, interval, 100).is_err());
        }
        assert!(validate_time(101, Some(1), 100).is_ok());
        assert!(serde_json::from_value::<CreateInput>(
            json!({"taskId":"id","title":"t","prompt":"p","runAt":100,"intervalMinutes":1.5})
        )
        .is_err());
        assert!(serde_json::from_value::<CreateInput>(
            json!({"taskId":"id","title":"t","prompt":"p","runAt":-1})
        )
        .is_err());
        let missing: UpdateInput = serde_json::from_value(json!({"id":"id"})).unwrap();
        let cleared: UpdateInput =
            serde_json::from_value(json!({"id":"id","intervalMinutes":null})).unwrap();
        assert_eq!(missing.interval_minutes, None);
        assert_eq!(cleared.interval_minutes, Some(None));
        let names: Vec<_> = tools()
            .iter()
            .map(|tool| tool["name"].as_str().unwrap().to_owned())
            .collect();
        assert_eq!(names.len(), 4);
        assert!(names.contains(&"create_prompt_schedule".to_owned()));
    }

    #[test]
    fn agent_crud_is_scoped_validated_and_transactional() {
        let path = temp();
        let runtime = Scheduler::default();
        let tasks = HashMap::from([(schedule().task_id, false)]);
        let arguments = json!({"taskId":schedule().task_id,"title":"Build","prompt":"Check it","runAt":now()+60_000,"intervalMinutes":60});
        let created = runtime
            .access(&path, true, |entries| {
                apply(
                    entries,
                    "/repo",
                    &tasks,
                    "create_prompt_schedule",
                    arguments,
                )
            })
            .unwrap();
        let id = created["id"].as_str().unwrap();
        assert!(runtime
            .access(&path, true, |entries| apply(
                entries,
                "/other",
                &tasks,
                "delete_prompt_schedule",
                json!({"id":id})
            ))
            .is_err());
        assert!(runtime
            .access(&path, true, |entries| apply(
                entries,
                "/repo",
                &tasks,
                "update_prompt_schedule",
                json!({"id":id,"title":"Changed","prompt":""})
            ))
            .is_err());
        let listed = runtime
            .access(&path, false, |entries| {
                apply(entries, "/repo", &tasks, "list_prompt_schedules", json!({}))
            })
            .unwrap();
        assert_eq!(
            listed[0]["title"], "Build",
            "failed edits must not partially update storage"
        );
        let updated = runtime
            .access(&path, true, |entries| {
                apply(
                    entries,
                    "/repo",
                    &tasks,
                    "update_prompt_schedule",
                    json!({"id":id,"intervalMinutes":null,"enabled":false}),
                )
            })
            .unwrap();
        assert_eq!(updated["intervalMinutes"], Value::Null);
        assert_eq!(updated["enabled"], false);
        let done = HashMap::from([(schedule().task_id, true)]);
        assert!(runtime
            .access(&path, true, |entries| apply(
                entries,
                "/repo",
                &done,
                "update_prompt_schedule",
                json!({"id":id,"enabled":true})
            ))
            .is_err());
        runtime
            .access(&path, true, |entries| {
                apply(
                    entries,
                    "/repo",
                    &tasks,
                    "delete_prompt_schedule",
                    json!({"id":id}),
                )
            })
            .unwrap();
        assert!(runtime
            .access(&path, false, |entries| Ok(entries.is_empty()))
            .unwrap());
        fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }

    #[test]
    fn coalesces_overdue_runs_and_preserves_cadence() {
        let mut schedule = schedule();
        assert!(schedule.claim(99_999, "main").is_none());
        let run = schedule.claim(310_000, "main").unwrap();
        assert_eq!(run.scheduled_at, 100_000);
        assert!(schedule.claim(310_001, "other").is_none());
        schedule
            .finish("stale-id", "completed", None, 320_000)
            .unwrap();
        assert!(schedule.running());
        schedule
            .finish(&run.id, "completed", None, 320_000)
            .unwrap();
        assert_eq!(schedule.next_run_at, Some(340_000));
        assert!(schedule.claim(339_999, "main").is_none());
        assert!(schedule.claim(340_000, "main").is_some());
    }

    #[test]
    fn one_time_failure_cancellation_and_manual_run() {
        let mut schedule = schedule();
        schedule.interval_minutes = None;
        let first = schedule.claim(100_000, "main").unwrap();
        schedule
            .finish(&first.id, "failed", Some("Login required".into()), 110_000)
            .unwrap();
        assert!(!schedule.enabled);
        assert_eq!(schedule.next_run_at, Some(100_000));
        assert!(schedule.claim(200_000, "main").is_none());
        schedule.run_now_requested = true;
        let retry = schedule.claim(200_000, "main").unwrap();
        assert_ne!(first.id, retry.id);
        schedule
            .finish(&retry.id, "completed", None, 201_000)
            .unwrap();
        assert_eq!(schedule.next_run_at, None);
        assert!(!schedule.enabled);
        schedule.run_now_requested = true;
        let retry = schedule.claim(202_000, "main").unwrap();
        schedule
            .finish(&retry.id, "cancelled", None, 203_000)
            .unwrap();
        assert_eq!(schedule.latest_run.unwrap().status, "cancelled");
    }

    #[test]
    fn run_now_while_paused_consumes_next_occurrence_without_resuming() {
        let mut schedule = schedule();
        schedule.enabled = false;
        schedule.run_now_requested = true;
        let run = schedule.claim(50_000, "main").unwrap();
        schedule.finish(&run.id, "completed", None, 51_000).unwrap();
        assert_eq!(schedule.next_run_at, Some(160_000));
        assert!(!schedule.enabled);
        assert!(!schedule.run_now_requested);
    }

    #[test]
    fn isolates_repositories_and_pauses_done_or_missing_targets() {
        let mut entries = vec![
            schedule(),
            PromptSchedule {
                id: "other".into(),
                repository_root: "/other".into(),
                ..schedule()
            },
        ];
        assert!(find(&mut entries, "/other", "example").is_err());
        let tasks = HashMap::from([(schedule().task_id, true)]);
        reconcile(&mut entries, "/repo", &tasks);
        assert!(!entries[0].enabled);
        assert!(entries[1].enabled);
        assert!(entries[0].pause_reason.as_ref().unwrap().contains("Done"));
        assert!(eligible(&tasks, &entries[0].task_id).is_err());
        reconcile(&mut entries, "/repo", &HashMap::new());
        assert!(entries[0]
            .pause_reason
            .as_ref()
            .unwrap()
            .contains("no longer exists"));
        reconcile(
            &mut entries,
            "/repo",
            &HashMap::from([(schedule().task_id, false)]),
        );
        assert!(
            !entries[0].enabled,
            "reopening a task must not silently resume a schedule"
        );
    }

    #[test]
    fn persists_recovers_and_serializes_simultaneous_claims() {
        let path = temp();
        let runtime = Arc::new(Scheduler::default());
        runtime
            .access(&path, true, |schedules| {
                schedules.push(schedule());
                Ok(())
            })
            .unwrap();
        let handles: Vec<_> = (0..8)
            .map(|_| {
                let runtime = runtime.clone();
                let path = path.clone();
                std::thread::spawn(move || {
                    runtime
                        .access(&path, true, |schedules| {
                            Ok(schedules[0].claim(100_000, "main").is_some())
                        })
                        .unwrap()
                })
            })
            .collect();
        assert_eq!(
            handles
                .into_iter()
                .filter_map(|h| h.join().unwrap().then_some(()))
                .count(),
            1
        );
        let restarted = Scheduler::default();
        let recovered = restarted
            .access(&path, false, |schedules| Ok(schedules[0].clone()))
            .unwrap();
        assert!(!recovered.enabled);
        assert_eq!(recovered.latest_run.unwrap().status, "interrupted");
        let persisted: Vec<PromptSchedule> =
            serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
        assert_eq!(
            persisted[0].latest_run.as_ref().unwrap().status,
            "interrupted"
        );
        fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }

    #[test]
    fn corrupt_storage_and_failed_writes_preserve_existing_data() {
        let path = temp();
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(&path, "broken").unwrap();
        assert!(Scheduler::default()
            .access(&path, true, |_| Ok(()))
            .is_err());
        assert_eq!(fs::read_to_string(&path).unwrap(), "broken");
        write(&path, &[schedule()]).unwrap();
        let runtime = Scheduler::default();
        runtime.access(&path, false, |_| Ok(())).unwrap();
        fs::create_dir(path.with_extension("json.tmp")).unwrap();
        assert!(runtime
            .access(&path, true, |schedules| {
                schedules[0].claim(100_000, "main");
                Ok(())
            })
            .is_err());
        assert!(!runtime
            .access(&path, false, |schedules| Ok(schedules[0].running()))
            .unwrap());
        let persisted: Vec<PromptSchedule> =
            serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
        assert!(!persisted[0].running());
        fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }
}

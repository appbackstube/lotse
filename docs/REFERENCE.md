# Lotse usage and development reference

Detailed behavior, integration setup, storage, testing, and release notes for contributors and advanced users. Start with the [project overview and quick start](../README.md). Commands and file paths below are relative to the repository root unless stated otherwise.

Manage reusable roles and prompts under Settings → Agents and Settings → Playbooks. The chat menus link directly to these pages. Drafts stay available when switching settings pages; closing Settings asks before discarding unsaved changes.

## Warning checks

Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run check:rust`, and `cargo test --manifest-path src-tauri/Cargo.toml --lib`. The web build also runs lint/type checks and rejects JavaScript chunks over 500 kB. React 19.2 or newer is required for effect events; TypeScript tests use `tsx` without suppressing Node warnings.

With `agent-browser` installed and `npm run dev` listening on port 1430, run `npm run test:browser`. Each synthetic suite uses an isolated browser and fails on console warnings or page errors. `npm run test:production` builds separate production App/export fixtures, starts its own preview on port 1432, and checks the native content policy, lazy drawing, diagrams, offline SVG font embedding and PNG scene metadata. These checks use synthetic data and do not contact live accounts or agents. Reports are written to temporary directories. `npm run test:mcp-oauth` separately exercises the bundled runtime against a synthetic local provider.

Production drawing exports embed complete fonts because the upstream subsetter requires JavaScript eval, which the native content policy forbids. SVG files can therefore be larger. The build integration and byte-preservation test must be rechecked when upgrading Excalidraw. The app allows same-origin font fetches; sandbox documents keep their separate content policy and isolation.

The shadcn 4.19.0 Tailwind helpers are preserved locally in `src/styles/shadcn.css` with their license. The CLI dependency is unnecessary at runtime. Patched dependency overrides keep the drawing UI compatible with React 19 and use the current diagram converter; diagram conversions are included in the browser checks.

`vendor/png-chunks-encode` preserves the existing MIT-licensed encoder with its unsupported `sliced` helper replaced by `Array.from`. Its PNG image/metadata round-trip and CRCs are regression-tested.

Rebuild/restart the native app after this cleanup: several Tauri commands now accept a typed `input` payload, and both frontend and backend must be updated together. Saved chat/proposal formats remain compatible.

## Repository windows

Within one Lotse process, each repository can be open in one window. Opening the same repository again focuses its existing window; saved paths to the same repository are restored only once. Rebuild and restart the desktop app after changing the window backend.

## Telegram

In **Settings → Telegram**, create a bot with BotFather, send `/start` to it, paste its token, choose your own private chat, connect and enable it. Use a separate bot per repository. The enabled switch persists across app restarts; the test button sends a message to the selected chat. The bot token is stored in the local `~/.lotse/credentials.json` file, protected by filesystem permissions, not in the repository. Anyone with the token can control the bot, so keep it private.

Voice messages use the OpenRouter provider key configured in **Settings → Model providers**. Set an audio-capable OpenRouter model and optionally the spoken language in **Settings → Telegram**; an empty language uses automatic detection. The default model is `google/gemini-2.5-flash`. Voice audio is sent to OpenRouter and the selected model provider, which may incur charges; check that the model supports the incoming audio format. Telegram voice messages in OGG, MP3 and M4A are supported, subject to the model's format support and a 20 MB limit. The transcript and any caption become the Workspace message; ordinary audio files are not supported. An interrupted transcription has an uncertain outcome and is not automatically repeated; check the Workspace and Telegram chats before sending it again. Failed requests may have incurred charges.

Only messages from the selected sender in that same private chat are accepted. Text, supported images, videos and voice messages (up to 20 MB each) enter the current repository's Workspace review chat, using its model, role, approval settings, thread and queue; Task chats are not connected. Videos are provided to the agent as local file attachments, not as native model video input. A message is bound to the Workspace chat current when it is accepted, so changing reviews does not redirect already queued work. When Lotse carries the same conversation forward after a commit, its pending Telegram messages and their journal bindings follow that conversation in order; paused queues remain paused. Agent replies to Telegram-originated messages are also sent to Telegram. Progress, attention notices and final replies share a per-bot/chat send queue with at least one second between requests; explicit rate-limit rejections wait for Telegram’s retry delay before resending. Uncertain transport failures are not retried. Long code replies retain indentation when split across messages. Oversized media is rejected with a Telegram notice and does not block later messages. Other file types are not supported. Questions and approvals must be handled in Lotse, not via Telegram.

Lotse must be open and the repository's Workspace chat available. Messages received while the app is closed or Telegram is disabled may be processed after reopening or enabling, if Telegram still retains them (at most 24 hours). Disconnecting prevents access while disconnected but does not delete undelivered Telegram updates; reconnecting may receive them. A connection or save error is shown in Settings; uncertain agent starts or reply deliveries pause the affected queue and require checking both chats. They are not automatically retried. Disconnecting invalidates the connection; unresolved queued work from a previous connection is not automatically started after reconnecting. A Telegram bot must not be used concurrently by another client polling its updates.

With Vite running, `npm run test:browser -- telegram telegram-commit telegram-voice-commit telegram-oversize` checks the synthetic Workspace round trip, queue carry-over after commits, reply ordering, restart recovery, video and voice messages, and oversized-media rejection. Rust unit tests cover the `getFile` size-error classification and voice request construction. These checks do not contact Telegram, OpenRouter or run a real agent. Rebuild and restart the desktop app after updating the Telegram backend.

Concurrent queue edits from different repository windows are checked before saving. If they conflict, Lotse reports the failed save instead of overwriting another window's queue; restart and inspect pending messages before retrying.

## Voice messages

Record a voice message in the Workspace or Task composer, choose an OpenRouter audio model ID, and select Transcribe. Audio is sent to OpenRouter and its model provider using the configured OpenRouter key; charges may apply. The transcript is added to the current draft for review and is sent only when you submit the composer. Cancel discards the recording or ignores a pending transcription; an already submitted provider request may still incur charges. Recordings require microphone permission and a supported audio format. Rebuild and restart the native app after updating the backend.

## Task statuses

Use **Settings → Tasks → Task statuses** to add or rename statuses, reorder them by dragging or using the arrow buttons, and choose the default for new tasks. Settings belong to the current repository. The same names and order appear in List, Kanban, Gantt and task status menus; changing the default does not move existing tasks.

Deleting a status requires a replacement for its tasks. The completion status can be renamed or reordered, but remains available for completed tasks. Keep at least one other status. Agents discover the configured status IDs with `get_task_start_context` or `get_tasks`.

## Task browser (macOS 11+)

The **Browser** tab in task details and the task dialog opens public websites and localhost servers. Enter an address and press Enter; bare domains use HTTPS, and localhost addresses use HTTP. Back, Forward and Reload use the page's native WebKit history. Website cookies and logins are shared across Lotse tasks and persist between app launches; this does not use your Safari profile.

Each task has its own live page. Switching tabs, closing task detail or selecting another task hides and retains it, so the task agent can continue browsing in the background. Deleting the task, changing its repository or closing its window releases the page. After restarting Lotse, opening a task's browser restores its last safe URL, including pages with saved website logins. URLs containing known credentials are never saved or restored. Page state, unsaved form fields and back/forward history are not restored. Native content hides while an overlapping app dialog/menu is open.

Task agents use `get_task_browser` for page text and interactive element references, then `control_task_browser` to navigate, click, fill fields, select options, send key events, scroll or capture a viewport screenshot. Read another snapshot after navigation or a stale-reference error. References belong to the most recent snapshot of that task's page. Navigation dispatch does not imply that the destination has finished loading. Screenshots return MCP image content. Website content is untrusted, and the website has no Tauri bridge or local application access.

Automation uses DOM events in an isolated WebKit script world. Cross-origin frames, closed shadow roots, CAPTCHAs and actions requiring trusted gestures may need manual interaction. File transfers and multiple pages per task are not included. Agents can act on authenticated websites through the shared login session.

Manage website logins in **Settings → Website credentials**. The base URL, username, email and password are stored together in a separate macOS Keychain item (`<app identifier>.website-credentials`, account `website-vault-v1`), never in `~/.lotse/credentials.json` or frontend storage. One login is supported per exact HTTPS scheme/host/port; subdomains and nondefault ports require separate entries. Base URLs cannot contain a path, query, fragment or embedded credentials. Settings lists only the origin and stored-field flags; saved values are never read back. When editing, untouched fields retain their values, explicitly emptied identity fields are cleared, and Cancel discards the draft.

Agents call `task_browser_credentials` with `action: "discover"` to receive only `{ available: boolean }`, then `action: "autofill"` to fill the current website without receiving any values. The tool accepts no URL, credential ID, selector or field values. It uses the normal task/repository ownership checks in both task and workspace chat; workspace calls require `taskId`. Autofill rechecks the top document's exact HTTPS origin inside WebKit's isolated client world, validates all fields before mutation, and fills only one visible POST login form with an unambiguous password and username/email fields. Frames, shadow roots, cross-origin form actions/submit overrides, GET forms, new-password forms, and ambiguous logins require manual use. Autofill emits input/change events but never submits the form.

All websites remain readable to agents, including after login. Snapshots retain page text, titles, URLs, control labels, references, options and status information. Native code replaces saved username/email/password values and common URL/HTML/JSON/base64 representations with `[redacted]` before returning browser data; lookahead prevents snapshot truncation from exposing credential prefixes. Autofilled controls omit their values, and partial key edits on those controls are refused. Replaced/deleted values remain in native memory until app exit to protect already-filled pages; they are not retained on disk after deletion. Credentials are never added to agent tool arguments or context.

Screenshots remain refused for browser sessions that visited a saved-login origin, because rendered images may contain login values. This restriction stays with the session across navigation/restart; agents should use the fully readable, redacted snapshot instead. Nonsecret origin markers remain in Keychain for screenshot protection. Old whole-page privacy flags no longer suppress website content. The user's live page and address bar remain available.

Only save credentials for websites you trust. Redaction covers known values and common representations, not arbitrary transformations by a malicious website. Autofill necessarily gives values to scripts on that authorized website, which can transmit them like an ordinary login; isolated JavaScript namespaces do not isolate the DOM. This feature isolates secrets from Lotse agent tools and context, not from an authorized website, a compromised operating system, or an agent independently granted unrestricted OS/Keychain access. Deleting a saved credential does not sign out existing website cookies. Provider and MCP secrets retain their existing storage and behavior.

Run `npm run test:browser -- task-browser task-modal task-tabs` with Vite listening on `127.0.0.1:1430` for UI/automation regressions. Include `website-credentials` to check Settings CRUD/draft/error behavior. Run the native suite separately from browser suites. The native fixture pins document visibility to test layout independently of desktop occlusion; the synthetic browser suite separately verifies hidden/visible document transitions. `cargo test --manifest-path src-tauri/Cargo.toml --lib website_credentials::tests::real_keychain_crud -- --ignored --exact` exercises a unique synthetic Keychain entry and deletes it afterward. On macOS, `npm run test:browser:native` builds and runs a separate packaged test app with a temporary repository, a local website fixture and its own application data. It checks native history, redirects, forms, shared cookies, background automation/screenshots, task ownership, cleanup and existing window commands. It also exercises real Keychain CRUD, task/workspace MCP discovery and autofill, unauthorized origins, unsafe forms, reflected values, screenshot refusal, readable post-login content and controls, credential-prefix/truncation protection, deletion/restart behavior, and log/storage scans. Its debug-only `browser-qa` feature loads synthetic HTTPS-origin HTML without changing TLS trust; normal builds exclude the fixture command, and release builds reject the feature. The test's report is written under the temporary directory printed at completion; its separate `com.lotse.browsercheck.*` profile contains only synthetic test data. Rebuild and restart the native app after installing this change.

## Task sandbox (macOS)

The Sandbox tab in task details and the Kanban dialog displays interactive HTML created by the task agent. Ask the agent to create a prototype, design or tool, review it in Sandbox, and give feedback in the task chat. There is no source editor or preview toolbar. Switching tabs preserves the preview, including its inputs and scroll position; its scripts can continue running while hidden. Closing the task dialog or selecting another task releases it. Preview errors offer **Reload preview**. The latest document is saved with the task and restored after restarting Lotse. User-clicked HTTP/HTTPS links open in the system browser only from the visible preview; hash links stay inside the preview.

Task agents use `get_task_sandbox` to read HTML and its SHA-256 revision, then `update_task_sandbox` with `html` and `expectedRevision` (null for an empty sandbox). Each document is limited to 1 MiB UTF-8. An update reports success only after storage has been flushed. `get_current_task` exposes only `hasSandbox`.

Sandbox documents run in an opaque-origin iframe served through short-lived local preview URLs, with a separate content policy and a limited browser-link handoff that requires recent user interaction. Inline CSS/JavaScript, HTTPS libraries, images, fonts and API requests are supported; APIs must allow CORS from the opaque origin. The app supplies no credentials or task data. External services see requests made by the document. Local files, Node.js, eval, persistent browser storage, nested frames, downloads, popups and app-window navigation are unavailable. This is a browser preview, not a native SwiftUI renderer or a CPU/process sandbox. Other platforms are disabled pending separate isolation checks.

## Model providers

AI setup uses model providers with API keys or environment variables. OpenRouter is prefilled during onboarding; any OpenAI-compatible provider can be configured. ChatGPT subscription sign-in is no longer available. Existing ChatGPT defaults switch to a configured OpenRouter provider, otherwise the first configured provider; account-only setups must configure a provider. Repository selections for configured providers are preserved.


## Task performance and storage

In Settings under Agent, **New branch start** chooses a repository-specific starting point for new New Branch tasks: the current workspace, a local branch, or a remote branch. The default is to choose per task. Each task can override its start before it runs; changing the setting does not alter existing tasks. If a saved branch disappears, it remains selected and must be changed before the task can start.

Task data is stored per repository under `repository-tasks/<SHA-256 of root path>.json` in app data. Startup migrates the previous combined task entry only after all repository files have been saved; existing repository files take precedence. Task saves coalesce for 300 ms before serialization, and explicit flushes complete before native close and agent dispatch. MCP context updates coalesce for 150 ms and flush before a code-agent turn starts.

Task-agent text updates are batched once per animation frame and flushed before tool, approval and completion events. Column deletion menus reuse subtree sets built in linear time. File snapshots stream through 64 KB buffers; each untracked file is read once per task refresh, sharing the comparison and pending-change hashes.

The Changes panel runs full comparisons only while visible. Its dirty marker uses the Git toolbar's status refresh. Up to five task terminals can remain open; workspace tasks share one terminal per repository. Hiding a terminal preserves its commands, while **Close terminal session** ends them and frees the session.

Draw prepares its code during idle time after opening a task. Draw and Sandbox initialize after the selected tab can paint, then retain their views for that open task: switching back preserves drawing zoom/pan and preview state. Neither view mounts before its first visit, and Sandbox executes no preview code until opened. Loading reserves the final panel area; a short opacity transition respects reduced-motion settings. Closing or changing the task releases both views. The first visit still initializes the editor or preview.

Task attachment thumbnails are generated on demand with macOS ImageIO (`sips`), cached at a maximum of 320 pixels per dimension, and removed with their originals. Offscreen attachments defer thumbnail requests. Full-size images remain available in the attachment preview. Other desktop targets show file icons until a thumbnail decoder is added.

Run `npm test` and `cargo test --manifest-path src-tauri/Cargo.toml --lib` for data/backend checks. Open `/scripts/task-performance-ui.html`, `/scripts/task-fields-ui.html` and `/scripts/task-thumbnails-ui.html` through Vite for synthetic checks of every detail input, batching, context payloads, hidden Git work, terminal cleanup and viewport-driven thumbnails. Run `npm run test:browser -- task-tabs task-modal` for retained drawing/preview state, loading geometry, retries and task-close cleanup; its local preview fixture uses the native Sandbox content policy. `npm run test:production` checks these views in bundled builds under the native content policies. See [the field-by-field input audit](../TASK-DETAIL-FIELDS.md). Branch names, custom text fields and valid date edits stay local while typing and commit after 300 ms idle or on blur; pending edits flush on task/repository changes and native close. Descriptions keep their own draft until Save, blur, task/repository changes or native close. External description updates wait while editing; saving commits the local draft over concurrent external edits. Titles keep their existing blur/Enter behavior, and comments remain drafts until submitted.

## Task changes

The Changes tab compares the task against the current selected base branch using its merge base with the task's HEAD (a three-dot comparison), including uncommitted task work. Choose a local or remote base branch in the comparison header; Lotse remembers it for this task. The visible tab refreshes every 2.5 seconds, so pulls, rebases, merges and new commits update the file list and invalidate stale diffs. Remote branches reflect the last fetch; the comparison does not fetch automatically. If a local base is strictly behind its configured tracking branch, Changes uses that fetched tracking branch and shows its name in the header, with the reason in the base selector tooltip. It does not move the local branch. Local bases without tracking, ahead of tracking, or diverged from tracking keep their selected local reference. Changes made only on the base branch do not appear as task deletions. Tasks without a distinct base branch initially show their starting commit until a base is selected.

Restart the desktop app after rebuilding the backend or changing window capabilities. Open `/scripts/task-modal-ui.html?changes` through Vite for focused synthetic checks of branch selection, live refresh and file expansion; omit `?changes` for the full task-dialog checks.

## Task coordination

Task chats and the Workspace review chat share the repository's task tools. There is no separate orchestrator, model or provider setup. Ask either chat to manage tasks or coordinate other task agents, for example: “Split this into two tasks, start them, wait for the results and summarize.”

Agents can list/search tasks; read details, saved chat history, results and outstanding human questions/approvals; create and edit metadata, dates, hierarchy, ordering and custom fields; add comments to any task and revise agent comments; and request deletion through the normal human confirmation. Human comments and running task trees are protected. All targets stay within the open repository.

`start_task_run` sends or queues a prompt using the target task's existing model, effort, mode and worktree. It preserves drafts/attachments and requires an explicit worktree start when none is configured. `run_task_playbook` validates supplied variables and renders the canonical saved playbook before queueing it. These tools follow the existing chat permission policy and do not introduce another start-confirmation UI. `stop_task_run` cancels the active turn and pauses its pending queue; `update_task_queue` resumes/pauses it or removes queued prompts. Already-running delegated agents continue if their coordinating chat stops.

`get_task` reads current state; `wait_task_runs` waits up to 60 seconds for any of 1–8 tasks to complete or need attention. Pass the returned message ID to follow an exact queued run, including failure/cancellation results when a newer run has started. Waiting is read-only and makes no extra model calls. The coordinating agent can continue its authorized work after the tool returns. No automatic task-to-task “report back” prompts are generated. Delegated queues retain their task ancestry to reject self-dispatch and reciprocal delegation cycles.

Both chats can inspect start branches/defaults, use playbooks and prompt schedules, and read/update any task's drawing, sandbox or browser and import assets by passing `taskId`. Task-local calls may omit `taskId` for visual tools and comments. Sandbox revisions, drawing validation, file-copy checks, task-agent permissions and human questions/approvals still apply.

Both chats can search/read app-wide saved agent roles with `get_agents`/`get_agent` and playbooks with `get_playbooks`/`get_playbook`. Use `create_agent`/`update_agent` and `create_playbook`/`update_playbook` to save changes within the requested scope. Updates preserve omitted fields; a supplied `variables` array replaces that playbook's variable list, reusing IDs by name when IDs are omitted. Saved-role edits apply when the role is selected again; existing chats retain their current role and history. Agents select a saved role by passing `agentId` from `get_agents` to `create_task`/`add_task` or `update_task`; `null` selects no role, omission preserves the default or current role. Task summaries include the selected role ID/title, and `get_task` includes its saved prompt snapshot. Role changes require an idle task without chat history or queued prompts; existing chats must be switched or cleared by the human. Drafts, attachments, model, effort and worktree are preserved. These tools do not delete templates or start chats. Rebuild and restart the app to load the new tools.

Frontend task operations use unique request IDs and return results after execution and persistence. Mutations are serialized; repository/window changes interrupt pending requests, and uncertain writes are never automatically replayed. Old orchestrator histories remain on disk but are no longer used. Separate tasks and Workspace chats can edit the same working directory concurrently; their file changes may overlap.

Run `npm test`, `cargo test --manifest-path src-tauri/Cargo.toml --lib`, and `npm run build`. Open `/scripts/task-control-ui.html`, `/scripts/task-modal-ui.html` and `/scripts/scheduler-ui.html` through Vite for real-App browser scenarios with synthetic IPC and no live agents. Restart the desktop app after updating its backend.

## Agent pipeline tools

Saved agent roles can set an approval mode in the agent editor: Ask for approval, Approve for me, or YOLO mode. Use default leaves existing behavior unchanged and follows the global approval setting or a composer override. A composer choice overrides the selected role for that chat; selecting a different role uses that role's setting. Existing chats retain their saved role snapshot until the role is selected again. Pipeline messages use the approval mode in their captured role snapshot, even if the composer has an override; roles without a mode retain the existing fallback. The agent tools accept `approvalMode` (`user`, `auto_review`, `yolo`, or `null` to use the default). YOLO grants full access in default mode without approval prompts.

Task and Workspace chats share eight pipeline tools: `get_pipelines(query?)`, `get_pipeline(pipelineId)`, `create_pipeline(title, description?, steps)`, `update_pipeline(pipelineId, title?, description?, steps?)`, `delete_pipeline(pipelineId)`, `start_task_pipeline(taskId, pipelineId)`, `get_task_pipeline_run(taskId, runId)` and `stop_task_pipeline(taskId, runId)`. Templates use the same app-wide `chaoticreview.pipelines` library as Settings → Pipelines. Reads include UI drafts; writes require a startable template. Step fields are `title`, `agentId` (a saved role ID or `null`) and ordered `messages`. Creation generates IDs. Updates preserve omitted fields; a supplied steps array replaces the list, preserving supplied existing IDs and generating omitted IDs. Unknown fields/IDs, duplicate step IDs and invalid values fail before changing the library. Limits: 200 characters per title, 240 per description, 1–50 steps, 1–50 messages per step, 20,000 characters per message.

Start targets an explicit task independently of UI selection. The task must be idle with an empty queue and configured worktree start. Sequential execution, role handoff, saved model settings and permissions match manual start. The caller's coordination path cannot be targeted. Editing or deleting a template leaves existing execution snapshots intact. Saved prompts and roles are context, never authorization, and pipelines do not change task status.

Start returns `runId`, exact `messageIds` and the observed state. `pending` means queued or starting; `running` means an accepted active turn. `needsInput` and `needsApproval` expose the outstanding human request without answering it. `paused`, `completed`, `failed` and `cancelled` distinguish interruption and outcomes. Progress counts only completed messages; each message retains its step index, position, status and result message IDs. Errors pause execution; use `update_task_queue` to retry/resume. Restart leaves unfinished queues paused. `get_task` includes pipeline metadata on queued messages, including the run ID for manual starts.

Stop removes only the specified run's queued messages and requests cancellation of its own active turn, preserving unrelated messages and later runs. Repeating stop is safe. A pending start remains observable until accepted/rejected; cancellation dispatch alone never confirms an active turn has stopped. Cancellation and persistence failures are reported explicitly; inspect the exact run before retrying an uncertain operation. The latest 20 run records per task are stored under `chaoticreview.pipeline-runs:` with repository/task keys, surviving queue removal, chat truncation and restart. Older records expire as new runs arrive; deleting a task removes its run records. There is no separate history UI. Result IDs refer to retained task chat entries and may outlive those entries.

Run `npm test`, `npm run check:rust`, `cargo test --manifest-path src-tauri/Cargo.toml --lib` and `npm run build`. With Vite on `127.0.0.1:1430`, run `npm run test:browser -- pipelines task-control`; these suites use synthetic IPC and no real agents or accounts. Rebuild and restart the desktop app to load the backend tools. These checks do not establish native end-to-end execution with the bundled agent runtime.

## Task assets and concurrent work

Agents can read task assets through `get_current_task`, attach local files to their own task with `import_task_assets` (`paths`: absolute file paths, without file count or size limits), and change the description through `update_task`. Imported files are copied into task storage and appear in the Assets list; originals are preserved.

Separate task chats and the workspace review can run concurrently in the same working directory; their file edits can overlap. Only explicit user or agent edits move a task between statuses. Creating a task or changing its status does not start an agent.

## Scheduled task prompts

Ask an agent to schedule a prompt for a task, once or every N minutes, hours, or days. Use the clock beside GitHub Inbox to inspect schedules, pause/resume them, run one now, delete them, or open the full modal and filter by task. Users manage agent-created schedules; there is no manual creation form.

Schedules run only while their repository is open, including from Workspace or Memory view. Overdue occurrences catch up once when the repository opens or the app wakes. Busy tasks wait behind active work and queued messages. Fixed days mean 24 hours, including across daylight saving changes. Times display in the local timezone.

Marking a task Done pauses its schedules; reopen the task before explicitly resuming them. Failed, cancelled, or interrupted runs also pause for inspection and manual retry. Pausing/deleting a schedule leaves an already running agent active. An app closure after dispatch can leave an uncertain run, which is paused rather than replayed automatically.

Agents use `create_prompt_schedule` (`taskId`, `title`, `prompt`, future `runAt` in Unix milliseconds, optional positive integer `intervalMinutes`), `list_prompt_schedules`, `update_prompt_schedule` (`id`, optional title/prompt/timing/enabled fields), and `delete_prompt_schedule` (`id`). Set `intervalMinutes` to null when updating to switch back to one-time. Repository scope is inferred from the agent connection. Prompts use the task's current chat settings and do not consume drafts or pending attachments.

Schedules persist in `prompt-schedules.json` in app data. Restart the desktop app after installing this backend change. Run `npm test` and `cargo test --manifest-path src-tauri/Cargo.toml --lib` for data/backend checks. Open `/scripts/scheduler-ui.html` through Vite for synthetic lifecycle/UI checks; add `?preview` or `?preview&theme=dark` for sample views. These checks never start a live agent.

## GitHub Inbox

In Settings → GitHub, connect a classic personal access token (`ghp_…`). Use the `notifications` scope, plus `repo` for private repositories. Fine-grained tokens do not support the notifications API. Authorize organization SSO when required. The token is stored as plaintext in `~/.lotse/credentials.json`.

Open a repository with a GitHub.com HTTPS or SSH `origin`, switch to Tasks, and use the inbox icon beside List / Kanban / Gantt. Import creates a linked task; Ignore permanently hides that issue or PR locally. Neither action changes GitHub notifications. Imported items remain hidden if their local task is deleted.

The inbox refreshes manually and every 1, 5 (default), or 15 minutes while the repository is open. Import copies the title, description, and completion state once and keeps a link to GitHub. Automatic sync is disabled in both directions for issues and PRs: local edits and status changes never update GitHub, and GitHub changes never overwrite imported tasks. Disconnecting stops inbox refreshes and preserves local tasks and inbox decisions.

Review agents and task agents can call `get_github_notifications` to read the current repository's cached Lotse inbox. The read-only tool returns pending notifications, cached issue/PR details, sync errors and the last sync time; ignored and imported items stay hidden. It reports when the inbox is unavailable and does not trigger a refresh or change GitHub. Restart the desktop app after updating the backend to expose the tool.

Run `npm test` for the task/inbox data checks and `cargo test --lib` inside `src-tauri` for Rust checks. For browser lifecycle and UI checks, run the Vite dev server and open `/scripts/github-ui.html`. These checks use synthetic Tauri IPC and never contact GitHub or Keychain. Add `?preview` to inspect sample PRs, or `?preview&theme=dark` to inspect the dark palette.

GitHub attachment images use authenticated Markdown rendering to obtain temporary preview URLs; the original description and attachment links are preserved. Image previews are restricted to GitHub image hosts. Open `/scripts/markdown-ui.html` through Vite to check image tables, private-image authorization, and safe source editing for unsupported Markdown. Restart the desktop app after backend or content-security-policy changes.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## Small macOS DMGs

Run `scripts/prepare-app-server.sh` once to fetch the verified Codex 0.163 runtimes and build the Lotse OAuth patch for both Mac architectures. The script installs the required Rust targets.

For one architecture only, pass `aarch64-apple-darwin` or `x86_64-apple-darwin` to `sh scripts/prepare-app-server.sh`.

- `npm run build:mac` builds Apple Silicon and Intel DMGs.
- `npm run build:mac:arm64` or `npm run build:mac:intel` builds just one.

Each build includes only its matching Codex runtime. The script packages the `.app` into a compressed UDZO DMG and verifies it. Shareable files are written to `src-tauri/target/share/`. Plain `tauri build` still uses the shared configuration and includes both runtimes.

Code signing with a Developer ID and Apple notarization are separate release steps; these local builds are not notarized automatically.

### Publish a local GitHub release

On macOS, install the project dependencies (`npm ci`) and authenticate the GitHub CLI (`gh auth login`) with permission to create releases and push tags. Set the same new stable version in `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`, update the lockfiles as needed, commit it, and push it to `origin/main`. Then run `npm run release` from that exact clean commit. After the release checks pass, the command replaces both local Codex runtimes using the checked-in manifest and Lotse patch before building the DMGs.

The command runs the same app, website, and packaging tests as the GitHub macOS workflow, then builds and verifies both DMGs locally. It checks that the checkout is still clean and at the verified commit before tagging that commit explicitly. It pushes the annotated tag, creates a draft GitHub release, uploads both downloads and their SHA-256 checksums, then publishes it as latest. The annotated tag tells the GitHub workflow to skip its own build and release, preventing it from replacing the local artifacts. If publishing fails after the tag is pushed, inspect the tag and draft release on GitHub before completing the release manually; the command does not overwrite existing tags or releases. Local builds are not automatically notarized.

### Automatic GitHub builds and releases

[Build Lotse for macOS](https://github.com/appbackstube/lotse/actions/workflows/macos.yml) builds Apple Silicon and Intel DMGs on separate native macOS runners. App changes on `main` start builds automatically; **Run workflow** can start one manually. Each successful architecture is available as an Actions artifact for 14 days.

To publish both builds as permanent downloads, set the app version in `src-tauri/tauri.conf.json`, keep `src-tauri/Cargo.toml` and `package.json` in sync, then push the matching version tag, for example:

```sh
git tag v0.1.0
git push origin v0.1.0
```

The workflow checks the tag against the app version, rebuilds the patched runtime when needed, verifies each app's architecture and signature and each DMG's integrity, and publishes the release only after both builds succeed. Releases contain `Lotse_Apple_Silicon.dmg`, `Lotse_Intel.dmg`, and `SHA256SUMS.txt`. The stable download URLs are `https://github.com/appbackstube/lotse/releases/latest/download/Lotse_Apple_Silicon.dmg` and `https://github.com/appbackstube/lotse/releases/latest/download/Lotse_Intel.dmg`.

The GitHub builds use an ad-hoc signature and are not notarized. macOS may require user approval in **System Settings → Privacy & Security**. No Apple credentials are required for these builds. Developer ID signing and notarization must be configured before claiming an Apple-verified installation experience.

## OAuth MCP servers

Add an HTTP server in the MCP servers settings. Figma uses `https://mcp.figma.com/mcp`; leave client credentials and the callback empty for automatic registration, unless Figma supplies registered credentials for your client.

For Slack:

1. Create an internal Slack app for your workspace, enable MCP under **Agents**, and configure the required **User Token Scopes** under **OAuth & Permissions**. Workspace admin approval may be required.
2. Add `https://mcp.slack.com/mcp` in Lotse. Enter the app's client ID, client secret, user token scopes, and a loopback callback such as `http://localhost:43123/callback`.
3. Save the server. Lotse generates the complete callback path with a stable server identifier. Select **Copy callback URL**, add that exact URL under your Slack app's **Redirect URLs**, and save it there. Keep the host, port, and full path unchanged.
4. Select **Connect with OAuth** and authorize in your browser. Use **Cancel sign-in** before retrying an abandoned attempt.

For an HTTP MCP server that uses a bearer token, enter it directly in **Bearer token** and save. Leave the field untouched to keep a saved token; use **Remove stored bearer token** and save to delete it. Existing environment-variable references still work; entering a token replaces the reference and removes the need for a shell environment variable. Credential changes require active agent chats to finish first.

Provider API keys, GitHub tokens, MCP bearer tokens, and MCP client secrets are stored as plaintext in `~/.lotse/credentials.json` (owner-only directory `0700`, file `0600`). MCP OAuth tokens use native file storage inside Lotse’s existing agent data directory (`~/Library/Application Support/com.andreasehrlichgruber.lotse/codex` on macOS). Saved bearer tokens and client secrets are excluded from agent command environments; the runtime config contains only secret environment-variable references. Missing saved secrets disable only the affected MCP at runtime and are shown beside that server.

Provider, GitHub and MCP credentials no longer use Keychain; the separate website-login vault described above does. Re-enter provider keys and reconnect GitHub and MCP OAuth accounts once after upgrading; their legacy Keychain entries and external Codex credentials are left untouched. Credential files are unencrypted and readable by processes running as your user. Run `npm run test:mcp-oauth` on macOS to check the bundled runtime against a local test provider with synthetic credentials. The test exchanges only synthetic tokens with a local provider, verifies file persistence and logout across restarts, and never accesses Keychain or live accounts.

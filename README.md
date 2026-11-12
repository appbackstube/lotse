# Lotse

A macOS desktop workspace for coordinating AI coding agents, keeping task context together, and reviewing changes. Built with Tauri, React, and TypeScript.

## Marketing website

The English Lotse marketing website lives in [`docs/`](docs/README.md). It is a standalone static page with real app screenshots and an interactive task gallery. See its README for local preview and GitHub Pages setup; `.github/workflows/pages.yml` publishes it without building the desktop app.

## Warning checks

Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run check:rust`, and `cargo test --manifest-path src-tauri/Cargo.toml --lib`. The web build also runs lint/type checks and rejects JavaScript chunks over 500 kB. React 19.2 or newer is required for effect events; TypeScript tests use `tsx` without suppressing Node warnings.

With `agent-browser` installed and `npm run dev` listening on port 1430, run `npm run test:browser`. Each synthetic suite uses an isolated browser and fails on console warnings or page errors. `npm run test:production` builds separate production App/export fixtures, starts its own preview on port 1432, and checks the native content policy, lazy drawing, diagrams, offline SVG font embedding and PNG scene metadata. These checks use synthetic data and do not contact live accounts or agents. Reports are written to temporary directories. `npm run test:mcp-oauth` separately exercises the bundled runtime against a synthetic local provider.

Production drawing exports embed complete fonts because the upstream subsetter requires JavaScript eval, which the native content policy forbids. SVG files can therefore be larger. The build integration and byte-preservation test must be rechecked when upgrading Excalidraw. The app allows same-origin font fetches; sandbox documents keep their separate content policy and isolation.

The shadcn 4.19.0 Tailwind helpers are preserved locally in `src/styles/shadcn.css` with their license. The CLI dependency is unnecessary at runtime. Patched dependency overrides keep the drawing UI compatible with React 19 and use the current diagram converter; diagram conversions are included in the browser checks.

`vendor/png-chunks-encode` preserves the existing MIT-licensed encoder with its unsupported `sliced` helper replaced by `Array.from`. Its PNG image/metadata round-trip and CRCs are regression-tested.

Rebuild/restart the native app after this cleanup: several Tauri commands now accept a typed `input` payload, and both frontend and backend must be updated together. Saved chat/proposal formats remain compatible.

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

Task data is stored per repository under `repository-tasks/<SHA-256 of root path>.json` in app data. Startup migrates the previous combined task entry only after all repository files have been saved; existing repository files take precedence. Task saves coalesce for 300 ms before serialization, and explicit flushes complete before native close and agent dispatch. MCP context updates coalesce for 150 ms and flush before a code-agent turn starts.

Task-agent text updates are batched once per animation frame and flushed before tool, approval and completion events. Column deletion menus reuse subtree sets built in linear time. File snapshots stream through 64 KB buffers; each untracked file is read once per task refresh, sharing the comparison and pending-change hashes.

The Changes panel runs full comparisons only while visible. Its dirty marker uses the Git toolbar's status refresh. Up to five task terminals can remain open; workspace tasks share one terminal per repository. Hiding a terminal preserves its commands, while **Close terminal session** ends them and frees the session.

Draw prepares its code during idle time after opening a task. Draw and Sandbox initialize after the selected tab can paint, then retain their views for that open task: switching back preserves drawing zoom/pan and preview state. Neither view mounts before its first visit, and Sandbox executes no preview code until opened. Loading reserves the final panel area; a short opacity transition respects reduced-motion settings. Closing or changing the task releases both views. The first visit still initializes the editor or preview.

Task attachment thumbnails are generated on demand with macOS ImageIO (`sips`), cached at a maximum of 320 pixels per dimension, and removed with their originals. Offscreen attachments defer thumbnail requests. Full-size images remain available in the attachment preview. Other desktop targets show file icons until a thumbnail decoder is added.

Run `npm test` and `cargo test --manifest-path src-tauri/Cargo.toml --lib` for data/backend checks. Open `/scripts/task-performance-ui.html`, `/scripts/task-fields-ui.html` and `/scripts/task-thumbnails-ui.html` through Vite for synthetic checks of every detail input, batching, context payloads, hidden Git work, terminal cleanup and viewport-driven thumbnails. Run `npm run test:browser -- task-tabs task-modal` for retained drawing/preview state, loading geometry, retries and task-close cleanup; its local preview fixture uses the native Sandbox content policy. `npm run test:production` checks these views in bundled builds under the native content policies. See [the field-by-field input audit](TASK-DETAIL-FIELDS.md). Branch names, custom text fields and valid date edits stay local while typing and commit after 300 ms idle or on blur; pending edits flush on task/repository changes and native close. Descriptions keep their own draft until Save, blur, task/repository changes or native close. External description updates wait while editing; saving commits the local draft over concurrent external edits. Titles keep their existing blur/Enter behavior, and comments remain drafts until submitted.

## Task changes

The Changes tab compares the task against the current selected base branch using its merge base with the task's HEAD (a three-dot comparison), including uncommitted task work. Choose a local or remote base branch in the comparison header; Lotse remembers it for this task. The visible tab refreshes every 2.5 seconds, so pulls, rebases, merges and new commits update the file list and invalidate stale diffs. Remote branches reflect the last fetch; the comparison does not fetch automatically. Changes made only on the base branch do not appear as task deletions. Tasks without a distinct base branch initially show their starting commit until a base is selected.

Restart the desktop app after rebuilding the backend or changing window capabilities. Open `/scripts/task-modal-ui.html?changes` through Vite for focused synthetic checks of branch selection, live refresh and file expansion; omit `?changes` for the full task-dialog checks.

## Task coordination

Task chats and the Workspace review chat share the repository's task tools. There is no separate orchestrator, model or provider setup. Ask either chat to manage tasks or coordinate other task agents, for example: “Split this into two tasks, start them, wait for the results and summarize.”

Agents can list/search tasks; read details, saved chat history, results and outstanding human questions/approvals; create and edit metadata, dates, hierarchy, ordering and custom fields; add comments to any task and revise agent comments; and request deletion through the normal human confirmation. Human comments and running task trees are protected. All targets stay within the open repository.

`start_task_run` sends or queues a prompt using the target task's existing model, effort, mode and worktree. It preserves drafts/attachments and requires an explicit worktree start when none is configured. `run_task_playbook` validates supplied variables and renders the canonical saved playbook before queueing it. These tools follow the existing chat permission policy and do not introduce another start-confirmation UI. `stop_task_run` cancels the active turn and pauses its pending queue; `update_task_queue` resumes/pauses it or removes queued prompts. Already-running delegated agents continue if their coordinating chat stops.

`get_task` reads current state; `wait_task_runs` waits up to 60 seconds for any of 1–8 tasks to complete or need attention. Pass the returned message ID to follow an exact queued run, including failure/cancellation results when a newer run has started. Waiting is read-only and makes no extra model calls. The coordinating agent can continue its authorized work after the tool returns. No automatic task-to-task “report back” prompts are generated. Delegated queues retain their task ancestry to reject self-dispatch and reciprocal delegation cycles.

Both chats can inspect/configure/pause lanes, release held or failed attempts, inspect start branches/defaults, use playbooks and prompt schedules, and read/update any task's drawing, sandbox or browser and import assets by passing `taskId`. Task-local calls may omit `taskId` for visual tools and comments. Sandbox revisions, drawing validation, file-copy checks, task-agent permissions and human questions/approvals still apply. Metadata changes hold a task from implicit lane dispatch until explicitly started/released.

Both chats can search/read app-wide saved agent roles with `get_agents`/`get_agent` and playbooks with `get_playbooks`/`get_playbook`. Use `create_agent`/`update_agent` and `create_playbook`/`update_playbook` to save changes within the requested scope. Updates preserve omitted fields; a supplied `variables` array replaces that playbook's variable list, reusing IDs by name when IDs are omitted. Saved-role edits apply when the role is selected again; existing chats retain their current role and history. Agents select a saved role by passing `agentId` from `get_agents` to `create_task`/`add_task` or `update_task`; `null` selects no role, omission preserves the default or current role. Task summaries include the selected role ID/title, and `get_task` includes its saved prompt snapshot. Role changes require an idle task without chat history or queued prompts; existing chats must be switched or cleared by the human. Drafts, attachments, model, effort and worktree are preserved. These tools do not delete templates or start chats. Rebuild and restart the app to load the new tools.

Frontend task operations use unique request IDs and return results after execution and persistence. Mutations are serialized; repository/window changes interrupt pending requests, and uncertain writes are never automatically replayed. Old orchestrator histories remain on disk but are no longer used. Separate tasks and Workspace chats can edit the same working directory concurrently; their file changes may overlap.

Run `npm test`, `cargo test --manifest-path src-tauri/Cargo.toml --lib`, and `npm run build`. Open `/scripts/task-control-ui.html`, `/scripts/task-modal-ui.html` and `/scripts/lane-automation-ui.html` through Vite for real-App browser scenarios with synthetic IPC and no live agents. Restart the desktop app after updating its backend.

## Lane automation

In List, Kanban, or Gantt, open a status menu and choose **Automation…**. Set a prompt, local or remote base branch, and a positive worker limit, then enable it. Each repository and lane keeps its own configuration and processing history. New tasks join automatically in display order; each task runs successfully once per lane, including Done. Changing the prompt or moving a processed task back does not rerun it.

Automation uses the task's existing chat, model, effort, approvals, and working location in action mode. A new worktree without a selected start point starts from the lane's base branch. Existing worktrees, workspace tasks, and configured start points are reused. Agents can read task assets through `get_current_task`, attach local files to their own task with `import_task_assets` (`paths`: absolute file paths, without file count or size limits), and change the description through `update_task`. Imported files are copied into task storage and appear in the Assets list; originals are preserved. Automation preserves drafts and attachments; only explicit agent edits move a task between statuses.

Each lane limits its own running agents, including those waiting for approval or answers. Tasks with active turns or queued user messages wait. Separate task chats and the workspace review can run concurrently in the same working directory; their file edits can overlap. Pausing stops new dispatches and lets running agents finish. Failed, cancelled, and interrupted attempts require **Retry** after inspecting any partial changes. Other tasks continue. Closing the repository stops processing; unfinished attempts become Interrupted on reopening and are never replayed automatically.

Open `/scripts/lane-automation-ui.html` through Vite to run synthetic integration checks against the real App without live agents.

The old task-description Generate button and its settings have been replaced by lane prompts. Commit-message generation is unchanged. Restart the desktop app after updating the backend.

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

This template should help get you started developing with Tauri, React and Typescript in Vite.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## Small macOS DMGs

Run `scripts/prepare-app-server.sh` once to fetch the verified Codex 0.163 runtimes and build the Lotse OAuth patch for both Mac architectures. The script installs the required Rust targets.

For one architecture only, pass `aarch64-apple-darwin` or `x86_64-apple-darwin` to `sh scripts/prepare-app-server.sh`.

- `npm run build:mac` builds Apple Silicon and Intel DMGs.
- `npm run build:mac:arm64` or `npm run build:mac:intel` builds just one.

Each build includes only its matching Codex runtime. The script packages the `.app` into a compressed UDZO DMG and verifies it. Shareable files are written to `src-tauri/target/share/`. Plain `tauri build` still uses the shared configuration and includes both runtimes.

Code signing with a Developer ID and Apple notarization are separate release steps; these local builds are not notarized automatically.

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

Provider API keys, GitHub tokens, and MCP client secrets are stored as plaintext in `~/.lotse/credentials.json` (owner-only directory `0700`, file `0600`). MCP OAuth tokens use native file storage inside Lotse’s existing agent data directory (`~/Library/Application Support/com.andreasehrlichgruber.lotse/codex` on macOS). Client secrets are excluded from agent command environments; the runtime config contains only a secret environment-variable reference. Missing saved secrets disable only the affected MCP at runtime and are shown beside that server.

Provider, GitHub and MCP credentials no longer use Keychain; the separate website-login vault described above does. Re-enter provider keys and reconnect GitHub and MCP OAuth accounts once after upgrading; their legacy Keychain entries and external Codex credentials are left untouched. Credential files are unencrypted and readable by processes running as your user. Run `npm run test:mcp-oauth` on macOS to check the bundled runtime against a local test provider with synthetic credentials. The test exchanges only synthetic tokens with a local provider, verifies file persistence and logout across restarts, and never accesses Keychain or live accounts.

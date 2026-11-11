# Warning cleanup — discussion checklist

Inventory captured on 4 November 2026. No application source changes made during this inventory.

## Verified baseline

| Check | Result |
| --- | --- |
| `npm run build` | Passes TypeScript and Vite; one oversized-chunk warning covering five JavaScript assets. |
| `npm test` | Passes; no warnings emitted with the existing command's ExperimentalWarning suppression. |
| `cargo check --manifest-path src-tauri/Cargo.toml --all-targets --offline` | Passes; 39 distinct unused-code locations. |
| `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --offline` | Passes; the unused-code findings plus 31 Clippy findings. |
| `npm run tauri -- info` | Environment section passes; interrupted after the remaining output stalled. Package/plugin comparison remains unverified. |

Rust prints 67 warnings for the library and 56 for library tests, including 52 reported duplicates. Deduplicating by source location and warning message gives **70 actionable source findings: 39 unused-code locations and 31 Clippy findings**. `CommitMessageOutput` is printed separately for both targets. Locations below refer to this baseline and will move as cleanup proceeds.

Native runtime, browser console, release packaging, dependency advisories, and other platform builds have not been audited. The pending checks below are discovery tasks, not claims that additional warnings already exist.

## Implementation checkpoint — 5 November 2026

The 70 baseline Rust/Clippy findings are resolved. The obsolete, unregistered AI/proposal pipeline and all existing dead-code/argument-count allowances were removed. Persisted chat/proposal types remain, with explicit compatibility tests. Current Rust checks pass with `-D warnings`; all 142 library tests pass.

The application build now splits vendor packages without forcing unused modules into empty chunks, uses the current diagram converter, and keeps every JavaScript chunk below the unchanged 500 kB limit. The largest application chunk is approximately 492 kB. The build checks the budget. Production SVG exports embed complete fonts to preserve offline rendering without enabling JavaScript eval; exported SVGs can be larger. The old font subsetter and its embedded binary code are absent from the packaged build.

React Hook lint checks identified and resolved 23 dependency findings. TypeScript also checks the Vite config. Stable TypeScript test loading replaces the ExperimentalWarning suppression. Tauri Rust/JavaScript packages were updated within their supported version ranges; current dependency advisories and peer compatibility were addressed. The shadcn stylesheet is retained locally with its license while the unused CLI/server dependency chain is removed.

Browser fixtures now validate typed IPC payloads, remove Tauri event callbacks correctly, dispose React roots, recognize Sandbox and current notification commands, and keep the Kanban gap test outside the auto-scroll zone. Isolated development browser checks and production checks under the native CSP are available as repeatable commands; see README.

Both Apple Silicon and Intel app/DMG packages built, passed architecture/signature checks and disk-image verification. Packaging uses the new `diskutil image create` API where available, eliminating the macOS deprecation warning. Local packages remain ad-hoc signed, without Developer ID notarization, as documented by the existing release workflow.

Native verification remains partial: isolated QA app data confirmed native Git/file, MCP context, terminal lifecycle, notification-permission query and task-storage operations, but the native run did not return completed WebView reports before its timeout. T02 and T03 therefore remain open for an interactive desktop smoke check. The production browser tests do verify the exact native CSP, lazy drawing, diagram conversion and offline font export. The bundled runtime's three synthetic OAuth scenarios passed; no live agents/accounts were used.

### Additional findings resolved during implementation

- [x] N01 — Tauri mock event unregistration used `eventId` while the mock registry expected `id`; corrected at the shared fixture boundary and regression-tested.
- [x] N02 — Fixture roots kept polling after completion/failure; unmount them inside `act` and cancel an active drag before teardown.
- [x] N03 — Update Sandbox capability and notification command mocks, plus stale modal selectors/tab assertions.
- [x] N04 — Resolve the 23 React Hook dependency findings without broad lint suppression.
- [x] N05 — Remove vulnerable, unused CLI dependencies and patch the supported dependency graph; retain required stylesheet/license files.
- [x] N06 — Replace production font subsetting that requires eval with full-font embedding; verify exact font bytes and real SVG export under CSP.
- [x] N07 — Replace deprecated macOS image creation while retaining the older-system fallback and image verification.
- [x] N08 — Stabilize the Kanban gap fixture by centering its lane away from intentional auto-scroll and waiting for layout; keep application drag behavior unchanged.
- [x] N09 — Remove the deprecated `sliced` dependency from PNG export with a licensed local encoder patch using `Array.from`; check image bytes, scene metadata and CRCs.
- [x] N10 — Await the modal fixture’s lazy drawing import inside `act` instead of assuming a fixed delay; eliminate premature canvas assertions and suspended-resource test warnings.

### Final verification

**103 of 105 checklist items are complete.** T02 and T03 remain open; native WebView completion is unverified.

| Check | Result |
| --- | --- |
| Clean `npm ci`, full `npm ls`, live `npm audit` | Pass; no deprecation/peer warnings, invalid dependencies or advisories. |
| Frontend unit tests, lint, both TypeScript configurations | Pass. |
| Production application build | Pass; no bundle warnings, largest JavaScript chunk 492.14 kB. |
| Strict Rust Clippy, all targets | Pass with `-D warnings`; no dead-code or argument-count allowances. |
| Rust library tests | 142 passed. |
| Development browser suites | All 17 pass without console warnings/errors, including field-by-field task details and retained Draw/Sandbox transitions. |
| Production browser checks | App, Markdown, early drawing preparation, retained drawing/preview state, diagrams, SVG font export and PNG scene metadata pass under the exact native App/Sandbox content policies; no console warnings/errors. |
| Bundled runtime OAuth checks | Three synthetic scenarios passed. |
| Apple Silicon and Intel app/DMG builds | Pass without build/packaging warnings; architecture, deep strict signature and disk-image checks pass. Packages remain ad-hoc signed. |

## Proposed order and scope

1. Capture browser and native runtime warnings so behavior-related problems can take priority.
2. Resolve the unused backend code after tracing callers, command registrations, serialized data, and tests. Some declarations are still exercised by tests; do not delete them solely because a production build reports them unused.
3. Fix the small Rust expressions, then the surviving function signatures. Removing unused code may also resolve several Clippy findings.
4. Address the five web bundles while preserving offline drawing, Markdown editing, and asset loading.
5. Verify native development/release builds and add repeatable checks that prevent warnings returning.

The goal is to fix causes. Do not raise Vite's warning limit, add blanket Rust allowances, weaken TypeScript checks, or filter browser warnings to make the output look clean. Keep existing behavior, IPC contracts, persisted data, validation, and error handling intact.

## Rust: unused code — 39 locations

For each item, trace production callers and test references, then remove obsolete code or give genuinely test-only code the appropriate test scope. Update affected tests and fixtures together. Preserve serialized formats still used by current features. These are per-location tracking items; related legacy code should be resolved together.

- [x] R01 — `CommentSide::label` — `src-tauri/src/lib.rs:540`.
- [x] R02 — `AiOutput` — `src-tauri/src/lib.rs:611`.
- [x] R03 — `CommitMessageOutput` — `src-tauri/src/lib.rs:618`.
- [x] R04 — `current_review_snapshot_for_window` — `src-tauri/src/lib.rs:1731`.
- [x] R05 — `chat_comparison` — `src-tauri/src/lib.rs:1763`.
- [x] R06 — `mcp_url_for_window` — `src-tauri/src/lib.rs:3489`.
- [x] R07 — `mcp_url_for_task` — `src-tauri/src/lib.rs:3496`.
- [x] R08 — `toml_string` — `src-tauri/src/lib.rs:3539`; distinguish it from the active helper in `agent_runtime.rs`.
- [x] R09 — `AutoFixOutput` — `src-tauri/src/lib.rs:4868`.
- [x] R10 — `AutoFixFinished` — `src-tauri/src/lib.rs:4876`.
- [x] R11 — `SuggestionProposalCompletion` — `src-tauri/src/lib.rs:4903`.
- [x] R12 — `SuggestionProposalFiles` — `src-tauri/src/lib.rs:4908`.
- [x] R13 — `SuggestionProposalOutput` — `src-tauri/src/lib.rs:4915`.
- [x] R14 — `codex_binary` — `src-tauri/src/lib.rs:4920`.
- [x] R15 — `suggestion_proposal_schema` — `src-tauri/src/lib.rs:4940`.
- [x] R16 — `parse_suggestion_proposal` — `src-tauri/src/lib.rs:4952`.
- [x] R17 — `spawn_codex` — `src-tauri/src/lib.rs:4984`.
- [x] R18 — `run_blocking_codex_command` — `src-tauri/src/lib.rs:5598`.
- [x] R19 — `chat_suggestion_prompt` — `src-tauri/src/lib.rs:6053`.
- [x] R20 — `start_chat_suggestion` — `src-tauri/src/lib.rs:6060`.
- [x] R21 — `start_chat_suggestion_blocking` — `src-tauri/src/lib.rs:6084`.
- [x] R22 — `cancel_auto_fix` — `src-tauri/src/lib.rs:6128`.
- [x] R23 — `AI_INSTRUCTIONS` — `src-tauri/src/lib.rs:6154`.
- [x] R24 — `chat_context_hint` — `src-tauri/src/lib.rs:6602`.
- [x] R25 — `review_schema` — `src-tauri/src/lib.rs:6629`.
- [x] R26 — `commit_message_schema` — `src-tauri/src/lib.rs:6640`.
- [x] R27 — `short_progress` — `src-tauri/src/lib.rs:7638`.
- [x] R28 — `codex_agent_progress` — `src-tauri/src/lib.rs:7655`.
- [x] R29 — `codex_event_status` — `src-tauri/src/lib.rs:7668`.
- [x] R30 — `codex_thread_id` — `src-tauri/src/lib.rs:7705`.
- [x] R31 — `codex_debug_dir` — `src-tauri/src/lib.rs:7713`.
- [x] R32 — `run_codex_chat` — `src-tauri/src/lib.rs:7727`.
- [x] R33 — `perform_ai_chat` — `src-tauri/src/lib.rs:7877`.
- [x] R34 — `send_ai_chat` — `src-tauri/src/lib.rs:7959`; distinguish it from the registered `ai_chat_send` command.
- [x] R35 — `cancel_ai_chat` — `src-tauri/src/lib.rs:8016`.
- [x] R36 — `patch_file_summaries` — `src-tauri/src/lib.rs:8235`.
- [x] R37 — `validate_patch` — `src-tauri/src/lib.rs:8262`; preserve any validation still needed by surviving patch operations.
- [x] R38 — `chat_message` — `src-tauri/src/lib.rs:8304`.
- [x] R39 — `apply_ai_patch` — `src-tauri/src/lib.rs:8377`.

## Rust: small Clippy fixes — 19 findings

- [x] C01 — Simplify the boolean expression without changing its truth table — `agent_runtime.rs:448` (`nonminimal_bool`).
- [x] C02 — Use key-based sorting while preserving the existing order — `memory.rs:102` (`unnecessary_sort_by`).
- [x] C03 — Remove the redundant borrow — `lib.rs:1203:35` (`needless_borrow`).
- [x] C04 — Compare without creating an owned value — `lib.rs:1204:75` (`cmp_owned`).
- [x] C05 — Remove the unnecessary generic-argument borrow — `lib.rs:1204:29` (`needless_borrows_for_generic_args`).
- [x] C06 — Remove the redundant borrow — `lib.rs:1204:98` (`needless_borrow`).
- [x] C07 — Remove the redundant borrow — `lib.rs:1207:17` (`needless_borrow`).
- [x] C08 — Remove the redundant borrow — `lib.rs:1530:26` (`needless_borrow`).
- [x] C09 — Remove the redundant borrow — `lib.rs:1627:60` (`needless_borrow`).
- [x] C10 — Remove the redundant borrow — `lib.rs:1631:56` (`needless_borrow`).
- [x] C11 — Remove the redundant borrow — `lib.rs:2558:56` (`needless_borrow`).
- [x] C12 — Use `assert!` for the boolean assertion — `agent_runtime.rs:2597` (`bool_assert_comparison`).
- [x] C13 — Use `std::slice::from_ref` instead of cloning into a one-element slice — `agent_runtime.rs:3086:38` (`cloned_ref_to_slice_refs`).
- [x] C14 — Use `std::slice::from_ref` instead of cloning into a one-element slice — `agent_runtime.rs:3187:82` (`cloned_ref_to_slice_refs`).
- [x] C15 — Replace the indirect conditional with `if/else`, or resolve by removing R06 — `lib.rs:3491` (`obfuscated_if_else`).
- [x] C16 — Replace the indirect conditional with `if/else`, or resolve by removing R07 — `lib.rs:3498` (`obfuscated_if_else`).
- [x] C17 — Use slice membership rather than an iterator search — `lib.rs:6573` (`manual_contains`).
- [x] C18 — Remove the unnecessary generic-argument borrow — `lib.rs:8952:24` (`needless_borrows_for_generic_args`).
- [x] C19 — Remove the redundant borrow — `lib.rs:9481:32` (`needless_borrow`).

All abbreviated Rust paths in the Clippy lists are relative to `src-tauri/src/`.

## Rust/Tauri: function signatures — 12 findings

Each item emits `too_many_arguments`. Reuse suitable existing request/context types before introducing new ones. Trace every Rust caller; if a command payload changes, update its frontend invocations, IPC mocks, and tests in the same change. Retain Tauri-injected state and authorization checks.

- [x] A01 — `AgentRuntime::start_chat`, 15 arguments — `agent_runtime.rs:1148`.
- [x] A02 — `AgentRuntime::start_thread`, 10 arguments — `agent_runtime.rs:1596`.
- [x] A03 — `thread_config`, 10 arguments — `agent_runtime.rs:2730`.
- [x] A04 — `github_update_item`, 8 arguments — `github.rs:656`.
- [x] A05 — `orchestrator_tool_ack`, 8 arguments — `orchestrator.rs:474`.
- [x] A06 — `load_task_file_diff`, 9 arguments — `lib.rs:2688`.
- [x] A07 — `merge_task_branch`, 8 arguments — `lib.rs:2740`.
- [x] A08 — `merge_task_worktree`, 9 arguments — `lib.rs:2778`.
- [x] A09 — `selected_context`, 9 arguments — `lib.rs:3332`.
- [x] A10 — `set_mcp_context`, 12 arguments — `lib.rs:3415`.
- [x] A11 — `spawn_codex`, 12 arguments — `lib.rs:4984`; resolve together with R17 if deleted.
- [x] A12 — `ai_chat_steer`, 10 arguments — `lib.rs:8141`.

## Web: oversized production bundles — five assets

Vite reports these assets above its 500 kB minified-size threshold. Investigate their import graphs before deciding the smallest useful split. `TaskDrawing` already uses a lazy import; MarkdownEditor imports MDXEditor directly. Merely adding another lazy wrapper may leave oversized vendor chunks unchanged.

- [x] W01 — Reduce/split `index-B79GjFFN.js`: 2,582.74 kB, gzip 797.44 kB.
- [x] W02 — Reduce/split `subset-shared.chunk-JREdXmuR.js`: 1,820.54 kB, gzip 735.73 kB.
- [x] W03 — Reduce/split `percentages-BXMCSKIN-BpHM52m6.js`: 1,089.44 kB, gzip 353.67 kB.
- [x] W04 — Reduce/split `index-Csyn8amS.js`: 716.97 kB, gzip 180.10 kB.
- [x] W05 — Reduce/split `cynefin-OW5HDTMX-qeFAyQTc.js`: 687.91 kB, gzip 154.14 kB.
- [x] W06 — Verify offline drawing/fonts, drawing export, Markdown editing, syntax highlighting, and diagrams after bundle changes; verify first-use loading and error handling.

Asset hashes identify this build only. All five assets contribute to one emitted Vite warning, not five separately emitted warnings.

## Pending discovery: web runtime and tooling

- [x] D01 — Capture development browser console warnings/errors with the existing synthetic UI suites: task modal, task Git, task performance, thumbnails, new task, Kanban drag, branch names, scheduler, lane automation, orchestrator, GitHub, Markdown, Gantt, and Pomodoro. Record each distinct source finding as a new checklist item. Separate deliberate failure-fixture output from unexpected warnings.
- [x] D02 — Check production-mode frontend loading and interactions for console warnings, failed assets, and dynamic-import failures. Synthetic dev suites alone do not establish production behavior.
- [x] D03 — Check React/accessibility warnings during dialogs, menus, forms, drag/drop, task switching, drawing, and editor interactions; track each reproduced warning separately.
- [x] D04 — Agree on minimal frontend lint coverage. Implemented `rules-of-hooks` and `exhaustive-deps` as errors; TypeScript handles existing type/unused checks. Accessibility console warnings are covered by the browser suites; this cleanup does not add a broad new JSX rule set.
- [x] D05 — Review existing warning workarounds: repeated `--disable-warning=ExperimentalWarning` in `package.json` and the Node-global `@ts-expect-error` in `vite.config.ts`. Determine whether the supported toolchain can remove them without losing compatibility; distinguish tooling notices from application defects.
- [x] D06 — Check npm dependency advisories and deprecated package notices separately. A live audit was run during implementation; compatible updates, targeted tested overrides and removal of the unused CLI dependency chain resolved the reported advisories.

## Pending discovery: Tauri/native builds and runtime

- [x] T01 — Complete Tauri environment/package/plugin diagnostics; the initial `tauri info` run only produced its environment section. Record actual mismatches or warnings, if any.
- [ ] T02 — Capture native development startup, Rust stderr, and WebView console output. Exercise window creation/closure, task switching, Git operations, terminals, notifications, Markdown, drawing, sandbox previews, and app shutdown. Track each reproduced warning separately.
- [ ] T03 — Check WebView CSP, asset-protocol, permission, and IPC warnings. Preserve the existing sandbox isolation and narrow file access when fixing actual failures.
- [x] T04 — Capture Apple Silicon release-build and packaging warnings using the existing macOS build script. Separate compiler, linker, bundler, and signing diagnostics into individual items.
- [x] T05 — Repeat release-build and packaging diagnostics for Intel, which the existing build script also supports. A host-only cargo check does not cover that target.
- [x] T06 — Establish distribution scope for signing/notarization. README states current local builds are not notarized automatically; treat release trust warnings as a separate release decision, not a speculative compiler problem.
- [x] T07 — Inspect bundled Codex runtime startup diagnostics with synthetic/local providers where possible; distinguish app integration warnings from upstream runtime messages. Do not contact live agents/accounts merely to collect warnings.

## Existing Rust suppressions and regression prevention

- [x] G01 — Audit 36 existing `#[allow(dead_code)]` annotations in `lib.rs`, including the combined allowance. Remove obsolete code and obsolete allowances; document any surviving intentional test/platform case narrowly. These hide potential additional findings beyond the 39 currently emitted locations.
- [x] G02 — Audit 10 existing `clippy::too_many_arguments` allowances: eight in `lib.rs`, one in `agent_runtime.rs`, one in `orchestrator.rs`. Revisit surviving functions together with A01–A12 rather than extending suppressions.
- [x] G03 — Re-run cargo check and Clippy for all targets after cleanup; enforce `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --offline -- -D warnings` once clean. Fresh environments need dependencies fetched before using `--offline`.
- [x] G04 — Run the existing frontend tests and full Rust library tests after code changes, plus the UI suites affected by changed callers or IPC contracts. The implementation run passes all 142 remaining/current Rust tests; 14 tests dedicated solely to the removed, unreachable legacy pipeline were removed and two request/storage compatibility tests added.
- [x] G05 — Make the web build, agreed frontend lint checks, Rust checks, and browser warning checks repeatable in the project's chosen local/CI workflow. No CI configuration was found in this checkout. Do not assume a successful Vite exit means no warnings were emitted.
- [x] G06 — Repeat the full warning inventory after fixes and check off only items supported by fresh output. Treat newly exposed warnings as new tasks.

## Completion criteria

All applicable checklist items are resolved or have a clearly documented scope decision. Rust check and Clippy emit no project warnings, TypeScript and the web build pass without bundle warnings, agreed frontend lint checks pass, supported native builds are clean, and the exercised browser/native workflows emit no unexplained warnings or errors. Existing tests continue to pass. No broad warning suppression or behavior/data loss is used to meet the target.

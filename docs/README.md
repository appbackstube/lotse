# Lotse marketing website

A responsive, English-language marketing page for Lotse, with an outcome-led headline, a real taskboard and three connected use cases. Plain HTML, CSS, and JavaScript; no installation or build step. The screenshots show the actual Lotse interface with in-memory sample project data, not live agents or customer information. All fonts and assets are local. There are no analytics, cookies, or third-party embeds.

## Positioning

The page addresses developers who already use AI agents and need to coordinate parallel work, retain task context, and review changes. The example workflow explains task delegation; the product screenshots demonstrate the interface; the questions cover adoption requirements and provider billing. This audience focus is a positioning hypothesis, not a measured conversion result. Keep the page free of unverified testimonials, performance numbers, and download availability claims.

## Preview locally

From the repository root:

```sh
python3 -m http.server 4173 --directory docs --bind 127.0.0.1
```

Open <http://127.0.0.1:4173>. Use an HTTP server rather than opening the HTML file directly, because the screenshot gallery uses a JavaScript module. The headline animation plays once and respects reduced-motion preferences. Task views support arrow keys, Home, and End. Clicking a product image opens a larger view; Escape closes it.

Run the website checks:

```sh
node --test scripts/marketing.test.mjs
```

## Publish with GitHub Pages

The deployment repository is [appbackstube/lotse](https://github.com/appbackstube/lotse), with SSH origin `git@github.com:appbackstube/lotse.git`. The expected project-site address is **https://appbackstube.github.io/lotse/**.

1. Upload the complete Lotse source project to that repository, including `docs/`, `scripts/marketing.test.mjs`, and the hidden `.github` directory. The existing `.gitignore` excludes local dependencies, build output, downloaded Codex runtimes, credentials, and signing material. Keep `src-tauri/binaries/manifest.json` and the runtime preparation scripts in Git so the app can be built from source. Scan the exact upload contents for secrets before pushing.
2. Open the repository's **Settings → Pages → Build and deployment** and choose **GitHub Actions** as the source.
3. Open **Actions → Publish Lotse website → Run workflow** and run it on the repository's default branch.
4. The successful deployment shows the website URL in the `github-pages` environment: `https://appbackstube.github.io/lotse/` unless a custom domain is configured.

After the first deployment, pushes changing `docs/` on the default branch publish the website automatically. The workflow also runs the website checks and sets the GitHub project links to the actual repository. It deploys only the website files, not the app source or the desktop build. No API keys, npm install, or app build are needed.

GitHub reference: [Configure a publishing source](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site) and [custom Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

### Optional: publish directly from `/docs`

You can instead choose **Deploy from a branch**, select the default branch and **`/docs`**, then save. Relative asset paths also work at a repository URL. On a standard `*.github.io` address, the website derives the GitHub repository automatically.

The repository URL is already set in `docs/repository.js`, including for local previews and custom-domain branch publishing:

```js
export default "https://github.com/appbackstube/lotse";
```

The Actions workflow sets this from its destination repository as well. The local preview now links to the same GitHub project.

## Content and assets

- `index.html`: English copy and accessible screenshot gallery. Update the product claims here when capabilities change.
- `styles.css`: Responsive layout, typography, and reduced-motion support.
- `site.js`: Task screenshot navigation, keyboard support, image dialog, and GitHub links.
- `repository.js`: Optional repository URL for previews or custom-domain branch publishing.
- `assets/lotse-icon.png`: Sized from the app's existing icon.
- `assets/*.png`: Screenshots of the actual app rendered by `scripts/marketing-preview.html`.

### Refreshing product screenshots

With the app's existing dependencies installed, run `npm run dev` and open `http://127.0.0.1:1430/scripts/marketing-preview.html` in a browser using dark appearance and a 1600 × 1000 viewport. This renders the real React app against a strict synthetic IPC fixture. It never accesses native files, real accounts, credentials, or live agents. Capture the taskboard, workspace, task tabs, and MCP settings to replace the matching files in `assets/`. The example Browser tab shows its initial empty state: native WebKit website content is not rendered in this browser-only fixture.

Before capturing a task tab, move focus to the task dialog container with `document.querySelector('[role="dialog"]').focus({ preventScroll: true })`. Verify that the intended tab has `aria-selected="true"` and no tab matches `:focus-visible`; this keeps keyboard focus rings out of product screenshots. Save captures outside the checkout first so Vite does not reload the app during the sequence.

The page offers separate Apple Silicon and Intel DMGs from the latest published GitHub release, using the stable asset names `Lotse_Apple_Silicon.dmg` and `Lotse_Intel.dmg`. The release workflow publishes both together after successful builds; updating the release updates both download destinations without a website rebuild. The installation note states that these builds are ad-hoc signed and not notarized by Apple. Keep that note accurate if Developer ID signing and notarization are added later.

## Evidence and decisions — 12 November 2026

Audience: developers on a Mac who already use coding agents and lose track of parallel tasks. Lead with the outcome (keep the overview), identify the product as an AI agent workspace, and show the actual taskboard before deeper explanations. Three entry points cover planning/delegation, task context, and review/decisions. The development-only attention stack is described separately in the version FAQ. Roles, playbooks, lane automation, schedules, memory, MCP and GitHub import support these workflows rather than forming a separate feature catalogue.

Public sources below were read on **2026-11-12**. These are qualitative signals, not search-volume, market-size, willingness-to-pay or conversion measurements. Competitor statements describe their own published positioning, not independently tested capabilities.

| Source | Observed signal | Decision |
| --- | --- | --- |
| [Reddit: Running more than one coding agent at once](https://www.reddit.com/r/AI_Agents/comments/1ushzdp/running_more_than_one_coding_agent_at_once/) (page displays “4mo ago”) | The author loses track of simultaneous agents, manually manages worktrees and worries about reviewing versus blindly merging. Replies stress task boundaries; worktrees postpone overlapping merge problems. | Explain separate worktrees and human review without claiming conflict-free merges. Treat this small, self-selected discussion as anecdotal evidence. |
| [Alex Dunlop: fifteen agents in London](https://www.alexdunlop.com/writing/claude-code-worktrees) (published 2026-11-02) | A first-person report says review took longer than building and merges blocked one another. The author now uses smaller slices and carries ticket context into briefs. | Keep the brief, conversation and diff central; avoid “more agents = faster” promises. |
| [Conductor](https://conductor.build/) (homepage; changelog displayed 2026-11-09) | Leads with a team of agents in the cloud, isolated microVMs, multiplayer workspaces and existing subscriptions/keys. | Name Lotse's Mac/local-repository workflow and API-key requirement clearly. Do not imply subscription sign-in or cloud collaboration. |
| [Emdash](https://www.emdash.sh/) (homepage; no publication date displayed) | Leads with team agents on own infrastructure or cloud, recurring work, shared environments and reviews. Desktop Classic remains available; new development is described as moving to 2.0. | Show Lotse's repeatable workflows, but do not claim these are unique or imply team administration, SSO or hosted execution. |

Search-result spot checks on Google (Austria, English queries, 2026-11-12): “parallel coding agents worktrees review context 2026” and “site:reddit.com multiple coding agents context review worktrees 2026”. Results surfaced worktree tutorials, review/context discussions and commercial orchestration tools. Result order is temporary; no ranking or traffic inference is made.

| Priority / search intent | Page destination | Product evidence / tradeoff |
| --- | --- | --- |
| 1: “AI agent workspace Mac”, “manage parallel coding agents” — evaluate a desktop workspace | Homepage title, hero, taskboard, three use cases | Existing tasks and concurrent runs in `src/App.tsx`; workspace/worktree choices. Strong fit; crowded category, demand size unknown. |
| 2: “parallel agents git worktrees”, “review AI code changes” — understand an independent-task workflow | `#workflow`, `#workspace`, FAQ | Task coordination and merge-base diffs in `docs/REFERENCE.md`; `load_task_changes` in the backend. Good problem evidence; worktrees still need integration review. |
| 3: “AI coding task context”, “automate coding tasks” — retain context and repeat work | `#tasks`, workflow repeat text, `#connections` | Actual Draw/Sandbox/Browser panels; `src/agents.ts`, `src/playbooks.ts`, `src/laneAutomation.ts`, `src/promptSchedules.ts`, repository memory and GitHub Inbox. Supporting intent; no separate thin landing pages. |

Requirements, provider billing, credential storage and one-time GitHub import were checked against `README.md`, `docs/REFERENCE.md`, `src-tauri/tauri.conf.json` and the corresponding frontend/backend implementations. This worktree is the source of product claims; screenshots demonstrate its interface, not proof that every source feature is included in a previously downloaded release. No price, notarization, minimum macOS version, compatibility guarantee or live integration status has been invented. Both public DMG URLs returned HTTP 200 after redirects to release v0.1.2 on 2026-11-12; this verifies availability, not installation.

### Search deployment boundaries

The canonical, Open Graph URL, SoftwareApplication URL and sitemap point to the existing project site `https://appbackstube.github.io/lotse/`. The application schema deliberately omits offers and ratings. If the public origin changes, update all four together. Submit `/lotse/sitemap.xml` through an already authorized Search Console account when appropriate; no account was accessed here.

A GitHub project cannot control the owner site's root `/robots.txt` from `/lotse/robots.txt`, so no ineffective project-level robots file is added. The page has no `noindex`; the screenshot fixture explicitly has `noindex, nofollow` and is outside the deployed `docs/` tree. Local previews must stay local; private staging should use access control or an HTTP `X-Robots-Tag: noindex` header. Publication and production indexing changes are outside this task.


### Screenshot provenance and verification

Refreshed on 2026-11-12 from the actual React `App` at base commit `33930ea792f1f511975abc69f128a365fcb67f0b`, with the existing `scripts/marketing-preview.tsx` IPC fixture: taskboard, workspace and all five task tabs. Capture: Chromium, dark appearance, 1600 × 1000, Orbit sample project. The fixture imports the production components; no Lotse UI was recreated or generated. The Sandbox contains an example settings prototype; the Browser shows its empty state. Native WebKit browsing and live agent/provider calls are not exercised by these captures. `connections.png` is retained from the same base commit and unchanged MCP fixture, visually checked against its sample configurations. Earlier assets remain in Git history; raw refreshed captures are also attached to the task.

Website verification (2026-11-12): all 8 marketing checks pass; `npm run build` passes including ESLint, TypeScript and Vite. Local HTTP preview was checked with the already installed Playwright/Chromium at widths 1440, 768, 390 and 320. No horizontal overflow; the task and review product images retain the full content width on mobile. Tab Home/End navigation, image dialog/Escape, full-size scrollable mobile images, reduced motion, JSON-LD/canonical output, sitemap HTTP 200 and visible no-JavaScript downloads pass. Browser page-error lists are empty. The mobile check found and fixed a pre-existing grid-specificity problem that kept desktop columns active. Both DMG targets respond with HTTP 200; no installation test was performed. No native app/backend behavior changed, so simulator and Rust tests were not run.


Release distinction: local tag `v0.1.2` resolves to `cfcffd74c237bd01df4322a9b2255f16261eea97`, four commits before the screenshot base. Git comparison confirms the shared attention stack and default/new-task role management were added afterward. The public copy therefore labels screenshots as a development build and identifies these additions in a version FAQ; it does not sell the shared attention stack as part of the v0.1.2 download. Existing saved roles, playbooks, task coordination, lanes, schedules and task-level questions remain part of the core workflow.

Local performance sample: Chromium headless, 390 × 1000, localhost, no CPU/network throttling, one navigation: DOMContentLoaded 30 ms, load 39 ms, LCP 116 ms; 7 resources / 254,850 transferred bytes at initial load. These are local lab observations, not production Core Web Vitals or mobile-device performance. Below-fold screenshots load lazily; the hero has explicit dimensions and high fetch priority. No external fonts, analytics or embeds were added.

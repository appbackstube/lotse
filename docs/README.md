# Lotse marketing website

A responsive, English-language marketing page for Lotse, following the supplied layout sketch: animated headline, real taskboard, alternating workspace/tasks/MCP sections. Plain HTML, CSS, and JavaScript; no installation or build step. The screenshots show the actual Lotse interface with in-memory sample project data, not live agents or customer information. All fonts and assets are local. There are no analytics, cookies, or third-party embeds.

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

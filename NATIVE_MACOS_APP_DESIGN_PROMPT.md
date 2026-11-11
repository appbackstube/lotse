# Native macOS App Design Prompt

You are a senior frontend engineer and product designer. Redesign the existing application so it feels like a polished first-party macOS app with the calm, precise visual character of modern Apple productivity tools and the Codex desktop app.

Implement the redesign. Do not stop after describing it or producing a plan.

## Goal

The interface should initially look like it was built with SwiftUI or AppKit and only later reveal that it is a web-based UI.

Match native information hierarchy, density, typography, interaction patterns, and surface structure. Do not merely add rounded corners or blur to imitate macOS superficially.

Preserve existing product behavior unless a web-style interaction must be reorganized to feel native. Reuse the current component primitives and dependencies. Do not add a new design-system dependency or custom webfont.

## Before editing

Inspect the existing shell, navigation, lists, toolbars, dialogs, forms, empty states, and primary workflows. Then answer internally:

1. How would Apple structure this screen in a first-party macOS app?
2. Which elements belong in the sidebar, content toolbar, source list, inspector, sheet, popover, or contextual menu?
3. Which web conventions make the current UI feel like a dashboard or website?
4. Which existing semantic tokens and shared components can carry the redesign globally?

Prefer a small central change over restyling every component independently.

## App shell

- Build the shell as a native split view: one full-height navigation sidebar and one main content pane.
- The sidebar extends into the macOS titlebar and owns repository, workspace, project, or navigation selection.
- The main pane owns its toolbar. Do not place a website-style global header above both sidebar and content.
- Optional inspectors appear as a trailing pane, not as floating cards.
- Toolbars are compact, visually quiet, and separated with a single hairline.
- Remove product logos or oversized page titles when they duplicate the window or navigation context.
- Keep contextual actions close to the content they affect.

## Typography

Use the native system font and let macOS provide SF Pro:

```css
font-family: system-ui, -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif;
```

Use SF Mono for code:

```css
font-family: ui-monospace, "SF Mono", SFMono-Regular, Menlo, monospace;
```

- Regular text: `400`.
- Labels and selected rows: `500`.
- Buttons and important controls: `600`.
- Avoid `700`; use semibold for headings unless a true display title requires more emphasis.
- Default desktop UI text: `13px` with approximately `1.35` line height.
- Supporting metadata: `11–12px`.
- Reading content and chat answers: `13–14px` with `1.5–1.6` line height.
- Code: `11–12px`, depending on density.
- Keep tracking neutral or only slightly negative. Never apply letter spacing to code.
- Use native font smoothing and normal kerning. Avoid decorative typography.

Recommended rendering:

```css
font-synthesis: none;
font-kerning: normal;
font-optical-sizing: auto;
text-rendering: auto;
-webkit-font-smoothing: antialiased;
-moz-osx-font-smoothing: grayscale;
```

## Semantic colors

Implement colors as shared semantic tokens. Components must not own separate hard-coded palettes.

### Light mode

```css
--app-sidebar: #f5f5f3;
--app-content: #ffffff;
--app-elevated: #ffffff;
--label-primary: #292927;
--label-secondary: #6f6f6b;
--label-tertiary: #9a9a95;
--separator: rgba(30, 30, 28, 0.10);
--fill: rgba(30, 30, 28, 0.055);
--fill-strong: rgba(30, 30, 28, 0.095);
--accent: #0873d7;
--accent-pressed: #0667c2;
--success: #23833f;
--destructive: #c93232;
--success-fill: #f0f8f2;
--destructive-fill: #fff3f2;
```

### Dark mode

```css
--app-sidebar: #20201f;
--app-content: #171716;
--app-elevated: #272726;
--label-primary: #ececea;
--label-secondary: #aaa9a5;
--label-tertiary: #777773;
--separator: rgba(255, 255, 255, 0.105);
--fill: rgba(255, 255, 255, 0.065);
--fill-strong: rgba(255, 255, 255, 0.12);
--accent: #0a84ff;
--accent-pressed: #2994ff;
--success: #56c86a;
--destructive: #ff7771;
--success-fill: rgba(63, 185, 80, 0.12);
--destructive-fill: rgba(240, 91, 85, 0.12);
```

- Follow `prefers-color-scheme` unless the app already provides a user-controlled appearance setting.
- Use blue only for primary actions, links, focus, and meaningful active controls.
- Selected source-list rows use a neutral fill, not a solid blue background.
- Reserve green and red for real success, diff, and destructive meaning.
- Use one-pixel semantic separators instead of visible borders around every region.
- Keep shadows subtle and limited to floating surfaces and the composer.
- Do not add gradients, glass effects, neon colors, or decorative backgrounds.

## Source lists and file trees

- Treat the sidebar as a macOS source list, not a generic tree widget.
- Use approximately `31px` desktop rows and `8px` row radii.
- Use a broad, soft neutral selected state with medium-weight text.
- Keep hover states quieter than selection.
- Align every row to fixed columns: disclosure indicator, icon, flexible label, trailing metadata.
- Folder and file labels must share a consistent text axis at each hierarchy level.
- Indent each level by approximately `16px`.
- Use small, restrained icons. Avoid placing an icon on every possible label if hierarchy already communicates its meaning.
- Truncate long paths and filenames without breaking the trailing status column.
- Put additions, deletions, badges, or approval status at the trailing edge using tabular figures.
- Use muted section labels instead of oversized sidebar page headings.
- Do not wrap every folder group in a card or border.

## Toolbars and controls

- Toolbar height: approximately `52px`; content sub-toolbar: `48–56px` when necessary.
- Buttons are semibold and compact, generally `28–32px` high on desktop.
- Secondary actions are neutral or icon-only. Do not make every action blue.
- Preserve visible focus indication without using a heavy web-style ring.
- Use animated segmented controls with a moving selection plate and a restrained `160–200ms` easing.
- Use native switches, popovers, contextual menus, sheets, and action sheets instead of generic centered modals.
- Group related form rows as inset lists rather than independent cards.
- Destructive actions must be clearly labeled and visually restrained until confirmation is necessary.

## AI chat and conversational UI

- Present the chat as a calm reading surface, not a stack of message cards.
- Assistant responses are plain document content without borders or background containers.
- User messages are the only bubbles: right aligned, soft neutral fill, generous radius, and a narrower maximum width.
- Put time and copy actions in a quiet metadata row outside the user bubble.
- Separate turns with whitespace, not card borders.
- Render progress as a simple inline status or thin separated row, not another chat bubble.
- Keep proposed patches or actionable suggestions visually grouped because they are interactive artifacts, not ordinary prose.
- Anchor a large composer at the bottom with a subtle border, `16–18px` radius, and a very soft shadow.
- The textarea should dominate the composer. Context selection and send/stop controls sit in a compact bottom toolbar.
- Keep full keyboard behavior: Enter sends, Shift+Enter inserts a newline, Escape or an explicit stop control cancels when supported.
- Preserve accessible labels for context, copy, send, stop, and attachment controls.

## Spacing and surfaces

- Prefer `4`, `6`, `8`, `12`, `16`, `20`, and `24px` spacing increments.
- Use whitespace and alignment before adding containers.
- Avoid card-heavy dashboards. A card is appropriate only for a distinct interactive artifact or grouped data object.
- Keep corner radii proportional: `7–9px` for compact controls, `10–12px` for grouped rows, `14–18px` for sheets, bubbles, and composers.
- Do not combine a border, strong background, and shadow unless the surface is genuinely floating.

## Motion and accessibility

- Use short, restrained motion with physically natural easing.
- Respect `prefers-reduced-motion`.
- Support keyboard navigation, visible focus, screen readers, text zoom, and high-contrast states.
- Desktop rows may be compact, but coarse-pointer touch targets must be at least `44px`.
- Maintain WCAG AA contrast for normal text and controls.
- Do not encode state using color alone.

## Implementation constraints

- Keep existing behavior, state management, data flow, and backend interfaces intact.
- Use the app's existing component primitives and styling system.
- For React applications, prefer shared semantic CSS variables plus existing Tailwind utilities.
- If shadcn/ui is present, use its source as a behavior baseline but replace its default visual appearance.
- If Base UI is present, preserve its accessibility and interaction behavior.
- Do not add a custom design-system abstraction unless multiple existing components genuinely require it.
- Do not add dependencies for effects achievable with CSS or native browser behavior.
- Remove obsolete visual overrides once the shared tokens cover them safely.

## Required workflow

1. Inspect the current app and identify the shared shell and semantic styling entry points.
2. Fix typography and color tokens first.
3. Convert the app shell to a native split-view hierarchy.
4. Refine source lists, toolbars, forms, sheets, and chat using the rules above.
5. Verify light and dark mode plus hover, focus, selected, disabled, loading, success, and destructive states.
6. Run the existing build and relevant tests.
7. Report the files changed, verification performed, and any remaining unrelated warnings.

## Acceptance criteria

- The app no longer resembles a website dashboard.
- Sidebar and main content read as one native window with clear pane ownership.
- Typography looks sharp, compact, and consistently weighted.
- Selection, hierarchy, and trailing metadata in source lists are immediately readable.
- Assistant chat responses read like a document instead of cards.
- Light and dark mode feel intentionally designed rather than mechanically inverted.
- Existing workflows still function and the project builds successfully.

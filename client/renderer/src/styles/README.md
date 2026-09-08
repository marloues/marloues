# Renderer CSS Architecture

Renderer styles are organized by responsibility, not by recovered cascade
position.

1. `index.css` owns Tailwind's low-priority layer.
2. `tokens.css` owns the semantic design system and theme values.
3. `components/index.css` is the global component-style manifest.
4. New component-local styles use adjacent CSS Modules.

## Semantic Tokens

Product code consumes stable names such as:

- `--surface-navigation`, `--surface-workspace`, `--surface-elevated`
- `--text-1`, `--text-2`, `--text-3`
- `--border-subtle`, `--border`, `--border-strong`
- `--shell-divider`, `--shell-divider-active`
- `--motion-fast`, `--motion-normal`, `--motion-shell`
- `--primary-sidebar-width`, `--auxiliary-sidebar-width`

Theme values live only in `tokens.css`. The default block is dark; light and
warm override the same semantic contract. Dark and light are the frozen
Workbench baselines. Warm remains supported but is not part of pixel review.

Component styles use the same contract for typography and geometry:
`--font-ui` / `--font-code`, `--text-*`, `--space-*`, `--radius-*` /
`--card-radius`, and `--motion-*` / `--ease`. Geometry limits such as scroll
caps and icon sizes may remain layout values.

The `--tw-*` palette is a compatibility layer, not a substitute for the
semantic tokens above in new component styles. Tailwind utility names also
do not guarantee token alignment: for example, its default `text-sm` is 14px,
while this design system's `--text-sm` is 12px. Consume the existing semantic
variables in adjacent CSS Modules instead of introducing another scale.

Do not create per-declaration variables, generated hashes, or component tokens
for layout values such as `display`, `opacity`, `border: 0`, or `flex`.
Component-specific custom properties are allowed only when they represent a
real reusable concept, and their names must be readable.

## Component Ownership

Each global selector has one owner file under `components/`. Files are imported
in dependency order: foundation, Workbench shell, business views, overlays,
then notifications. A component may consume shared semantic tokens but must not
patch selectors owned by another component.

New React components should prefer an adjacent `ComponentName.module.css`.
Global CSS remains appropriate for long-lived class contracts shared by the
Workbench and existing business views.

## Shared Components

Reuse the primitives exported by `components/ui/index.ts`: `Button` for actions,
`Card` / `Divider` for surfaces and separators, and `DisclosureRow` / `StateDot`
for expandable rows and status. Their adjacent CSS Modules own their visuals.
Do not reproduce their borders, hover styles, or keyboard toggle handlers in
business components.

Conversation adapters such as `WorkflowActivityRow` and `MessageToolRow` supply
labels, details, and protocol markers to `DisclosureRow`. Keep session/turn/item
expansion memory in the conversation layer via `useItemDisclosure`; the UI
primitive accepts controlled `open` / `onOpenChange` or local `defaultOpen`.
Specialized layouts such as `IoCard` compose the shared primitives and own only
their input/output layout.

Content actions reuse `FloatingActions` inside a positioned
`data-floating-actions-host`. The toolbar floats at the top right without
reserving a row; it appears on hover or keyboard focus. Touch interfaces keep
it available. Tables fill the content width and scroll horizontally when their
minimum column widths exceed it. Table, code, writing, diagram and input/output
actions share this contract.

File and review panels share `ResizableSplitPane` for their content/tree divider.
It preserves the content minimum, clamps the tree at its minimum during dragging,
then closes the tree after a further 40px drag. The owning toolbar restores the
tree at its last width. Separator hit areas, colors and cursor use shared tokens;
keyboard arrows resize, Enter closes, and Escape cancels an active drag.

Rich hover previews reuse `HoverPreview`. It renders outside clipping ancestors,
centers on its trigger, flips above/below within the visible boundary, and keeps
the preview open while the pointer moves into it. Conversation callers reserve
the composer area in that boundary. Review cards use a transparent resting
surface and `--raised-1` on hover.
Review previews target 800px, capped by their card/row and window widths. They
are disabled while that session's auxiliary region is open, regardless of its
active tab or whether it is showing the empty launcher.

Conversation file references reuse `WorkflowFileLink` for naming, hover paths,
and file previews. Callers must not implement their own path shortening or line
suffixes. See [the file link rules](../components/workflow-chat/content/README.md).
Path hints use the shared `Tooltip` rather than native `title`. Tooltip surfaces,
type, spacing and shadows use semantic tokens; long text wraps, and a viewport
portal keeps the hint visible outside clipped rows and flips it near the edges.

Completed answer selections use `TextSelectionAction` with one “添加到对话”
button. It floats above the selected text, flips below when needed, and never
adds a row to the answer. Clearing the selection or pressing Escape dismisses it;
the callback keeps the existing quote-to-composer behavior.

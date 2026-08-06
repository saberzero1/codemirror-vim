# Differences from upstream replit/codemirror-vim

This document tracks all modifications made to this fork compared to
[replit/codemirror-vim](https://github.com/replit/codemirror-vim).

Upstream base: commit `1ccb518` (post-v6.3.0, HEAD of `master` as of 2026-06-23).

## Infrastructure changes

### Capture-phase Escape handler for Obsidian compatibility

**File**: `src/index.ts`

When loaded as a CM6 extension via `registerEditorExtension()`, Obsidian's
application-level key handling intercepts Escape before the ViewPlugin sees it.
The ViewPlugin constructor installs a capture-phase `keydown` listener on
`document` that catches Escape while the editor has focus and vim is in insert,
visual, or operator-pending mode. Removed in `destroy()`.

### Observer-based keydown dispatch

**File**: `src/index.ts`

Vim's keydown processing is registered as a CM6 `eventObservers.keydown`
(DOM event observer) instead of `eventHandlers.keydown` (DOM event handler).
In CM6's dispatch order, `InputState.keydown()` bookkeeping runs first, then
all observers, then handlers. This guarantees the vim key handler fires before
any other CM6 extension's `keydown` handler (e.g., obsidian-latex-suite),
regardless of `Prec` ordering or plugin load order — observers always run
before handlers.

When vim consumes a key, `handleKey()` calls `e.preventDefault()`. The
subsequent handler loop in CM6's `runHandlers` sees `event.defaultPrevented`
and breaks — other extensions' handlers never fire for that key. Unconsumed
keys propagate to the handler chain normally.

This approach preserves CM6's internal state management (`InputState.keydown()`
runs `observer.forceFlush()`, updates `lastKeyCode`/`lastKeyTime`, and handles
platform quirks) while solving the precedence problem.

### `setKeyInterceptActive` API

**File**: `src/index.ts`

Added `setKeyInterceptActive(active: boolean)` as a module-level export.
When `true`, the `eventObservers.keydown` observer skips vim processing
entirely and lets the event reach the handler chain unmodified.

The host plugin calls `setKeyInterceptActive(true)` when entering a modal
key-interception state (e.g., flash label selection, EasyMotion label
selection, hint mode) and `setKeyInterceptActive(false)` when the modal
exits. Without this, the observer would call `preventDefault` on label
keypresses before the host's modal capture-phase handlers can process them.

### Testing API surface

**File**: `src/vim.js`

Added `getInputState(cm)`, `getLastEditInfo(cm)`, `getSearchState(cm)`,
`getJumpList()`, and `getMacroState()` to the `vimApi` object for state
introspection during testing.

### `enterInsertMode` API exposure

**File**: `src/vim.js`

Added `enterInsertMode(cm)` to the `vimApi` object. Obsidian's built-in
`vim.js` exposes this method (a thin wrapper around `actions.enterInsertMode`)
but upstream `@replit/codemirror-vim` does not. Ecosystem plugins
(obsidian-outliner, obsidian-lineage) call `Vim.enterInsertMode(cm)` directly
to transition the editor into insert mode after custom actions. Without this
export, those calls would throw `TypeError` when using the bundled fork.

### Keymap introspection API

**Files**: `src/vim.js`, `src/types.ts`

Added `getKeymap(context?)` and `getCompletions(prefix, context?)` to the
`vimApi` object for querying registered key bindings at runtime.

`getKeymap(context?)` returns a snapshot of the full keymap (default +
user-defined mappings). Each entry is a plain-object copy containing `keys`,
`type`, and any type-specific fields (`operator`, `motion`, `action`,
`toKeys`, etc.). When `context` is provided (`'normal'`, `'visual'`,
`'insert'`, or `'operatorPending'`), entries that explicitly belong to a
different context are excluded; entries without a context field (valid in all
contexts) are always included.

`getCompletions(prefix, context?)` returns keymap entries whose `keys` start
with the given prefix, augmented with a `suffix` field containing the
remaining characters after the prefix. This enables which-key-style UIs that
show available continuations after a partial key sequence (e.g.
`getCompletions('g', 'normal')` returns entries for `gg`, `gj`, `gk`, `g~`,
etc. with their respective suffixes).

Both methods return defensive copies — callers cannot mutate the internal
keymap. User-defined mappings (via `:map`, `:noremap`, `Vim.map()`) are
included alongside default bindings.

Types `KeymapEntry` and `KeymapCompletion` added to `src/types.ts`.

### `getAction` API

**File**: `src/vim.js`

Added `getAction(name)` to the `vimApi` object. Returns the current action
function registered under the given name, or `undefined` if no action exists
with that name. This enables the save/restore pattern for action overrides:
a host plugin can capture the original built-in action before replacing it
via `defineAction()`, and restore it on unload.

### `getMotion` API

**File**: `src/vim.js`

Added `getMotion(name)` to the `vimApi` object. Returns the current motion
function registered under the given name, or `undefined` if no motion exists
with that name. This enables the same save/restore pattern as `getAction` but
for motions — a host plugin can capture the original built-in motion (e.g.
`moveToCharacter`) before replacing it via `defineMotion()`, and delegate to
the original when the override is disabled. Used by the flash motions feature
to capture `moveToCharacter` and `moveTillCharacter` before overriding them.

### `recordLastCharacterSearch` API

**File**: `src/vim.js`

Added `recordLastCharacterSearch(increment, args)` to the `vimApi` object.
Sets `vimGlobalState.lastCharacterSearch` (the state used by `;` and `,`
repeat commands) from plugin code. Previously this was an internal function
called only from the built-in `moveToCharacter` and `moveTillCharacter`
motions. When a host plugin overrides these motions (e.g. flash-style
enhanced `f`/`F`/`t`/`T`), it needs to update the repeat state so that `;`
and `,` continue to work after the override resolves.

Parameters:
- `increment`: `0` for `f`/`F` motions, `-1` for `t` forward, `1` for `T` backward
- `args`: `{ forward: boolean, selectedCharacter: string }`

### `feedKeys` API

**File**: `src/vim.js`

Added `feedKeys(cm, keys, options)` to the `vimApi` object. Feeds a key
sequence into the vim key handler with correct noremap semantics. Unlike
`handleKey(cm, key, origin)` — which processes one key at a time and whose
`origin` parameter only controls macro recording, not remapping —
`feedKeys` delegates to the internal `doKeyToKey` function which manages
the `noremap` flag and `keyToKeyStack` recursion protection.

Parameters:
- `cm`: The CodeMirror adapter instance
- `keys`: Key sequence string, e.g. `"gk"` or `"<C-w>v"` (parsed by `doKeyToKey`'s `/<(?:[CSMA]-)*\w+>|./gi` regex)
- `options`: Optional object with `{ noremap?: boolean }`. When `noremap` is `true` (default), returned keys bypass user mappings. When `false`, keys are subject to remapping.

Used by the host plugin's expr mapping implementation: when a Lua `{ expr = true }` keymap callback returns a string like `"gj"`, the plugin calls `feedKeys(cm, "gj", { noremap })` to inject the result with the mapping's noremap flag respected.

### `undefineEx` API

**File**: `src/vim.js`

Added `undefineEx(name)` to the `vimApi` object. Removes an ex command
previously registered via `defineEx`. Cleans both the `exCommands` function
map and the `commandMap_` prefix lookup (iterates all prefix entries and
deletes any whose `.name` matches). Returns `true` if the command existed and
was removed, `false` otherwise.

Used by the Vim Motions plugin's vimrc soft-reload: when a user removes an
`exmap` definition from their vimrc and saves, the plugin calls `undefineEx`
to clean up the stale handler before re-applying the updated vimrc. Without
this, stale `exmap` handlers persisted until full plugin reload.

### `removeMapCommand` API

**File**: `src/vim.js`

Added `removeMapCommand(keys)` to the `vimApi` object. Removes all entries
from the default keymap whose `keys` field matches the given string, and
decrements the `usedKeys` counters accordingly. Returns `true` if at least
one entry was removed, `false` otherwise.

`Vim.unmap()` cannot remove entries created by `Vim.mapCommand()` because
`unmap` checks the `context` field during iteration and `mapCommand` entries
have no context. `removeMapCommand` provides a clean removal path for
plugin-registered keymap entries (EasyMotion motions, leader-prefixed
commands, etc.) that need to be cleaned up when the leader key changes or
features are toggled.

### Key string normalization for `map`/`mapCommand`

**File**: `src/vim.js`

Added `normalizeKeyString(keys)` which converts literal special characters in
key sequence strings to the angle-bracket notation that `vimKeyFromEvent`
produces. Currently only space (`' '` → `'<Space>'`) is affected — it is the
only printable character in the `specialKey` map. Existing angle-bracket
groups (e.g. `<C-Space>`, `<S-Space>`) are preserved.

`_mapCommand` now normalizes both `command.keys` and `command.toKeys` before
inserting into the keymap. `ExCommandDispatcher.unmap()` and
`removeMapCommand()` normalize the lookup key before comparison.

This fixes the mismatch where `Vim.map(' j', 'gj')` stored `keys: ' j'` but
`vimKeyFromEvent` produced `'<Space>'` on key press, causing `commandMatch`
to never find the mapping. With normalization, the stored key becomes
`'<Space>j'`, matching the dispatched key. The default keymap already uses
`<Space>` notation (e.g. `{ keys: '<Space>', toKeys: 'l' }`), so
normalization is a no-op for built-in entries.

Callers of `Vim.map()`, `Vim.mapCommand()`, `Vim.noremap()`,
`Vim.unmap()`, and `Vim.removeMapCommand()` can now use either literal
space or `<Space>` — both resolve to the same keymap entry.

### Async motion dispatch

**Files**: `src/vim.js`, `src/types.ts`

Refactored `evalInput` to extract `applyOperator` as a separate method. Motion
results that are thenables (Promises) defer operator application via `.then()`.
Visual mode is properly handled in the async path — selection head/anchor and
marks are updated when an async motion resolves during visual mode. `MotionFn`
return type widened to include `Promise<Pos|[Pos,Pos]|null>`.

### Async motion generation tracking

**File**: `src/vim.js`

Async motion callbacks now validate a `_commandGeneration` counter to reject
stale resolutions. The counter lives on `cm.state.vim` and is incremented by
`clearInputState()`. Before dispatching an async motion, `evalInput` captures
the pre-increment generation. The `.then()` callback checks that the current
generation equals `savedGeneration + 1` — if another command ran in between
(incrementing the counter further), the callback exits without modifying
cursor or content. The `.catch()` path applies the same guard before clearing
input state.

This prevents a race where an async motion (e.g. EasyMotion overlay) resolves
after the user has already issued another command, which would otherwise apply
the old operator to the new cursor position.

### Blur handler for partial key prefix reset

**File**: `src/index.ts`

The CM6 ViewPlugin registers a `blur` event listener on `view.contentDOM` that
resets partial normal-mode key sequences when the editor loses focus. Without
this, a buffered prefix like `g` persists indefinitely — when the user refocuses
and types `G`, the stale `g` + `G` = `gG` produces a no-match, and the `G`
keystroke is swallowed. The blur handler calls `Vim.clearInputState()` and
clears `vim.status` so the chord display also resets. Insert mode is excluded
(partial sequences like `jk` escape should not be disrupted by transient blur).
Cleaned up in `destroy()`.

### Focus handler for block cursor redraw

**Files**: `src/index.ts`, `src/block-cursor.ts`

The CM6 ViewPlugin registers a `focus` event listener on `view.contentDOM`
that calls `blockCursor.scheduleRedraw()` on focus gain. Cleaned up in
`destroy()`.

`BlockCursorPlugin.update()` now includes `update.focusChanged` in its redraw
trigger condition. Additionally, when focus is gained (`update.focusChanged &&
update.view.hasFocus`), the plugin schedules a deferred `requestMeasure` via
`requestAnimationFrame`. This second measurement runs after the browser has
reflowed decoration changes triggered by the focus event — specifically,
Obsidian's live preview re-expanding hidden markdown formatting (e.g. `## `
in headings) on the active line. Without the deferred pass, `coordsAtPos()`
reads stale layout coordinates from the pre-reflow DOM and the block cursor
renders the wrong character. Cleaned up via `cancelAnimationFrame` in
`destroy()`.

### `leaveVimMode` cleanup hardening

**File**: `src/vim.js`

`leaveVimMode()` now performs comprehensive cleanup before nulling
`cm.state.vim`:

- Removes insert-mode `change` and `keydown` listeners if the editor was in
  insert mode (these are normally removed by `exitInsertMode()`, but
  `leaveVimMode` can be called without going through that path — e.g. when
  the CM6 ViewPlugin `destroy()` fires while in insert mode)
- Clears the global `lastInsertModeKeyTimer` (prevents stale timer callbacks
  from firing against a destroyed editor)
- Clears `virtualPrompt` (prevents dangling prompt state)
- Resets `vim.inputState` (clears any pending key prefix, operator, or motion)

### Default keymap protection

**Files**: `src/vim.js`, `src/types.ts`

Default keymap entries are tagged with `_isDefault: true` at module
initialization and a frozen snapshot (`DEFAULT_KEYMAP_SNAPSHOT`) is stored
for recovery. Three API changes protect against accidental keymap corruption:

1. **`unmap()` skips defaults**: The `exCommandDispatcher.unmap()` method now
   skips entries with `_isDefault === true` unless called with
   `{ includeDefaults: true }` in the options argument. This prevents
   accidental removal of built-in keys like `j`, `gg`, `G` during plugin
   lifecycle churn. The public `Vim.unmap(lhs, ctx, options)` bridge
   forwards the `options` parameter to `exCommandDispatcher.unmap()` so
   callers can remove default bindings when needed (e.g. unmapping `,` to
   allow multi-key sequences like `,,w` to accumulate as a prefix).

2. **`Vim.resetKeymap()`**: New API method that rebuilds the `defaultKeymap`
   array from the frozen snapshot. User-defined mappings are preserved;
   defaults are restored from fresh copies. `usedKeys` is rebuilt from
   scratch and `defaultKeymapLength` is recalibrated. Intended for host
   environments (Obsidian) where the module-level singleton survives
   plugin enable/disable cycles.

3. **`mapclear()` uses `_isDefault` flag**: Instead of relying on the
   `defaultKeymapLength` index (fragile if other code splices the array),
   `mapclear()` now partitions entries by the `_isDefault` flag.
   `usedKeys` is rebuilt after clearing.

`_mapCommand()` marks new entries as `_isDefault: false` to distinguish
user-defined mappings from defaults.

### `clearInputState` API exposure

**File**: `src/vim.js`

`clearInputState(cm, reason?)` is now exposed on the `vimApi` object.
Previously private, it is needed by the blur handler in `src/index.ts` and
by host plugins that need to reset pending key state (e.g. on pane switch).

### Stale marker and posFromIndex safety guards

**File**: `src/cm_adapter.ts`

Three defensive changes prevent `RangeError` crashes when `Marker` objects
hold offsets from a previous (longer) document — a scenario that occurs when
the global jumpList (`vimGlobalState.jumpList`) retains markers across
document switches in host environments like Obsidian.

1. **`posFromIndex` offset clamping**: `posFromIndex(doc, offset)` now clamps
   `offset` to `[0, doc.length]` before calling `doc.lineAt(offset)`. This
   mirrors the bounds checking already present in `indexFromPos` (lines
   14–24) and prevents `RangeError` for any out-of-range offset. All 19+
   callers of `posFromIndex` benefit uniformly — including `Marker.find()`,
   `getCursor()`, `listSelections()`, and `getSearchCursor()`.

2. **`Marker.find()` try-catch**: `find()` now catches exceptions from
   `posFromIndex` and returns `null` instead of throwing. The return type is
   already `Pos | null`, and all callers (`jumpList.add` line 624,
   `jumpList.move` line 649/658, `jumpList.find` line 671, `vim.marks`
   access) already handle `null` gracefully. This provides defense-in-depth
   beyond the `posFromIndex` clamping — covering potential failures from
   detached EditorViews or null document state.

3. **`Marker.update()` try-catch**: `update(change)` now catches `RangeError`
   from `change.mapPos()` and sets `this.offset = null`. CM6's `mapPos`
   throws when the marker offset exceeds the changeset's starting document
   length — which occurs when a marker was created on a document that has
   since been replaced without the change flowing through the CM6 transaction
   system. Setting `offset` to `null` marks the marker as deleted, consistent
   with the existing `MapMode.TrackDel` → `null` semantics.

The crash path without these guards: `jumpList.add()` → `curMark.find()` →
`posFromIndex(this.offset)` → `doc.lineAt(offset)` → `RangeError` → bubbles
through `evalInput` → `processMotion` → `processCommand` → `cm.operation()`
try-catch → `cm.state.vim = undefined; maybeInitVimState(cm); throw e` →
vim state wiped, subsequent keystrokes fall through to text insertion.

### Neovim golden comparison infrastructure

**Files**: `test/neovim/`

Step-based extraction (`extract-definitions.ts`, `collect-snapshots.ts`),
headless Neovim recording (`record-golden.ts`, `client.ts`), automated
comparison (`compare.ts`), and deviation registry (`deviations.ts`).

### Per-step golden comparison (v2)

**Files**: `test/vim_test.js`, `test/neovim/collect-snapshots.ts`,
`test/neovim/golden.ts`, `test/neovim/record-golden.ts`,
`test/neovim/compare.ts`

The instrumented `doKeys` in `vim_test.js` now captures `stateAfter`
(content, cursor, mode) after each key step — 1504 steps at 100% coverage.
The golden recorder captures Neovim state after each keys step as
`stepResults[]` on each golden case. The comparison does per-step diffing
when both golden and definition have step data, falling back to final-state
comparison otherwise.

476 pass / 0 diff / 280 known against Neovim 0.12.2 with per-step comparison
(more strict than final-state-only). The 280 known deviations are tracked in
`deviations.ts`: ~62 fork-only features (surround, async motions), ~41 PCRE
regex, ~32 CM6 platform differences, ~81 multi-step extraction artifacts,
~26 setup replay, ~8 viewport-dependent, ~6 config mismatch, remaining misc.

### Visual mode selection class toggle

**File**: `src/index.ts`

The ViewPlugin toggles a `.cm-vimVisual` CSS class on the editor's `scrollDOM`
when visual mode is active. This allows the `::selection { transparent }` rule
in `block-cursor.ts` to be scoped to `.cm-vimMode:not(.cm-vimVisual)`, so that
visual mode shows the browser's native selection highlight instead of hiding it
behind the block cursor overlay.

### `setLivePreviewField` API

**Files**: `src/cm_adapter.ts`, `src/index.ts`

Added `setLivePreviewField(field: StateField<boolean>)` to configure a
host-provided state field that indicates whether the editor is in live-preview
mode. The field reference is stored module-level and read by `findPosV` to
gate frontmatter widget navigation (see below). When the field is not set or
the field value is `false`, frontmatter interception is skipped entirely.

This keeps the fork Obsidian-agnostic — it accepts a generic
`StateField<boolean>` without importing from `obsidian`. The host plugin
passes `editorLivePreviewField` (Obsidian's official API) during extension
creation.

### `setPropertiesSource` API

**Files**: `src/cm_adapter.ts`, `src/index.ts`

Added `setPropertiesSource(fn: () => boolean)` to configure a host-provided
callback that indicates whether frontmatter properties are rendered as source
text. The callback is stored module-level and called by `findPosV` on each
upward cursor movement near frontmatter. When the callback returns `true`,
the frontmatter interception block is skipped entirely — the cursor moves
through the raw frontmatter text as in source mode.

This addresses an edge case where the editor is in live-preview mode but the
host application renders frontmatter as plain text instead of a widget (e.g.
Obsidian's "Properties in document" setting set to "Source"). In this
configuration, the `.metadata-container` DOM element exists but is hidden
(`display: none`). Without this gate, `focusBefore` would focus the invisible
element and `moveByLines`/`moveByDisplayLines` would return the original
cursor position, leaving the cursor stuck.

The host plugin passes a callback that reads the relevant configuration at
call time, so runtime setting changes take effect immediately without
re-registering extensions.

### `setCursorSuppressed` API

**Files**: `src/block-cursor.ts`, `src/index.ts`

Added `setCursorSuppressed(suppressed: boolean)` to set the global default for
cursor suppression across all editors. When suppressed:

- `BlockCursorPlugin.drawSel()` clears cursor children and returns early.
- `BlockCursorPlugin.update()` hides the fork's cursor layer
  (`.cm-vimCursorLayer`), all standard CM6 cursor layers
  (`.cm-cursorLayer:not(.cm-vimCursorLayer)`), and sets
  `contentDOM.style.caretColor = "transparent"` — synchronously on every
  transaction to prevent flicker.
- When suppression is turned off, all three are restored.

#### Per-view overrides

Added `setCursorSuppressedForView(view: EditorView, suppressed: boolean)` and
`clearCursorSuppressedForView(view: EditorView)` for per-editor control. A
per-view override takes precedence over the global flag. When no per-view
override is set, the editor falls back to the global value.

The per-view override is automatically cleaned up in `BlockCursorPlugin.destroy()`.

Added `isCursorSuppressedForView(view: EditorView): boolean` to query the
effective suppression state for a specific view (per-view override if set,
otherwise global default). Used by the host plugin's animated cursor
controller to skip canvas drawing when per-view suppression is active.

Used by the Vim Motions plugin's animated cursor feature: the global flag
suppresses cursors in main editors (which render their own canvas cursor),
while textarea vim overlays and table cell editors use per-view overrides to
restore the native cursor. Table navigation mode uses per-view suppression to
hide all cursors (both native and canvas) while navigating cells.

### Properties navigation (focusBefore adapter)

**File**: `src/cm_adapter.ts`

The `findPosV` adapter detects when `moveVertically` lands the cursor inside
the YAML frontmatter region or when the cursor is stuck at the boundary of
the frontmatter properties widget. Two cases trigger `focusBefore`:

1. **Moved into frontmatter**: `moveVertically` lands the cursor on a line
   inside the `---` fences (`pos.line + 1 <= fmEnd`).
2. **Stuck at boundary**: `moveVertically` can't move up because the
   properties widget replaces the frontmatter lines, so the cursor stays on
   the first content line right after the closing `---`
   (`pos.line === start.line && start.line + 1 === fmEnd + 1`) **and** the
   cursor offset truly didn't change (`range.head === startOffset`). The
   offset check distinguishes "cursor moved to a higher display line within
   a wrapped line" (different offset, same doc line) from "cursor is truly
   stuck" (identical offset). Without this guard, `gk` on a long wrapped
   first content line would fire `focusBefore` immediately instead of
   navigating through the wrapped display lines first.

The entire frontmatter interception block is gated on two conditions:

1. The `_livePreviewField` state field (set via `setLivePreviewField`) must
   be present and `true`. When absent or `false` (source mode), the block is
   skipped and the cursor moves through raw frontmatter text normally.
2. The `_propertiesSourceFn` callback (set via `setPropertiesSource`) must
   be absent or return `false`. When it returns `true`, frontmatter is
   rendered as source text despite the editor being in live-preview mode —
   the block is skipped so the cursor moves through the raw text normally.

This two-level gate prevents the cursor from getting stuck below the
frontmatter both in source mode and in live-preview mode with source-rendered
properties (where the `.metadata-container` exists but is hidden).

In live-preview mode, a `focusBefore` callback is attached to the result
position. The callback queries the DOM for Obsidian's metadata container
(`.metadata-container`) and focuses the "Add property" button
(`.metadata-add-button`), falling back to the container element itself.
Both `k` (`moveByLines`) and `gk` (`moveByDisplayLines`) check for
`focusBefore` on the `findPosV` result.

### Frontmatter-aware `O` (open line above)

**File**: `src/vim.js`

`newLineAndEnterInsertMode` (the `O` command) has a special case for inserting a newline before the first line of the document. In Obsidian, when YAML frontmatter is present (`---\n…\n---`), the properties UI hides those lines but the CodeMirror document still contains them. The original check `insertAt.line === cm.firstLine()` was always false when frontmatter was present (cursor on line 3+, firstLine is 0), causing `O` to insert at the end of the previous line — which fell inside the frontmatter region.

The fix scans past `---`-delimited frontmatter to find the first editable line and uses `insertAt.line <= firstEditable` as the boundary check. The insertion point uses `{ line: insertAt.line, ch: 0 }` instead of hardcoded `cm.firstLine()`. Documents without frontmatter are unaffected.

### Widget-aware vertical navigation

**File**: `src/cm_adapter.ts`

The `findPosV` adapter applies three corrections to CM6's `moveVertically`:

1. **Multi-line jump clamp** (`lineJump > 1`): When `moveVertically` jumps
   more than one document line and no fold exists in the skipped range, the
   cursor is clamped to the adjacent document line (±1). CM6's
   `moveVertically` is coordinate/pixel-based — variable-height content
   (replaced widgets like MathJax, headings with larger fonts) can cause a
   single step to jump multiple document lines. The clamp ensures `gk`/`gj`
   never skip doc lines unless content is folded/hidden. Character offset
   from the previous line is preserved on the clamped target.

2. **Tall non-wrapped line detection** (`lineJump === 0`, same doc line):
   Headings with large `font-size` and/or `line-height` produce line blocks
   taller than `defaultLineHeight`. `moveVertically` takes multiple pixel
   steps through the block, producing spurious within-line cursor moves even
   though the text does not wrap. The fix uses `coordsAtPos` to measure the
   Y-coordinate delta between the previous and new cursor positions. When
   the delta is less than half `defaultLineHeight`, the move is spurious and
   the cursor is force-moved to the adjacent document line. Legitimate
   wrapped-line navigation (where the Y delta exceeds the threshold) is
   unaffected.

3. **Column 0 fallback** (`lineJump === 1`, cursor at line start): When
   `moveVertically` correctly crosses one line but drops the cursor at
   column 0 despite a non-zero goalColumn, `posAtCoords` resolves the
   correct character position from the pixel X coordinate. The
   `goalColumn > 0` guard was relaxed to `goalColumn != null` so this fixup
   also fires at column 0.

Folded ranges are excluded from the multi-line clamp via `foldedRanges()` —
folds legitimately collapse multiple document lines into a single visual
line.

### Per-mode cursor shapes

**File**: `src/block-cursor.ts`

The block cursor plugin supports configurable cursor shapes per Vim mode:
block, bar, underline, or hollow. Shape configuration is stored on
`cm.state.vim.cursorShapes` and resolved per-mode in `resolveShape()`.
The `DrawSelectionConfig` width adapts dynamically to the resolved shape.
Defaults match Neovim's `guicursor`: block for normal/visual, bar for
insert, underline for replace/operator-pending.

### Cursor color CSS variables

**File**: `src/block-cursor.ts`

Replaced hardcoded `#ff9696` cursor color with CSS variables:
`var(--interactive-accent, #ff9696)` for background and
`var(--text-on-accent, inherit)` for text. Obsidian themes apply
automatically; non-Obsidian consumers get the original fallback colors.

The cursor text color is read from the `--text-on-accent` CSS variable
on the editor element in `measureCursor()`, overriding the syntax-
highlighted color. This ensures the character under the block cursor is
always visible regardless of the underlying syntax color (e.g. blue
headers on a purple accent in light mode). Non-Obsidian environments
fall back to the syntax color.

### Visual mode cursor positioning at EOL

**Files**: `src/block-cursor.ts`, `src/vim.js`

`measureCursor()` adjusts the cursor position backward by 1 in forward visual
selections (`anchor < head`) to render the cursor on the last selected
character. The original `letter != "\n"` guard (commit `8e8ea52`, empty-line
fix) prevented the adjustment at EOL on non-empty lines, causing the block
cursor to render past the visible line content in charwise visual mode.
The fix uses the vim state to scope the EOL decrement: linewise visual
skips the adjustment (cursor-only CM6 selection manages positioning
independently), while charwise and blockwise visual both apply the
step-back to render the cursor on the last visible character. The
blockwise exception was originally added (commit `b68fdd9`) when
`makeCmSelection` did not clamp `toCh` per-line, so the head never
landed on `"\n"`. After the per-line clamping fix (see "Block visual EOL
cursor clamping" below), `head` legitimately lands on newline positions
in block mode, requiring the same step-back as charwise.

The `letter != "\n"` comparison also used loose equality (`!=`), which caused
incorrect branch selection when `head >= doc.length`: the short-circuit
produced `false`, and `false != "\n"` evaluated to `false` due to JS type
coercion (both coerce to `0`). Fixed by producing `""` instead of `false`
and using strict inequality (`!==`).

`exitVisualMode()` in `src/vim.js` called `clipCursorToContent()` while
`vim.visualMode` was still `true`. In visual mode, `clipCursorToContent`
allows `ch = text.length` (the linebreak position). After clearing
`vim.visualMode` on the next line, the cursor was already set one position
past the last character — visible as a displaced cursor after pressing
Escape at end-of-line. Fixed by clearing the visual flags before calling
`setCursor`, while preserving the `updateLastSelection` call order (which
reads the flags to save the last selection type).

### clipboard=unnamed / clipboard=unnamedplus

**File**: `src/vim.js` — `RegisterController.pushText`, `actions.paste`

When the `clipboard` option is set to `unnamed` or `unnamedplus`, all
yank/delete/change operations to the unnamed register now also write to
`navigator.clipboard`. The paste action reads from `navigator.clipboard`
instead of the internal register when no explicit register is specified and
the option is set. Explicit `"+y` and `"*y` also sync to the system
clipboard (the `*` register is now treated equivalently to `+`).

## Behavioral fixes (Neovim parity)

All changes below match verified Neovim behavior. Fork test expectations
updated accordingly.

### Unmatched angle-bracket keys consumed in normal mode

**File**: `src/vim.js` — `findKey`

When a multi-key sequence fails to match any command (e.g. pressing an
unmapped key after `<leader><leader>`), `findKey` returns a no-op handler
for single-character keys so they are consumed without inserting text. The
guard `key.length === 1` failed for keys in the `specialKey` map —
`vimKeyFromEvent` converts Space to `"<Space>"` (7 characters), which
bypassed the guard and returned `undefined`. CM6 then treated the key as
unhandled and inserted it as text.

Fixed by replacing `key.length === 1 || (CM.isMac && /<A-.>/.test(key))`
with `key.length === 1 || /^<.+>$/.test(key)`, which matches both plain
characters and all angle-bracket notation keys (`<Space>`, `<BS>`, `<CR>`,
`<A-x>`, etc.). The Mac-specific `<A-.>` case is subsumed by the general
pattern.

### Linewise delete cursor column preservation

**File**: `src/vim.js` — `operators.delete`, `applyOperator`

`dd`/`dj`/`dk` now preserve the cursor column (clamped to remaining line
length) instead of moving to first non-blank. `operatorArgs.cursorCol` is
piped from the original cursor position through `applyOperator`.

### J join trailing whitespace

**File**: `src/vim.js` — `actions.joinLines`

`J` now strips trailing whitespace from the current line before adding the
join space, preventing double spaces when the line ends with whitespace.

### Multiline inner bracket text objects

**File**: `src/vim.js` — text object motion handler

`di{`/`di[`/`di<` on multiline brackets now preserves the bracket lines
(producing `a{\n}b` instead of `a{}b`). When brackets span 3+ lines, the
range is set linewise covering only the inner content lines.

### j/k at document boundary

**File**: `src/vim.js` — `motions.moveByLines`

`j` at the last line and `k` at the first line now return `null` instead of
moving to end/start of line. This makes `dj` on a single-line document a
no-op, matching Neovim.

### Substitute cursor positioning

**File**: `src/vim.js` — `doReplace.stop`

Cursor after `:s` now goes to the first non-blank character of the last
affected line instead of column 0.

### % string-aware bracket matching

**File**: `src/vim.js` — `motions.moveToMatchedSymbol`

When `%` forward-seeks for a bracket and the first candidate is inside a
string token, the motion aborts (cursor stays). Brackets in comments are
still skipped (existing behavior).

### Cross-line delete whitespace inclusion

**File**: `src/vim.js` — `applyOperator`

When a delete operation (`db`, `d2w`, etc.) crosses a line boundary and the
prefix before `curStart` on the starting line is whitespace-only, the delete
range is expanded to include that whitespace. Applied after `clipToLine` to
avoid interfering with same-line operations.

### ge/moveByWords at document boundary

**File**: `src/vim.js` — `motions.moveByWords`

Backward word motions (`ge`, `b`) that don't move backward return `null`,
preventing `dge` at document start from deleting the character under cursor.

### dge on empty lines

**File**: `src/vim.js` — `applyOperator`

Inclusive operator selections at end-of-line on empty lines now extend to
the next line start, allowing `dge` on `"\n\n"` to delete both lines.

### dG trailing newline

**File**: `src/vim.js` — `operators.delete`

The anchor is expanded to include the preceding newline when deleting
linewise to end of file from a non-first line.

### ]p tab remainder

**File**: `src/vim.js` — `actions.continuePaste`

`]p` with `indentWithTabs` now preserves remainder spaces when the computed
indent doesn't divide evenly by tabSize.

### Octal increment disabled by default

**File**: `src/vim.js` — `actions.incrementNumberToken`

Numbers with leading zeros (e.g. `007`) are now incremented as decimal
(007 → 008) instead of octal (007 → 010), matching Neovim's default
`nrformats` setting which does not include `octal`.

### Empty :s uses default flags

**File**: `src/vim.js` — `exCommands.substitute`

`:s` with no arguments reuses the last search pattern and replacement but
resets flags to defaults (no `/g`). Only the first match on the line is
replaced, matching Neovim's behavior. The `/g` flag is only preserved when
explicitly provided in a new `:s/pattern/replace/g` command.

### `da"` whitespace consumption

**File**: `src/vim.js` — `findBeginningAndEnd`

`a"` (and `a'`, `` a` ``) text objects now consume adjacent whitespace
when used with operators (`da"`, `ca"`, etc.), matching Neovim. After
the inclusive quote expansion, trailing whitespace is consumed first;
if no trailing whitespace exists, leading whitespace is consumed instead.

### `:join` cursor positioning

**File**: `src/vim.js` — `exCommands.join`

`:join` ex command now positions cursor at column 0 of the join line
after joining, matching Neovim.

### `:global` cursor positioning

**File**: `src/vim.js` — `exCommands.global`

`:g/pattern/d` (and other line-deleting `:g` commands) now positions
cursor at the last matched line number (clamped to document end) after
execution, matching Neovim. Non-destructive `:g` commands leave cursor
where the last sub-command placed it.

### dw on empty line cursor

**File**: `src/vim.js` — `operators.delete`

After `dw` deletes only a newline and the resulting line is whitespace-only
with length ≥ 2, cursor is placed at `ch:1` instead of `ch:0`.

### Sentence motion at end of document

**File**: `src/vim.js` — `findSentence` → `forward()`

`)` at the end of the last sentence no longer moves the cursor backward.
When the forward scan reaches the end of the document and the computed
fallback position is at or before the starting cursor on the same line,
the original position is returned unchanged.

### Idle key deprioritization for multi-key sequences

**File**: `src/vim.js` — `commandDispatcher.matchCommand`

`matchCommand` now returns `partial` instead of `full` when the only full
match is an `idle` type entry and more-specific partial matches exist.
The default keymap marks `<C-w>` as `idle` in normal mode (no-op) to
prevent the insert-mode delete-word behavior from leaking. This blocked
multi-key `<C-w>X` commands registered via `mapCommand` (e.g.
`<C-w>v`, `<C-w>h`) because the idle full match consumed the prefix
before the second keystroke arrived. With this fix, `<C-w>` defers to
partial matches when sub-commands are registered, while still firing as
idle when no sub-commands exist (preventing browser-level interception).

### Other fixes

- `operators.indent`: Cursor at column 0 after `>>` / `<<` (was first non-blank)
- `onChange`: Accept CM6-style input origins (`"input.type"`) for insert recording
- `findNext`: Skip current match during wrap-around after incremental search
- Golden recorder `escapeKeysForNeovim`: Convert literal `\n` to `<CR>` so ex commands execute
- Golden recorder: `redraw` after `setCursor` prevents stale Neovim state in recordings
- Golden recorder: `set columns=80 lines=24` viewport simulation for accurate display-line motion recording

### `:sort` cursor positioning

**File**: `src/vim.js` — `exCommands.sort`

After `:sort` (and ranged `:2,3sort`), the cursor is now positioned at the
first line of the sorted range via `cm.setCursor(new Pos(lineStart, 0))`.
Previously, the cursor stayed wherever CM6 left it after `replaceRange`,
which was typically line 0 regardless of the sort range.

### Block visual delete cursor clamping

**File**: `src/vim.js` — `operators.delete`

After a block visual delete (`CTRL-V` selection + `d`), the cursor column is
now clamped to the remaining line length. Previously, `cursorMin(head, anchor)`
preserved the original anchor column, which could equal or exceed the shortened
line length after deletion — e.g., `CTRL-V jj $ d` on `abc\nde\nfghij` from
`ch:1` left the cursor at `ch:1` on the resulting line `a` (length 1), one
position past the last character. The cursor is now clamped to
`Math.max(0, lineLen - 1)` when `finalHead.ch >= lineLen`.

### `scanForBracket` string and comment awareness

**File**: `src/cm_adapter.ts` — `scanForBracket()`

The `%` motion's fallback bracket scanner now calls `getTokenTypeAt()` for
each bracket candidate and skips any bracket inside a `"string"` or
`"comment"` token. Previously, `scanForBracket` did purely positional stack
counting — if a closing bracket appeared inside a string literal before the
actual match, `%` would jump to the wrong position. The forward-seek in
`moveToMatchedSymbol` (vim.js) already had string-awareness for the initial
bracket search; this extends the same protection to the matching phase.

Note: in Markdown mode, Lezer does not classify double-quoted text as string
tokens, so this fix primarily benefits languages with proper syntax trees
(JavaScript, TypeScript, etc.). The Markdown `%` deviation for quoted
brackets remains as a Lezer parser limitation.

### Indent operator respects `shiftwidth` and `expandtab`

**File**: `src/vim.js` — `operators.indent`

The `>>` / `<<` indent operator now reads the vim options `shiftwidth` and
`expandtab` (via `getOption()`) before falling back to CM6's `tabSize` and
`indentWithTabs` options. When a host plugin defines these vim options (e.g.
via `Vim.defineOption('shiftwidth', 4, 'number')` and `set shiftwidth=2` in
a vimrc), the indent operator uses them for both the visual-block path and
the line-by-line fallback path. When the options are not defined, the
operator falls back to the previous behavior using CM6's native settings.

The `cm.indentMore()` / `cm.indentLess()` CM6 API path is preserved as the
primary non-block path when available; the manual `replaceRange` fallback
uses the vim-aware indent string.

### Linewise visual cursor positioning

**Files**: `src/vim.js` — `makeCmSelection`, `src/index.ts` — `linewiseVisualHighlight`

`V` (linewise visual mode) now positions the cursor at column 0 of the head
line, matching Neovim. Previously, CM6's exclusive selection model required
setting `head.ch = lineLength(line)` to include the full line in the
selection range, which caused the cursor to appear at the end of the line.

The fix uses two mechanisms:

1. `makeCmSelection` in `'line'` mode now sets `head.ch = 0` when the
   `exclusive` parameter is falsy (the display path via `updateCmSelection`).
   When `exclusive` is truthy (the operator path), the old
   `head.ch = lineLength(...)` behavior is preserved so operators continue
   to receive correct full-line ranges.

2. A `ViewPlugin` (`linewiseVisualHighlight`) reads the vim visual state
   (`vim.visualMode && vim.visualLine`) and provides `Decoration.line`
   decorations with the `.cm-vim-linewise-selection` class for each line in
   the inclusive range `[min(anchor.line, head.line), max(...)]`. This
   provides the full-line visual highlight that the CM6 selection can no
   longer provide (since the selection head is now at `ch:0`).

Theme rules for `.cm-vim-linewise-selection` are included in `vimStyle`
(both light and dark variants).

## Surround operators (vim-surround)

**Files**: `src/vim.js`, `src/types.ts`

Native vim-surround support: `ds{target}`, `cs{target}{replacement}`,
`ys{motion}{replacement}`, `yss{replacement}`, visual `S{replacement}`,
tag surround (`dst`, `cst`, `ys<tag>`, `S<tag>`), function surround (`dsf`,
`csf`, `f`/`F` in replacement), newline variants (`cS`, `yS`, `ySS`, `gS`),
and count support (`2ds)`, `2cs)`).

Architecture: `s<character>` keymap entry with `operatorPending: true` fires
after `d`/`c`/`y` enters operator-pending mode. The pending operator is passed
through `actionArgs.pendingOperator` (added to `processAction`). Multi-step
flows (`cs` replacement char, `ys` post-motion replacement) use a
`vim.surroundState` interceptor at the top of `handleKeyNonInsertMode`.

For `ys{motion}`, the consumed motion character is stored in
`vim.surroundState` and re-dispatched via `vimApi.handleKey(cm, char, 'mapping')`
on the next keystroke. Single-char motions (`w`, `$`, `e`) resolve immediately;
multi-char motions (`iw`, `aw`) return partial and the physical key completes
the match.

### Multi-character input (`pendingInput` buffer)

Tags and function wrapping use a `pendingInput` buffer on `vim.surroundState`.
Trigger detection: `<` in replacement position starts tag collection, `f`/`F`
starts function name collection. The buffer collects keystrokes until an accept
key (`>` or `<CR>` for tags, `<CR>` for functions). `<Esc>` cancels, `<BS>`
deletes the last character. Visual feedback via `vim.status` shows `tag: <...`
or `func: ...` as the user types.

`startPendingInput` captures the current state fields via closure so `onAccept`
can dispatch the completed operation. `getSurroundPair` handles both string
and `SurroundReplacementSpec` objects (`{kind:'tag', value}` or
`{kind:'func', value, spaced}`) as the single integration point.

### Tag finding

`findSurroundingTag(cm, pos, count)` tries `CM.findEnclosingTag` (syntax tree)
first, then falls back to a regex scanner (`findOpenTagBackward`,
`findCloseTagForward`, `findEnclosingTagFallback`) ported from the plugin's
`src/text-objects/tag.ts`. The regex fallback handles modes without syntax tree
support (Markdown). Self-closing tags (`<br/>`) return null (no-op). Nested
same-name tags are handled via depth tracking.

### Newline variants

`S<character>` with `operatorPending: true` fires `surroundActionNewline` for
`cS`/`yS`/`ySS`. `gS<character>` in visual mode fires `surroundVisualNewline`.
The `newline` flag propagates through `surroundState` to `addSurroundToRange`
and `changeSurroundPair`, which insert delimiters on separate lines. Single-line
content is placed on its own line without additional indentation (matching
nvim-surround behavior). Multi-line content receives inner indentation one level
deeper than the base indentation.

### Count support

For bracket targets, count means "apply the operation N times," each iteration
operating on the innermost remaining pair. `2dsb` on `((foo) bar (baz))`
deletes twice: first the inner pair around the cursor, then the next inner pair.
`3csbr` on `(((foo)))` changes all three levels to brackets: `[[[foo]]]`. The
delete and change branches in `surroundAction` and `handleSurroundSubState`
loop `count` times with `findSurroundingPair(..., 1)` per iteration.

For quote-type (non-bracket) targets, count repeats the delimiter character:
`2ysiw*` → `**word**`, `2ds*` on `**word**` → `word`. `findSurroundingQuotes`
with count > 1 searches for N consecutive quote chars. `deleteSurroundPair` and
`changeSurroundPair` use a `width` field on the found pair to handle multi-char
delimiters. In `handleSurroundSubState`, `charRepeat` on the surround state
multiplies the replacement character before passing it to `getSurroundPair`.

The bracket/quote distinction uses `isBracketTarget` (checks
`surroundBrackets[normalizeSurroundTarget(target)]` or `customSurroundPairs`)
to choose between loop-count and char-repeat semantics.

This enables Markdown-specific pairs without custom key assignments:
`2ysiw*` (bold), `2ysiw~` (strikethrough), `2ysiw=` (highlight),
`2ysiw$` (math). Follows the `nvim-surround` convention.

### Insert mode surround (`<C-G>s` / `<C-G>S`)

`<C-G>s<character>` in insert mode inserts both the open and close delimiters
at once, placing the cursor between them. The user types between the delimiters.
On `Esc`, the standard `ch-1` cursor adjustment places the cursor on the last
typed character, matching vim-surround behavior. `<C-G>S<character>` does the
same with newlines and indentation.

Dot-repeat (`.`) replays the full surround + typed text. The surround character
is stored on `lastInsertModeChanges._surroundInsertChar` (with
`_surroundInsertNewline` for the `<C-G>S` variant). During replay,
`replaySurroundAwareInsert` (inside `repeatLastEdit`) strips the delimiter
entry from `changes[0]`, inserts `pair.open`, replays the typed text via
`repeatInsert`, then inserts `pair.close`. The replay is wrapped in
`cm.operation()` for undo atomicity. Counted dot-repeat (`2.`) repeats the
text inside one set of delimiters. This exceeds both vim-surround and
nvim-surround, where insert-mode surround dot-repeat is broken (delimiters
are lost because `getchar()` consumes the delimiter character outside the
redo-recording path; see [nvim-surround #301](https://github.com/kylechui/nvim-surround/issues/301)).

Surround metadata is cleared in three places to prevent cross-session leakage:
`recordLastEdit` (when a new editing session starts), `onCursorActivity` (when
the cursor moves unexpectedly during insert mode), and `createInsertModeChanges`
(default initialization). Text typed before `<C-G>s` in the same insert session
is not preserved in dot-repeat (cleared by `maybeReset`), matching the canonical
behavior of both vim-surround and nvim-surround.

Known limitation: macro recording of insert-mode surround keys is not supported
(pre-existing limitation of insert-mode macro key logging).

Insert mode partial match buffering was fixed to support this: when the key
buffer contains a non-char key (e.g. `<C-g>`), subsequent single-char keys
in a partial match return `true` (consumed) instead of `false` (fall through
to text insertion). This prevents `s` from being typed as text during the
`<C-g>s<character>` sequence. Existing `jj`/`jk` escape sequences are
unaffected (all-char buffers use the timeout path).

### Dot-repeat

Stores `_surroundReplacement` and `_surroundType` on `vim.lastEditInputState`
via an `onRepeat` callback. `_surroundType` tracks the operation kind (`'ys'`,
`'cs'`, `'yss'`, `'visual'`) to prevent cross-type leaking — a `cs` operation's
saved replacement is not used by a subsequent `ys` command (only by `cs`
dot-repeat). During replay, the action/operator detects the saved replacement
and executes directly without entering the sub-state. Visual `S` stores
selection dimensions in `_surroundSelOffset` for replay. `_surroundNewline`
preserves the newline flag across dot-repeat.

For `cs` dot-repeat on nested structures (e.g. `csba..` on `(((test)))`), the
search position is offset by `newPair.open.length` after each change so the next
iteration finds the inner pair rather than re-matching the already-changed
delimiter.

Visual `S` replaces the previous `S` → `VdO` keyToKey in visual mode. `S` in
visual mode now surrounds instead of substituting.

### Cursor positioning after add-surround

`addSurroundToRange` positions the cursor on the opening delimiter
(`from.ch`), matching vim-surround behavior. The `_surroundSelOffset`
used for dot-repeat adds `pair.open.length` to `chDelta` at recording
time to compensate — the replay computes `[cursor, cursor + chDelta]`
and the offset accounts for the cursor now being on the delimiter
rather than after it. This ensures `viw S]` on `test` produces
`[test]` with cursor on `[`; pressing `.` surrounds `[test]` (offset
includes the bracket width), yielding `[[test]]`.

The newline branch (`gS`, `yS`, `ySS`) is not affected — it replaces the
entire range in a single `replaceRange` call and the cursor lands on the
opening delimiter line, which is correct for multi-line output where the
inner text starts on the next line.

### Opening bracket target semantics

`findSurroundingPair` now correctly passes the closing bracket character
as the `close` parameter and the opening bracket character as the `open`
parameter to `findSurroundingBrackets`, regardless of whether the user
typed the opening or closing form. Previously, when the target was an
opening bracket (e.g. `ds(`), the parameters were reversed — `close='('`
and `open=')'` — causing the backward search to look for `)` instead
of `(`, which always failed. `ds(`, `ds[`, `ds{`, `ds<`, `cs({`,
and multiline/nested `ds(` all now work correctly.

Supported targets: `"`, `'`, `` ` ``, `(`, `)`, `[`, `]`, `{`, `}`, `<`, `>`,
`t` (tag), `f` (function call — see below), aliases `b`→`)`, `B`→`}`, `r`→`]`,
`a`→`>`. Opening brackets add inner spaces; closing brackets don't. `<` in
replacement position triggers tag prompting (breaking change — use `>` for
no-space angle brackets). `f`/`F` in replacement position triggers function
wrapping.

### Symmetric surround quote matching

**File**: `src/vim.js` — `findSurroundingQuotes`

`findSurroundingQuotes` (used by `ds$`, `ds"`, `cs"`, etc.) now finds pairs
by expanding outward from the cursor: search backward for the nearest quote
character, then forward for the next one. This replaces the previous
sequential pairing algorithm that collected all quote positions and paired
them at even/odd indices (0→1, 2→3, etc.).

The old algorithm failed for doubled symmetric delimiters like `$$example$$`:
positions `[0, 1, 9, 10]` were paired as `(0,1)` and `(9,10)` — the two
adjacent `$$` on each side — leaving the cursor between them with no match.
`ds$` did nothing.

The cursor-expansion approach finds `(1, 9)` as the tightest enclosing pair,
so `ds$` correctly produces `$example$`. Adjacent non-nested pairs like
`"hello" "world"` continue to work — cursor in `hello` finds `(0, 6)`.

When the cursor is on the closing delimiter (e.g., ch=6 on `"hello"`), the
backward search lands on the cursor position itself and no closing quote
exists after it. A fallback path treats the found quote as the close and
searches backward from before it for the open, correctly returning `(0, 6)`.

### Space preservation for closing bracket targets

`deleteSurroundPair` accepts an optional `target` parameter indicating the
character the user typed. When the target is a closing bracket (`)`, `]`, `}`,
`>`), space-stripping is skipped — inner spaces are preserved. Opening bracket
targets (`(`, `[`, `{`, `<`) still strip adjacent spaces. This matches
nvim-surround semantics: `ds}` on `{ hello }` → ` hello ` (spaces kept),
`ds{` on `{ hello }` → `hello` (spaces stripped).

### Cursor clamping after delete

`deleteSurroundPair` clamps the cursor to `Math.min(open.ch, lineLen - 1)`
after deletion to prevent the cursor from landing past end-of-line when
delimiters are at the end of a line (e.g., `function()` → `function`, cursor
on the final `n` at ch:7 rather than ch:8).

### Linewise motion detection for `ys`

The surround operator branch in `evalInput` checks `motionArgs.linewise`. When
true (motions like `j`, `k`, `+`, `-`), the range is expanded to cover full
lines: `sFrom` is set to `(line, 0)` and `sMax` to `(line, lineLength)`. This
makes `ysjb` surround the current and next line, and `ys2jB` surround 3 lines.

### Linewise visual surround

`surroundVisual` detects `vim.visualLine` and expands the selection to full
lines before wrapping. Additionally, linewise visual surround uses newline mode
(`addSurroundToRange` with `newline: true`), placing delimiters on separate
lines matching nvim-surround's `VS` behavior.

### Visual block per-line surround

`surroundVisual` detects `vim.visualBlock` and wraps each line individually
from bottom to top (to preserve line numbers). `Ctrl-V jj $ S}` on ragged
lines produces `{line1}\n{line2}\n{line3}` instead of wrapping the entire
block as one unit.

### Delete surrounding function call (`dsf`)

`findSurroundingFunction(cm, pos)` scans the current line for `identifier(`
patterns using `/[\w$.]+\s*\(/g`, then uses `findSurroundingBrackets` to find
the matching `)` for each. Candidates are filtered to those whose range
contains the cursor position, and the innermost (rightmost `funcNameStart`) is
selected. `dsf` removes the function name through `(` and the closing `)`,
leaving the arguments. Handles nested calls, method chains (`obj.method()`),
and no-arg functions (`func()` → ``).

### Change surrounding function name (`csf`)

`csf` changes the function name around the cursor. Uses the same
`findSurroundingFunction` as `dsf` to locate the function. Triggers a
`pendingInput` prompt (`func: `) where the user types the new function name
and presses Enter. The name range from `funcNameStart` to `open` (the opening
paren) is replaced with the typed text. Escape cancels the operation. Empty
input is a no-op. Dot-repeat stores the function name string in
`_surroundReplacement` with `_surroundType: 'cs'` and re-calls
`findSurroundingFunction` at the new cursor position.

Single-line only (same limitation as `dsf` — `findSurroundingFunction` uses
`cm.getLine`).

### Custom surround pairs (`registerSurroundPair` / `unregisterSurroundPair`)

**File**: `src/vim.js`

Users can register custom single-character triggers that map to arbitrary
open/close delimiter strings (including multi-character). The public API:

- `Vim.registerSurroundPair(trigger, open, close)` — adds a pair to the
  `customSurroundPairs` Map. Throws if `trigger` is not a single character,
  if it is in `RESERVED_SURROUND_CHARS`, or if `open`/`close` are not strings.
- `Vim.unregisterSurroundPair(trigger)` — removes a custom pair.

Reserved characters (19 total): `( ) [ ] { } < > b B r a t T f F " ' \``.
These are rejected to prevent overriding built-in bracket, quote, alias, tag,
and function surround behavior.

Custom pairs integrate with all surround operations:

1. **`getSurroundPair(ch)`** checks `customSurroundPairs` after the
   tag/function object check but before `normalizeSurroundTarget` and the
   `surroundBrackets` lookup. Custom pairs take priority over the single-char
   quote fallback.

2. **`findSurroundingPair(cm, pos, target, count)`** checks
   `customSurroundPairs` before the built-in bracket/quote dispatch. When a
   custom pair is found, it delegates to `findSurroundingMultiChar`.

3. **`findSurroundingMultiChar(cm, pos, open, close, count)`** handles
   multi-character delimiter matching:
   - **Asymmetric pairs** (`open !== close`): depth-based scanning. Backward
     scan from cursor finds the opening delimiter at depth 0, forward scan
     finds the matching close. Nesting is tracked by incrementing depth on
     `open` occurrences and decrementing on `close`. Count > 1 iterates to
     find the Nth outer pair.
   - **Symmetric pairs** (`open === close`): same-line pair matching. All
      occurrences of the delimiter on the cursor line are collected and paired
      sequentially (0→1, 2→3, etc.). The pair containing the cursor is returned.
      Count > 1 builds a repeated needle (`open` × count) for matching
      count-prefix delimiters (e.g., `2ds` with `$$` → searches for `$$$$`).

   **Note**: `findSurroundingQuotes` (for built-in single-char symmetric
   delimiters like `$`, `"`, `'`, `` ` ``) uses cursor-expansion instead
   of sequential pairing — see "Symmetric surround quote matching" below.
   - Returns `{ open: Pos, close: Pos, openWidth, closeWidth }`. The `Pos`
     values point to the first character of each delimiter.

4. **`deleteSurroundPair`** and **`changeSurroundPair`** use
   `found.openWidth || found.width || 1` and
   `found.closeWidth || found.width || 1` for delimiter range computation.
   Space removal is gated to `openW === 1 && closeW === 1` (multi-char
   delimiters never trigger space removal).

5. **`isQuoteTarget`** in `surroundAction` excludes custom pairs:
   `!surroundBrackets[...] && !customSurroundPairs.has(target)`. This prevents
   custom pairs from being treated as quote-type targets (which would apply
   `charRepeat` count semantics instead of bracket-style outer pair semantics).

Test coverage: 11 tests in `test/vim_test.js` covering ys/ds/cs with asymmetric
and symmetric custom pairs, reserved char rejection, unregister fallback,
nested asymmetric, visual S, and built-in unaffected.

### Block visual insert (`I`/`A`), change (`c`/`C`)

**File**: `src/vim.js`

Block visual mode (`CTRL-V`) `I` and `A` now enter insert mode with correctly
positioned multi-cursors on every selected line. Six changes were required:

1. **`enterInsertMode` preserves `wasInVisualBlock`**: Before calling
   `exitVisualMode` (which clears `vim.visualBlock`), `enterInsertMode` now
   sets `vim.wasInVisualBlock = true` when exiting from block visual. This
   preserves the block context for `multiSelectHandleKey`, which routes
   subsequent keys through `vimApi.handleKey` (single dispatch) instead of
   `forEachSelection` (per-cursor dispatch) — allowing CM6's native
   multi-selection text input to operate on all cursors simultaneously.

2. **`selectForInsert` skips short lines**: When the block column exceeds a
   line's length, that line is excluded from the multi-cursor set instead of
   clipping the cursor to the line end. This matches Neovim's behavior — short
   lines are left unchanged by block insert. Previously, all lines received a
   cursor regardless of length, causing text to be inserted at the wrong column.

3. **`operators.change` block visual path**: The `change` operator now detects
   `vim.visualBlock` and uses `cm.replaceSelections()` to delete the block
   selection before entering insert mode at the block's left column. This
   handles both `c` (change block) and `C` (change to EOL), since
   `applyOperator` already extends each range's head to EOL when `linewise` is
   true in block mode (lines 2465–2468).

4. **`exitInsertMode` block cursor positioning**: When `vim.blockInsertLeft` is
   set (by `enterInsertMode` for both `I` and `A`), `exitInsertMode` positions
   the cursor at the block's original left column instead of the standard
   `ch - 1`. This fixes `A` cursor placement — Neovim places the cursor at the
   block's left edge after exiting block append, not at the insert position
   minus one.

5. **`makeCmSelection` zero-width block fix**: Changed `fromCh < toCh` to
   `fromCh <= toCh` in the block mode path. When `fromCh === toCh` (zero-width
   block created by `<C-v>jj` without horizontal motion), the old code executed
   `fromCh += 1`, creating a backwards range `[col+1, col]` that excluded the
   character at the cursor. The fix treats the equal case the same as
   less-than: `toCh += 1`, creating a correct forward range `[col, col+1)`.
   This fixes `C` on zero-width blocks.

6. **`repeatInsertModeChanges` block cursor**: The final cursor position after
   block insert dot-repeat now uses `blockInsertLeft` (stored on
   `lastInsertModeChanges` by `recordLastEdit`) instead of a hardcoded
   `offsetCursor(head, 0, 1)`. This ensures dot-repeat places the cursor at
   the block's left column, matching Neovim.

Text typed after `I`/`A` appears on all lines in real-time via CM6's native
multi-selection, unlike Neovim where text is only visible on the primary cursor
until `<Esc>`. Dot-repeat (`.`) works via the existing `repeatInsertModeChanges`
block-replay logic.

### Block visual A pads short lines

**File**: `src/vim.js` — `selectForInsert`

`selectForInsert` previously skipped lines shorter than the block column.
Neovim pads short lines with spaces to reach the block's right edge before
appending. The function now accepts a `padShortLines` parameter. When true
(passed only for the `A` / `endOfSelectedArea` path), short lines are padded
with spaces via `cm.replaceRange` before the multi-cursor is placed. The `I`
path passes false, preserving the skip behavior (matching Neovim, which also
skips short lines for `I`).

### Visual replace charwise off-by-one

**File**: `src/vim.js` — `actions.replace`

The charwise visual branch of the `replace` action set `curEnd = selEnd`
(the inclusive head position). Since `cm.getRange(from, to)` treats `to`
as exclusive, this replaced one fewer character than the visual selection
covered. Fixed by using `new Pos(selEnd.line, selEnd.ch + 1)` for
`curEnd`, matching the inclusive-to-exclusive conversion used elsewhere
(e.g. `makeCmSelection` char mode).

### Block visual EOL cursor clamping

**File**: `src/vim.js` — `makeCmSelection`

The block mode branch of `makeCmSelection` now clamps `toCh` and `fromCh`
per-line to each line's actual length via `lineLength(cm, top + i)`. Previously,
when `$` (end-of-line) was pressed in visual block mode, the motion returned
`Infinity` for `ch`. `selectBlock` clipped this via `cm.clipPos()` to the line
length, and then `makeCmSelection` added `+1` to `toCh` for inclusive selection
— pushing the cursor one position past the last character on each line.

The `$` motion's intentional `Infinity` return (line 2359) is preserved — it
enables ragged-right block selections where each line extends to its own EOL.
The clamping only happens at the selection-building stage in `makeCmSelection`,
not at the motion return path.

Edge cases handled:
- Empty lines (length 0): both `fromCh` and `toCh` clamp to 0, producing a
  zero-width range
- Single-character lines: `toCh` clamps to 1 (line length), which is the
  valid end-of-selection boundary
- Lines shorter than the block column: `fromCh` clamps to `lineLen`, producing
  a zero-width range at the line end

## Visual-line cursor-only CM6 selection

**Files**: `src/vim.js`, `src/index.ts`, `src/block-cursor.ts`

In visual-line mode (`V`), the CM6 `EditorSelection` is set to a cursor-only
position at `sel.head` instead of a spanning range across the selected lines.
This prevents editors with Live Preview (like Obsidian) from uncollapsing
hidden markup (`Decoration.replace` ranges) when the selection overlaps them.

The visual highlight is provided independently by the `linewiseVisualHighlight`
ViewPlugin, which reads `vim.sel` directly and applies `Decoration.line()`
decorations to each line in the selection range. Operators (`y`, `d`, `c`)
recompute their own CM6 selection from `vim.sel` at dispatch time via
`makeCmSelection(cm, sel, 'line', exclusive=true)` — they do not depend on
the "display" selection.

### Changes

- `updateCmSelection` (`vim.js`): when `vim.visualLine` is true, calls
  `cm.setCursor(sel.head.line, 0)` instead of
  `cm.setSelections(makeCmSelection(...).ranges)`. Column 0 is used
  (matching Neovim) to avoid landing inside widget decorations
  (checkboxes, collapsed links) on the head line.
- `joinLines` action (`vim.js`): reads `vim.sel.anchor`/`vim.sel.head` via
  `copyCursor()` instead of `cm.getCursor('anchor')`/`cm.getCursor('head')`
  in visual mode, since the CM6 selection is now cursor-only.
- `replace` action (`vim.js`): reads from `vim.sel` instead of
  `cm.getCursor('start'/'end')` in visual mode, with line boundary expansion
  (`Pos(line, 0)` to `Pos(line, lineLength)`) for visual-line.
- `updateClass` (`index.ts`): adds/removes `.cm-vimVisualLine` class on
  `scrollDOM` when `vim.visualMode && vim.visualLine` changes.
- `themeSpec` (`block-cursor.ts`): the `::selection` transparency rule now
  covers `.cm-vimMode.cm-vimVisualLine .cm-line` in addition to
  `.cm-vimMode:not(.cm-vimVisual) .cm-line`.
- Ctrl+C handler (`index.ts`): when `vim.visualLine` is true and
  `somethingSelected()` returns false, computes linewise text from `vim.sel`
  and copies to clipboard via `navigator.clipboard.writeText()`.
- Async motion callback (`vim.js`): the `.then()` handler for async motions
  (EasyMotion) in visual mode now wraps `updateCmSelection(cm)` in
  `cm.operation()` with `isVimOp = true`. Without this, the cursor-only
  selection dispatch triggers `handleExternalSelection`, which sees
  `visualMode && !somethingSelected()` and exits visual mode.

- Unhandled key passthrough (`index.ts`): when `handleKey` returns false
  (vim didn't handle the key) and the editor is in visual-line mode, the
  CM6 selection is temporarily expanded to the full linewise range before
  the event propagates to Obsidian. A `Promise.resolve().then()` microtask
  restores cursor-only selection after Obsidian's command executes. This
  ensures Obsidian commands (Tab/indent, formatting toggles) operate on
  all selected lines.

### Trade-offs

- `cm.somethingSelected()` returns `false` in visual-line mode
- `cm.getSelection()` returns `""` in visual-line mode
- Third-party code that reads CM6 selection state during visual-line will not
  see the selection; the canonical API is `window.CodeMirrorAdapter.Vim`

## Type changes

**File**: `src/types.ts`

- `OperatorArgs`: Added `cursorCol?: number`, `surroundNewline?: boolean`, `surroundCharRepeat?: number`
- `InputStateInterface`: Added `_surroundReplacement`, `_surroundSelOffset`, `_surroundNewline`
- `SurroundReplacementSpec`: Union type for tag and function specs
- `vimState`: Added `_commandGeneration: number`, `blockInsertLeft?: number`
- `surroundState`: Added `tagResult`, `from`, `to`, `newline`, `count`, `charRepeat`, `pendingInput`
- `allCommands`: Added `_isDefault?: boolean`
- `moveByLines` return: `Pos | null`
- `moveByWords` return: `Pos | null | undefined`
- `InsertModeChanges`: Added `blockInsertLeft?: number`
- `MotionFn` return: Widened to include `Promise` variants

## Select mode (gh/gH/g<C-h>)

**Files**: `src/vim.js`, `src/index.ts`, `src/types.ts`

Added Vim select mode — a mode where typing replaces the selection and enters insert mode. Entry via `gh` (charwise), `gH` (linewise), `g<C-h>` (blockwise). `<C-g>` toggles between visual and select mode. `<BS>` deletes the selection. `<Esc>` exits to normal mode.

Vim state: `selectMode` flag on `vimState`, cleared in `exitVisualMode`. Mode change event: `{mode: "select", subMode: ""|"linewise"|"blockwise"}`. Select mode saved/restored by `updateLastSelection`/`reselectLastSelection` for `gv`.

Key dispatch: `handleKeyNonInsertMode` checks for select-mode-specific mappings (`:smap`) before the printable char intercept. If no `:smap` mapping exists, printable chars replace the selection via `exitVisualMode` + `replaceRange` + `enterInsertMode`.

Context: `commandMatches` uses `'select'` context when `vim.selectMode` is true, with automatic fallback to `'visual'` context when no select-specific mapping matches.

CSS class: `.cm-vimSelect` toggled on `scrollDOM` in `updateClass()`.

## Virtual Replace mode (gR)

**Files**: `src/vim.js`, `src/cm_adapter.ts`, `src/index.ts`, `src/types.ts`

Added virtual replace mode — replace mode that operates on screen columns instead of byte positions. Entry via `gR`. Mode change event: `{mode: "vreplace"}`.

Replace stack (`vim.replaceStack`) tracks original characters for `<BS>` restore. Adapter methods `virtualReplaceChar(key, vim, tabstop)` and `virtualReplaceBackspace(vim, tabstop)` handle virtual column math with TAB-aware width calculations. Private helpers `_computeVCol` and `_charVColWidth` on the adapter.

`<Insert>` key toggles between virtual replace and insert mode, preserving the `virtualReplace` flag across toggles.

## Replace mode replace stack

**File**: `src/vim.js`

Extended the replace stack (previously only for `gR`) to regular `R` mode. `handleReplaceModeInput` pushes original characters to `vim.replaceStack` before overwriting. `<BS>` pops from the stack and restores the original character, matching Neovim's `R` mode behavior.

## Unified replace mode character handling

**Files**: `src/vim.js`, `src/cm_adapter.ts`, `src/index.ts`

Moved replace/vreplace character I/O from `index.ts` (DOM-only path) into `vim.js` (`handleReplaceModeInput` function). Called from `handleKeyInsertMode` in the `match.type == 'none'` branch when `cm.state.overwrite` is true. This ensures `Vim.handleKey` is authoritative for all replace-mode operations — programmatic dispatch, macro replay, and tests work correctly.

The `index.ts` overwrite block (previously lines 335-404) and helper functions (`computeVCol`, `charVColWidth`) were removed.

## Ctrl-O mode return fix

**File**: `src/vim.js`

`oneNormalCommand` (`<C-o>` in insert mode) now returns to the correct mode (insert, replace, or virtual replace) instead of always returning to insert. Uses `vim._suppressModeSignal` to prevent a spurious `{mode:"normal"}` event from `exitInsertMode`, then emits `{mode:"normal", subMode:"ctrl-o"|"ctrl-o-replace"|"ctrl-o-vreplace"}`.

`vim.insertModeReturnArgs` stores the mode to return to (`{replace: true}` or `{replace: true, virtualReplace: true}`).

## Select mode mapping commands

**Files**: `src/vim.js`

Added `:smap`, `:snoremap`, `:sunmap`, `:smapclear` ex commands for select-mode-specific mappings. Added `selectmode` and `keymodel` vim options via `defineOption`. `selectmode=cmd` makes `v`/`V`/`<C-v>` enter select mode instead of visual. `gV` command prevents select mode reselection after mapping fallback.

## Type changes (additions)

**File**: `src/types.ts`

- `vimState`: Added `selectMode`, `virtualReplace`, `replaceStack`, `_preventReselect`, `_suppressModeSignal`, `insertModeReturnArgs`
- `lastSelection`: Added `selectMode`

## TextYankPost signal (`vim-yank`)

**File**: `src/vim.js`

Added `CodeMirror.signal(cm, 'vim-yank', payload)` emission in three operators: `yank`, `delete`, and `change`. The signal fires after text is stored in the register, before any UI feedback (confirmation message or mode transition).

Payload:
- `operator`: `'y'` (yank), `'d'` (delete), or `'c'` (change)
- `regName`: register name or `''` for unnamed
- `regContents`: the yanked/deleted text
- `regType`: `'V'` (linewise), `'v'` (charwise), or `'\x16'` (blockwise)
- `visual`: `true` if the operation was from visual mode

This enables the Obsidian plugin to implement Neovim-compatible `TextYankPost` autocommands for yank highlighting and clipboard integration.

## Surround `ys` with text object motions (`ys_motion` direct evaluation)

**Files**: `src/vim.js`, `src/types.ts`

The `ys_motion` handler in `handleSurroundSubState` now directly evaluates text object motions (`a`/`i` prefix) instead of dispatching the motion character through `handleKey` and relying on the outer key handler to complete the text object.

**Problem**: For two-character text objects like `aB`, `iw`, `a"`, the `ys_motion` handler dispatched the first character (e.g., `a`) via `vimApi.handleKey(cm, motionChar, 'mapping')`. This created a partial keyBuffer match. The handler then returned `false`, expecting the outer `findKey` to process the second character (`B`) through the normal keyBuffer → `matchCommand` → `processMotion` → `evalInput` flow. However, `evalInput` calls `clearInputState` at line 2424 before the motion executes. Although `clearInputState` runs after `selectedCharacter` was captured in `motionArgs` at line 2414-2417, instrumentation revealed `selectedCharacter` was `null` at `evalInput` entry — indicating the `inputState` object read at line 2384 (`var inputState = vim.inputState`) was already a fresh one from a prior `clearInputState`, not the one `matchCommand` set `selectedCharacter` on.

**Fix**: When the `ys_motion` target is `a` or `i` (text object prefix), the handler directly calls `motions.textObjectManipulation(cm, head, { selectedCharacter, textObjectInner }, vim)` to get the motion result, then constructs the `ys_replacement` surround state inline — bypassing `evalInput` entirely. Single-character motions (like `w`, `$`, `j`) and count-prefixed motions (like `2j`) continue through the original `handleKey` dispatch path.

**Type change**: Added `operatorArgs?: Record<string, unknown>` to the `surroundState` type in `types.ts`. All `ys_motion` creation sites now include `operatorArgs` to preserve surround-specific operator args through the handler.

## Async motion dot-repeat (`_asyncMotionTarget`)

**Files**: `src/vim.js`

When an operator-pending async motion (e.g., `d` + EasyMotion target) resolves, the resolved position is now stored as a relative offset in `lastEditInputState._asyncMotionTarget`. During dot-repeat (`.`), `repeatLastEdit` detects this stored target and applies the operator with the relative offset instead of re-executing the async motion (which would re-show the EasyMotion overlay).

**Implementation**:
- After `applyOperator` in the async `.then()` callback, store `{ lineDelta, chDelta }` on `lastEditInputState`
- In `repeatLastEdit`'s `repeatCommand()`, check for `_asyncMotionTarget` on `inputState`. When present, compute the target position from the current cursor plus the delta and apply the operator directly
- Non-async motions and non-operator-pending async motions (cursor-only) are unaffected

## Surround `ys` dot-repeat with text object motions (`_ysTextObjectMotion`)

**Files**: `src/vim.js`, `src/types.ts`

`ysiwb` (surround inner word with parentheses) then `.` on a different word now correctly replays the surround operation. Previously, dot-repeat failed because the text object motion characters (`i`, `w`) were not stored in `lastEditInputState` — only the replacement character was captured via `_surroundReplacement`.

**Implementation**:
- In the `ys_motion` handler's `onRepeat` callback, store `_ysTextObjectMotion` (the prefix: `'i'` or `'a'`) and `_ysTextObjectChar` (the object: `'w'`, `'B'`, `'"'`, etc.) alongside `_surroundReplacement` and `_surroundType`
- In `repeatLastEdit`'s `repeatCommand()`, when `_ysTextObjectMotion` is present with `_surroundType === 'ys'`, re-evaluate the text object at the current cursor position via `motions.textObjectManipulation()` and apply the surround with `addSurroundToRange()`
- Simple delimiters (`ysiwb`, `ysiw"`, `ysaw'`) work for dot-repeat. Tag (`ysiw<em>`) and function (`ysiwflen`) dot-repeat requires additional `pendingInput` prompt replay which is not yet implemented.

**Type change**: Added `_asyncMotionTarget`, `_ysTextObjectMotion`, `_ysTextObjectChar` to `InputStateInterface` in `src/types.ts`.

## Operator-prefix shadow resolver (`operatorshadowtimeout`)

**Files**: `src/vim.js`, `src/types.ts`

When an operator is pending (`c`/`d`/`y`/etc.) and the next keystroke fully matches a motion but also partially matches an `operatorPending` action (e.g., surround's `s<character>`), the resolver defers to the partial match — waiting for the next character to disambiguate. A configurable timeout (`operatorshadowtimeout`, default 1000ms) falls back to executing the deferred motion if no next key arrives. Set to `0` to disable (immediate motion execution, upstream behavior).

This resolves conflicts between motion mappings registered by plugins (e.g., flash jump's `s`) and the built-in surround `s<character>` action in operator-pending mode. In upstream codemirror-vim, a full match always beats a partial match, so `c` + `s` would execute the motion instead of waiting for the surround target character.

**Implementation**:
- `matchCommand()`: after the existing `idle` deferral block, a new check defers full motion matches when `inputState.operator` is set and `operatorPending` action partials exist. The deferred motion is stored on the return value as `_deferredMotion`.
- `handleKeyNonInsertMode()`: when a partial match carries `_deferredMotion`, a `window.setTimeout` is started. On timeout, the deferred motion is dispatched via `processCommand()`. The timer is cleared when any subsequent key arrives.
- `clearInputState()` and the vim teardown handler: clear the shadow timer to prevent stale execution after Escape or editor destruction.
- New option: `defineOption('operatorshadowtimeout', 1000, 'number', ['ost'])`

**Type change**: Added `_shadowTimer` to `vimState` in `src/types.ts`.

**Upstream difference**: Upstream codemirror-vim has no timeout-based key disambiguation. Operators enter pending mode immediately and the next key is always resolved as a motion. This fork adds Neovim-style operator-prefix disambiguation, scoped to operator-pending mode only (non-operator prefixes like `g`/`z`/`<C-w>` are unaffected).

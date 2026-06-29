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

In both cases, a `focusBefore` callback is attached to the result position.
The callback queries the DOM for Obsidian's metadata container
(`.metadata-container`) and focuses the "Add property" button
(`.metadata-add-button`), implementing the same `focusBefore` protocol that
Obsidian's built-in vim mode uses. Both `k` (`moveByLines`) and `gk`
(`moveByDisplayLines`) check for `focusBefore` on the `findPosV` result.

### Frontmatter-aware `O` (open line above)

**File**: `src/vim.js`

`newLineAndEnterInsertMode` (the `O` command) has a special case for inserting a newline before the first line of the document. In Obsidian, when YAML frontmatter is present (`---\n…\n---`), the properties UI hides those lines but the CodeMirror document still contains them. The original check `insertAt.line === cm.firstLine()` was always false when frontmatter was present (cursor on line 3+, firstLine is 0), causing `O` to insert at the end of the previous line — which fell inside the frontmatter region.

The fix scans past `---`-delimited frontmatter to find the first editable line and uses `insertAt.line <= firstEditable` as the boundary check. The insertion point uses `{ line: insertAt.line, ch: 0 }` instead of hardcoded `cm.firstLine()`. Documents without frontmatter are unaffected.

### Widget-aware vertical navigation

**File**: `src/cm_adapter.ts`

The `findPosV` adapter detects when `moveVertically` jumps over multiple
document lines in a single visual-line step. When the skipped range contains
a replaced widget decoration (checked via `_rangeHasReplacedWidget`, which
scans `EditorView.decorations` for point decorations with `dec.point === true`),
the cursor is placed on the adjacent document line (N+1 going down, N−1 going
up) instead of at the widget boundary, allowing step-by-step navigation through
the widget's source text (e.g. rendered MathJax `$$` blocks in Obsidian's live
preview).

Folded ranges are excluded via `foldedRanges()` since folds legitimately
collapse multiple lines. Tall-but-unreplaced lines (e.g. headings with larger
font sizes) are also excluded — they span multiple visual lines due to CSS
styling, not replaced content. Mark and line decorations (`dec.point === false`)
are not considered replaced widgets.

A `posAtCoords` fallback handles cases where `moveVertically` correctly moves
one document line but misresolves the goalColumn on a line with altered font
metrics. When the cursor lands at column 0 despite a non-zero goalColumn, the
fallback uses `lineBlockAt` and `posAtCoords` to find the correct character
position matching the pixel-based goalColumn on the target line.

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
The fix uses the vim state (`vim.visualLine`, `vim.visualBlock`) to only
apply the EOL decrement in charwise visual mode — linewise and blockwise
visual skip the adjustment, preserving their existing rendering.

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

## Surround operators (vim-surround)

**Files**: `src/vim.js`, `src/types.ts`

Native vim-surround support: `ds{target}`, `cs{target}{replacement}`,
`ys{motion}{replacement}`, `yss{replacement}`, visual `S{replacement}`,
tag surround (`dst`, `cst`, `ys<tag>`, `S<tag>`), function wrapping (`f`/`F`),
newline variants (`cS`, `yS`, `ySS`, `gS`), and count support (`2ds)`, `2cs)`).

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
and `changeSurroundPair`, which insert delimiters on separate lines with the
content indented one level deeper than the base indentation.

### Count support

`actionArgs.repeat` is passed to `findSurroundingPair` and `findSurroundingTag`.
For brackets, the Nth-level is found by iterating: find level 1, then search
from outside it for level 2, etc.

For quote-type (non-bracket) targets, count repeats the delimiter character:
`2ysiw*` → `**word**`, `2ds*` on `**word**` → `word`. `findSurroundingQuotes`
with count > 1 searches for N consecutive quote chars. `deleteSurroundPair` and
`changeSurroundPair` use a `width` field on the found pair to handle multi-char
delimiters. In `handleSurroundSubState`, `charRepeat` on the surround state
multiplies the replacement character before passing it to `getSurroundPair`.

This enables Markdown-specific pairs without custom key assignments:
`2ysiw*` (bold), `2ysiw~` (strikethrough), `2ysiw=` (highlight),
`2ysiw$` (math). Follows the `nvim-surround` convention.

### Insert mode surround (`<C-G>s` / `<C-G>S`)

`<C-G>s<character>` in insert mode inserts the open delimiter at cursor.
The close delimiter is stored on `vim.surroundInsertClose` and appended
automatically when insert mode exits (in `exitInsertMode`, before cursor
adjustment). `<C-G>S<character>` does the same with newlines and indentation.

Insert mode partial match buffering was fixed to support this: when the key
buffer contains a non-char key (e.g. `<C-g>`), subsequent single-char keys
in a partial match return `true` (consumed) instead of `false` (fall through
to text insertion). This prevents `s` from being typed as text during the
`<C-g>s<character>` sequence. Existing `jj`/`jk` escape sequences are
unaffected (all-char buffers use the timeout path).

### Dot-repeat

Stores `_surroundReplacement` on `vim.lastEditInputState` via an
`onRepeat` callback. During replay, the action/operator detects the saved
replacement and executes directly without entering the sub-state. Visual `S`
stores selection dimensions in `_surroundSelOffset` for replay.
`_surroundNewline` preserves the newline flag across dot-repeat.

Visual `S` replaces the previous `S` → `VdO` keyToKey in visual mode. `S` in
visual mode now surrounds instead of substituting.

### Cursor positioning after add-surround

`addSurroundToRange` now positions the cursor on the first character of the
inner text (`from.ch + pair.open.length`) instead of on the opening delimiter
(`from.ch`). This fixes dot-repeat for visual surround: the replay
reconstructs the selection range as `[cursor, cursor + savedOffset]`, so the
cursor must start inside the delimiters for the offset to cover the original
text. Without this fix, `viw S]` on `test` produces `[test]` with cursor on
`[`; pressing `.` then surrounds `[tes` instead of `test`, yielding
`[[tes]t]` instead of the expected `[[test]]`.

The newline branch (`gS`, `yS`, `ySS`) is not affected — it replaces the
entire range in a single `replaceRange` call and the cursor lands on the
opening delimiter line, which is correct for multi-line output where the
inner text starts on the next line.

Supported targets: `"`, `'`, `` ` ``, `(`, `)`, `[`, `]`, `{`, `}`, `<`, `>`,
`t` (tag), aliases `b`→`)`, `B`→`}`, `r`→`]`, `a`→`>`. Opening brackets add
inner spaces; closing brackets don't. `<` in replacement position triggers tag
prompting (breaking change — use `>` for no-space angle brackets). `f`/`F` in
replacement position triggers function wrapping.

## Type changes

**File**: `src/types.ts`

- `OperatorArgs`: Added `cursorCol?: number`, `surroundNewline?: boolean`, `surroundCharRepeat?: number`
- `InputStateInterface`: Added `_surroundReplacement`, `_surroundSelOffset`, `_surroundNewline`
- `SurroundReplacementSpec`: Union type for tag and function specs
- `vimState`: Added `surroundInsertClose?: string`, `_commandGeneration: number`
- `surroundState`: Added `tagResult`, `from`, `to`, `newline`, `count`, `charRepeat`, `pendingInput`
- `allCommands`: Added `_isDefault?: boolean`
- `moveByLines` return: `Pos | null`
- `moveByWords` return: `Pos | null | undefined`
- `MotionFn` return: Widened to include `Promise` variants

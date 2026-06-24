# Differences from upstream replit/codemirror-vim

This document tracks all modifications made to this fork compared to
[replit/codemirror-vim](https://github.com/replit/codemirror-vim).

Upstream base: commit `1ccb518` (post-v6.3.0, HEAD of `master` as of 2026-06-23).

## Changes

### 1. Capture-phase Escape handler for Obsidian compatibility

**File**: `src/index.ts` — `vimPlugin` ViewPlugin class

**Problem**: When this package is loaded as a CM6 extension via Obsidian's
`registerEditorExtension()` (rather than as part of Obsidian's internal editor
setup), the Escape key never reaches the ViewPlugin's `eventHandlers.keydown`
callback. Obsidian's application-level key handling intercepts and stops the
Escape event before CM6 dispatches it to plugin event handlers.

**Fix**: The ViewPlugin constructor installs a capture-phase `keydown` listener
on `document` that checks for Escape while the editor has focus and vim is in
insert mode, visual mode, or operator-pending state. When matched, it calls
`Vim.handleKey(this.cm, "<Esc>", "user")` directly (bypassing the ViewPlugin's
own `handleKey` method, which relies on `vimKeyFromEvent` and does not reliably
process Escape in insert mode) and then manually triggers cursor redraw, status
update, and class update. The event is stopped with `stopImmediatePropagation`.

The listener is removed in `destroy()`.

---

### 2. Testing API surface

**File**: `src/vim.js` — `vimApi` object

**Fix**: Added `getInputState(cm)`, `getLastEditInfo(cm)`, `getSearchState(cm)`, `getJumpList()`, and `getMacroState()` methods to the `vimApi` object. These methods provide internal state introspection for testing and debugging without exposing the full `Vim` object internals.

### 3. Behavioral fixes

**File**: `src/vim.js` — `operators.delete`, `onChange`

**Fixes**:
- `operators.delete`: Fixed linewise delete to end of file (`dG`) leaving a trailing newline. The anchor is now expanded to include the preceding newline when deleting from a non-first line to past the last line.
- `onChange`: Expanded insert-mode change capture to accept CM6-style input origins (prefixed with "input"). This ensures `cw` dot-repeat recording works in environments where the origin is "input.type" instead of "+input".
- `findNext` (internal): Fixed search wrap-around cursor position — when the cursor is inside the current match, `findNext` now skips to the next match instead of returning the current one, making `n`/`N` wrap-around consistent after incremental search.

### 4. Operator-pending action support

**Files**: `src/vim.js` — `commandMatches`, `evalInput`; `src/types.ts`

**Fixes**:
- `commandMatches`: Added `operatorPending` boolean flag to keymap entries. Actions with `operatorPending: true` bypass the operator-pending filter, enabling native dispatch for async actions like EasyMotion.
- `types.ts`: Added `operatorPending?: boolean` to the `allCommands` type.

### 5. Async motion dispatch

**Files**: `src/vim.js` — `evalInput`; `src/types.ts`

**Fixes**:
- `evalInput`: Refactored operator application into a new `applyOperator` method. Motion results that are thenables (Promises) now defer operator application via `.then()`. This enables async motions like EasyMotion label selection to work with operators.
- `types.ts`: Widened `MotionFn` return type to include `Promise<Pos|[Pos,Pos]|null>`.

---

## Planned changes

### Neovim alignment

Upstream codemirror-vim follows classic Vim behavior in several places where
Neovim differs. Future patches to this fork may align behavior with Neovim
defaults where the motions plugin already expects Neovim semantics:

- `Y` → `y$` (Neovim default, already overridden by the motions plugin via
  `mapCommand`)
- `Q` → `@@` (Neovim default, already overridden by the motions plugin)
- Other behavioral deltas tracked in the motions plugin's
  `test/neovim/deviations.ts`

### Async operator-pending support

The primary motivation for this fork: modifying `commandMatches()` and `evalInput()` to allow actions to fire in operator-pending context. The core infrastructure for async operator-pending support is now implemented in the fork, enabling `d<leader><leader>w{label}` to work through the native vim dispatch pipeline. Plugin-side registration of these async actions is pending.

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

### Async motion dispatch

**Files**: `src/vim.js`, `src/types.ts`

Refactored `evalInput` to extract `applyOperator` as a separate method. Motion
results that are thenables (Promises) defer operator application via `.then()`.
Visual mode is properly handled in the async path — selection head/anchor and
marks are updated when an async motion resolves during visual mode. `MotionFn`
return type widened to include `Promise<Pos|[Pos,Pos]|null>`.

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

462/689 tests passing against Neovim 0.12.3 with per-step comparison
(more strict than final-state-only, which showed 496/688).

### Cursor color CSS variables

**File**: `src/block-cursor.ts`

Replaced hardcoded `#ff9696` cursor color with CSS variables:
`var(--interactive-accent, #ff9696)` for background and
`var(--text-on-accent, inherit)` for text. Obsidian themes apply
automatically; non-Obsidian consumers get the original fallback colors.

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

### dw on empty line cursor

**File**: `src/vim.js` — `operators.delete`

After `dw` deletes only a newline and the resulting line is whitespace-only
with length ≥ 2, cursor is placed at `ch:1` instead of `ch:0`.

### Other fixes

- `operators.indent`: Cursor at column 0 after `>>` / `<<` (was first non-blank)
- `onChange`: Accept CM6-style input origins (`"input.type"`) for insert recording
- `findNext`: Skip current match during wrap-around after incremental search
- Golden recorder `escapeKeysForNeovim`: Convert literal `\n` to `<CR>` so ex commands execute

## Type changes

**File**: `src/types.ts`

- `OperatorArgs`: Added `cursorCol?: number`
- `moveByLines` return: `Pos | null`
- `moveByWords` return: `Pos | null | undefined`
- `MotionFn` return: Widened to include `Promise` variants

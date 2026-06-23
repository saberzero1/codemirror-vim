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

**Note**: This fix is specifically needed when codemirror-vim is loaded via
Obsidian's `registerEditorExtension()`. It is harmless when loaded as part of
Obsidian's built-in vim mode because the guard conditions (`hasFocus`, mode
checks) prevent double-handling. WebDriver (used by wdio-obsidian-service for
e2e testing) sends Escape through Electron's accelerator layer which bypasses
DOM entirely — the test helpers use `Vim.handleKey` directly for Escape via
the `sendVimEscape()` helper.

---

## Planned changes

### Neovim alignment

Upstream codemirror-vim follows classic Vim behavior in several places where
Neovim differs. Future patches to this fork may align behavior with Neovim
defaults where the motions plugin already expects Neovim semantics:

- `Y` → `y$` (Neovim default, already overridden by the motions plugin via
  `mapCommand`)
- `Q` → `@@` (Neovim default, already overridden by the motions plugin)
- Operator-pending mode accepting async actions (the core reason for this fork)
- Other behavioral deltas tracked in the motions plugin's
  `test/neovim/deviations.ts`

### Async operator-pending support

The primary motivation for this fork: modifying `commandMatches()` (vim.js
line 3630) and `evalInput()` (vim.js line 2043) to allow actions to fire in
operator-pending context, enabling `d<leader><leader>w{label}` (delete to
EasyMotion target) to work through the native vim dispatch pipeline instead of
the current capture-phase interceptor workaround.

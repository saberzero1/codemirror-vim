import { initVim } from "./vim";
import { CodeMirror } from "./cm_adapter";
import { BlockCursorPlugin, hideNativeSelection } from "./block-cursor";
import {
  Extension,
  StateField,
  StateEffect,
  RangeSetBuilder,
} from "@codemirror/state";
import {
  ViewPlugin,
  PluginValue,
  ViewUpdate,
  Decoration,
  type DecorationSet,
  EditorView,
  showPanel,
  Panel,
} from "@codemirror/view";
import { setSearchQuery } from "@codemirror/search";

var FIREFOX_LINUX = typeof navigator != "undefined"
  && /linux/i.test(navigator.platform)
  && / Gecko\/\d+/.exec(navigator.userAgent);

const Vim = initVim(CodeMirror);

const HighlightMargin = 250;

const vimStyle = EditorView.baseTheme({
  ".cm-vimMode > .cm-cursorLayer:not(.cm-vimCursorLayer)": {
    display: "none",
  },
  ".cm-vim-panel": {
    padding: "0px 10px",
    fontFamily: "monospace",
    minHeight: "1.3em",
    display: 'flex',
  },
  ".cm-vim-panel input": {
    border: "none",
    outline: "none",
    backgroundColor: "inherit",
  },

  "&light .cm-searchMatch": { backgroundColor: "#ffff0054" },
  "&dark .cm-searchMatch": { backgroundColor: "#00ffff8a" },

  ".cm-vim-linewise-selection": { backgroundColor: "Highlight", color: "HighlightText" },
  "&light .cm-vim-linewise-selection": { backgroundColor: "rgba(0, 100, 200, 0.2)" },
  "&dark .cm-vim-linewise-selection": { backgroundColor: "rgba(100, 180, 255, 0.2)" },
});
type EditorViewExtended = EditorView & { cm: CodeMirror };

const vimPlugin = ViewPlugin.fromClass(
  class implements PluginValue {
    private dom: HTMLElement;
    private statusButton: HTMLElement;
    private spacer: HTMLElement;
    public view: EditorViewExtended;
    public cm: CodeMirror;
    public status = "";
    blockCursor: BlockCursorPlugin;
    _keyHandler: ((e: KeyboardEvent) => void) | null = null;
    _blurHandler: (() => void) | null = null;
    _focusHandler: (() => void) | null = null;
    constructor(view: EditorView) {
      this.view = view as EditorViewExtended;
      const cm = (this.cm = new CodeMirror(view));
      Vim.enterVimMode(this.cm);

      this.view.cm = this.cm;
      this.cm.state.vimPlugin = this;
      if (initialCursorShapes && this.cm.state.vim) {
        this.cm.state.vim.cursorShapes = initialCursorShapes;
      }

      this.blockCursor = new BlockCursorPlugin(view, cm);
      this.updateClass();

      // Obsidian intercepts Escape at the app level before CM6 ViewPlugin
      // event handlers see it.  Install a capture-phase listener on document
      // so the vim layer processes Escape before the host swallows it.
      this._keyHandler = (e: KeyboardEvent) => {
        if (e.key !== "Escape") return;
        if (!view.hasFocus) return;
        const vimState = this.cm.state.vim;
        if (!vimState) return;
        if (vimState.insertMode || vimState.visualMode || (vimState.inputState && vimState.inputState.operator)) {
          const handled = Vim.handleKey(this.cm, "<Esc>", "user");
          if (handled) {
            this.blockCursor.scheduleRedraw();
            this.updateStatus();
            this.updateClass();
            e.preventDefault();
            e.stopImmediatePropagation();
          }
        }
      };
      view.dom.ownerDocument.addEventListener("keydown", this._keyHandler, true);

      // Reset partial key sequences (e.g. a buffered 'g') on blur to prevent
      // stale prefixes from combining with later keystrokes after refocus.
      this._blurHandler = () => {
        const vim = this.cm.state.vim;
        if (!vim || vim.insertMode) return;
        if (vim.inputState && vim.inputState.keyBuffer.length > 0) {
          Vim.clearInputState(this.cm as any, 'blur');
          vim.status = "";
          this.updateStatus();
        }
      };
      view.contentDOM.addEventListener("blur", this._blurHandler);

      this._focusHandler = () => {
        this.blockCursor.scheduleRedraw();
      };
      view.contentDOM.addEventListener("focus", this._focusHandler);

      this.cm.on("vim-command-done", () => {
        if (cm.state.vim) cm.state.vim.status = "";
        this.blockCursor.scheduleRedraw();
        this.updateStatus();
      });
      this.cm.on("vim-mode-change", (e: any) => {
        if (!cm.state.vim) return;
        cm.state.vim.mode = e.mode;
        if (e.subMode) {
          cm.state.vim.mode += e.subMode === "linewise" ? " line" : " block";
        }
        cm.state.vim.status = "";
        this.blockCursor.scheduleRedraw();
        this.updateClass();
        this.updateStatus();
      });

      this.cm.on("dialog", () => {
        if (this.cm.state.statusbar) {
          this.updateStatus();
        } else {
          view.dispatch({
            effects: showVimPanel.of(!!this.cm.state.dialog),
          });
        }
      });

      this.dom = document.createElement("span");
      this.spacer = document.createElement("span");
      this.spacer.style.flex = "1";
      this.statusButton = document.createElement("span");
      this.statusButton.onclick = (e) => {
        Vim.handleKey(this.cm, "<Esc>", "user");
        this.cm.focus();
      };
      this.statusButton.style.cssText = "cursor: pointer";
    }

    update(update: ViewUpdate) {
      if ((update.viewportChanged || update.docChanged) && this.query) {
        this.highlight(this.query);
      }
      if (update.docChanged) {
        this.cm.onChange(update);
      }
      if (update.selectionSet) {
        this.cm.onSelectionChange();
      }
      if (update.viewportChanged) {
        // scroll
      }
      if (this.cm.curOp && !this.cm.curOp.isVimOp) {
        this.cm.onBeforeEndOperation();
      }
      if (update.transactions) {
        for (let tr of update.transactions)
          for (let effect of tr.effects) {
            if (effect.is(setSearchQuery)) {
              let forVim = (effect.value as any)?.forVim;
              if (!forVim) {
                this.highlight(null);
              } else {
                let query = (effect.value as any).create();
                this.highlight(query);
              }
            }
          }
      }

      this.blockCursor.update(update);
    }
    updateClass() {
      const state = this.cm.state;
      let insertWithNonBarCursor = state.vim?.insertMode && !state.overwrite
        && state.vim.cursorShapes?.insert && state.vim.cursorShapes.insert !== 'bar';
      if (!state.vim || (state.vim.insertMode && !state.overwrite && !insertWithNonBarCursor))
        this.view.scrollDOM.classList.remove("cm-vimMode");
      else this.view.scrollDOM.classList.add("cm-vimMode");
      if (state.vim?.visualMode)
        this.view.scrollDOM.classList.add("cm-vimVisual");
      else
        this.view.scrollDOM.classList.remove("cm-vimVisual");
      if (state.vim?.visualMode && state.vim?.visualLine)
        this.view.scrollDOM.classList.add("cm-vimVisualLine");
      else
        this.view.scrollDOM.classList.remove("cm-vimVisualLine");
      if (state.vim?.selectMode)
        this.view.scrollDOM.classList.add("cm-vimSelect");
      else
        this.view.scrollDOM.classList.remove("cm-vimSelect");
    }
    updateStatus() {
      let dom = this.cm.state.statusbar;
      let vim = this.cm.state.vim;
      if (!dom || !vim) return;
      let dialog = this.cm.state.dialog;
      if (dialog) {
        if (dialog.parentElement != dom) {
          dom.textContent = "";
          dom.appendChild(dialog);
        }
      } else {
        dom.textContent = ""
        var status = (vim.mode || "normal").toUpperCase();
        if (vim.insertModeReturn) status += "(C-O)"
        this.statusButton.textContent = `--${status}--`;
        dom.appendChild(this.statusButton);
        dom.appendChild(this.spacer);
      }

      this.dom.textContent = vim.status;
      dom.appendChild(this.dom);
    }

    destroy() {
      if (this._keyHandler) {
        this.view.dom.ownerDocument.removeEventListener("keydown", this._keyHandler, true);
        this._keyHandler = null;
      }
      if (this._blurHandler) {
        this.view.contentDOM.removeEventListener("blur", this._blurHandler);
        this._blurHandler = null;
      }
      if (this._focusHandler) {
        this.view.contentDOM.removeEventListener("focus", this._focusHandler);
        this._focusHandler = null;
      }
      Vim.leaveVimMode(this.cm);
      this.updateClass();
      this.blockCursor.destroy();
      delete (this.view as any).cm;
    }

    highlight(query: any) {
      this.query = query;
      if (!query) return (this.decorations = Decoration.none);
      let { view } = this;
      let builder = new RangeSetBuilder<Decoration>();
      for (
        let i = 0, ranges = view.visibleRanges, l = ranges.length;
        i < l;
        i++
      ) {
        let { from, to } = ranges[i];
        while (i < l - 1 && to > ranges[i + 1].from - 2 * HighlightMargin)
          to = ranges[++i].to;
        query.highlight(
          view.state,
          from,
          to,
          (from: number, to: number) => {
            builder.add(from, to, matchMark);
          }
        );
      }
      return (this.decorations = builder.finish());
    }
    query = null;
    decorations = Decoration.none;
    waitForCopy = false;
    handleKey(e: KeyboardEvent, view: EditorView) {
      const cm = this.cm;
      let vim = cm.state.vim;
      if (!vim) return;

      const key = Vim.vimKeyFromEvent(e, vim);
      CodeMirror.signal(this.cm, 'inputEvent', {type: "handleKey", key});
      if (!key) return;

      // clear search highlight
      if (
        key == "<Esc>" &&
        !vim.insertMode &&
        !vim.visualMode &&
        this.query /* && !cm.inMultiSelectMode*/
      ) {
        const searchState = vim.searchState_
        if (searchState) {
          cm.removeOverlay(searchState.getOverlay())
          searchState.setOverlay(null);
        }
      }

      let isCopy = key === "<C-c>" && !CodeMirror.isMac;
      if (isCopy && cm.somethingSelected()) {
        this.waitForCopy = true;
        return true;
      }
      // Visual-line uses cursor-only CM6 selection (no spanning range),
      // so somethingSelected() is false. Copy linewise text from vim.sel.
      if (isCopy && vim.visualMode && vim.visualLine && vim.sel) {
        let startLine = Math.min(vim.sel.anchor.line, vim.sel.head.line);
        let endLine = Math.max(vim.sel.anchor.line, vim.sel.head.line);
        let lines: string[] = [];
        for (let i = startLine; i <= endLine; i++) {
          lines.push(cm.getLine(i));
        }
        navigator.clipboard.writeText(lines.join("\n") + "\n");
        return true;
      }

      vim.status = (vim.status || "") + key;
      let result = Vim.multiSelectHandleKey(cm, key, "user");
      vim = Vim.maybeInitVimState_(cm); // the object can change if there is an exception in handleKey

      if (result) {
        CodeMirror.signal(this.cm, 'vim-keypress', key);
        e.preventDefault();
        e.stopPropagation();
        this.blockCursor.scheduleRedraw();
      } else if (vim.visualMode && vim.visualLine && vim.sel) {
        // Vim didn't handle this key — it will propagate to Obsidian.
        // Expand CM6 selection to full linewise range so Obsidian commands
        // (Tab/indent, formatting toggles) operate on all selected lines.
        let startLine = Math.min(vim.sel.anchor.line, vim.sel.head.line);
        let endLine = Math.max(vim.sel.anchor.line, vim.sel.head.line);
        let doc = this.view.state.doc;
        let from = doc.line(startLine + 1).from;
        let to = doc.line(endLine + 1).to;
        this.view.dispatch({ selection: {anchor: from, head: to} });
        // Restore cursor-only selection after Obsidian processes the command
        Promise.resolve().then(() => {
          let vimState = cm.state.vim;
          if (vimState && vimState.visualLine && vimState.sel) {
            cm.operation(() => {
              // @ts-ignore
              if (cm.curOp) cm.curOp.isVimOp = true;
              cm.setCursor(vimState!.sel.head.line, 0);
            });
          }
        });
      }

      this.updateStatus();

      return !!result;
    }
    lastKeydown = ''
    useNextTextInput = false
    compositionText = ''
  },
  {
    eventObservers: {
      keydown: function(e: KeyboardEvent, view: EditorView) {
        if (_keyInterceptActive) return;
        CodeMirror.signal(this.cm, 'inputEvent', e);
        this.lastKeydown = e.key;
        if (
          this.lastKeydown == "Unidentified"
          || this.lastKeydown == "Process"
          || this.lastKeydown == "Dead"
        ) {
          this.useNextTextInput = true;
        } else {
          this.useNextTextInput = false;
          this.handleKey(e, view);
        }
      },
    },
    eventHandlers: {
      copy: function(e: ClipboardEvent, view: EditorView) {
        if (!this.waitForCopy) return;
        this.waitForCopy = false;
        Promise.resolve().then(() => {
          var cm = this.cm;
          var vim = cm.state.vim;
          if (!vim) return;
          if (vim.insertMode) {
            cm.setSelection(cm.getCursor(), cm.getCursor());
          } else {
            cm.operation(() => {
              if (cm.curOp) cm.curOp.isVimOp = true;
              Vim.handleKey(cm, '<Esc>', 'user');
            });
          }
        });
      },
      compositionstart: function(e: Event, view: EditorView) {
        this.useNextTextInput = true;
        CodeMirror.signal(this.cm, 'inputEvent', e);
      },
      compositionupdate: function(e: Event, view: EditorView) {
        CodeMirror.signal(this.cm, 'inputEvent', e);
      },
      compositionend: function(e: Event, view: EditorView) {
        CodeMirror.signal(this.cm, 'inputEvent', e);
      },
      keypress: function(e: KeyboardEvent, view: EditorView) {
        CodeMirror.signal(this.cm, 'inputEvent', e);
        if (this.lastKeydown == "Dead")
          this.handleKey(e, view);
      },
    },
    provide: () => {
      return [
        EditorView.inputHandler.of((view, from, to, text) => {
          var cm = getCM(view);
          if (!cm) return false;
          var vim = cm.state?.vim;
          var vimPlugin = cm.state.vimPlugin;

          if (vim && !vim.insertMode && !cm.curOp?.isVimOp) {
            if (text === "\0\0") {
              return true;
            }
            CodeMirror.signal(cm, 'inputEvent', {
              type: "text",
              text,
              from, 
              to,              
            });
            if (text.length == 1 && vimPlugin.useNextTextInput) {
              if (vim.expectLiteralNext && view.composing) {
                vimPlugin.compositionText = text;
                return false
              }
              if (vimPlugin.compositionText) {
                var toRemove = vimPlugin.compositionText;
                vimPlugin.compositionText = '';
                var head = view.state.selection.main.head
                var textInDoc = view.state.sliceDoc(head - toRemove.length, head);
                if (toRemove === textInDoc) {
                  var pos = cm.getCursor();
                  cm.replaceRange('', cm.posFromIndex(head - toRemove.length), pos);
                }
              }
              vimPlugin.handleKey({
                key: text,
                preventDefault: ()=>{},
                stopPropagation: ()=>{}
              });
              forceEndComposition(view);
              return true;
            }
          }
          return false;
        })
      ]
    },

    decorations: (v) => v.decorations,
  }
);

/**
 * removes contenteditable element and adds it back to end
 * IME composition in normal mode
 * this method works on all browsers except for Firefox on Linux
 * where we need to reset textContent of editor 
 * (which doesn't work on other browsers)
 */
function forceEndComposition(view: EditorView) {
  var parent = view.scrollDOM.parentElement;
  if (!parent) return;

  if (FIREFOX_LINUX) {
    view.contentDOM.textContent = "\0\0";
    view.contentDOM.dispatchEvent(new CustomEvent("compositionend"));
    return;
  }
  var sibling = view.scrollDOM.nextSibling;
  var selection = window.getSelection();
  var savedSelection = selection && {
    anchorNode: selection.anchorNode,
    anchorOffset: selection.anchorOffset,
    focusNode: selection.focusNode,
    focusOffset: selection.focusOffset
  };

  view.scrollDOM.remove();
  parent.insertBefore(view.scrollDOM, sibling);
  try {
    if (savedSelection && selection) {
      selection.setPosition(savedSelection.anchorNode, savedSelection.anchorOffset);
      if (savedSelection.focusNode) {
        selection.extend(savedSelection.focusNode, savedSelection.focusOffset);
      }
    }
  } catch(e) {
    console.error(e);
  }
  view.focus();
  view.contentDOM.dispatchEvent(new CustomEvent("compositionend"));
}

const matchMark = Decoration.mark({ class: "cm-searchMatch" });

const showVimPanel = StateEffect.define<boolean>();

const vimPanelState = StateField.define<boolean>({
  create: () => false,
  update(value, tr) {
    for (let e of tr.effects) if (e.is(showVimPanel)) value = e.value;
    return value;
  },
  provide: (f) => {
    return showPanel.from(f, (on) => (on ? createVimPanel : null));
  },
});

function createVimPanel(view: EditorView) {
  let dom = document.createElement("div");
  dom.className = "cm-vim-panel";
  let cm = (view as EditorViewExtended).cm;
  if (cm.state.dialog) {
    dom.appendChild(cm.state.dialog);
  }
  return { top: false, dom };
}

function statusPanel(view: EditorView): Panel {
  let dom = document.createElement("div");
  dom.className = "cm-vim-panel";
  let cm = (view as EditorViewExtended).cm;
  cm.state.statusbar = dom;
  cm.state.vimPlugin.updateStatus();
  return { dom };
}

const linewiseSelMark = Decoration.line({ class: "cm-vim-linewise-selection" });

const linewiseVisualHighlight = ViewPlugin.fromClass(class {
  decorations: DecorationSet = Decoration.none;
  constructor(view: EditorView) {
    this.decorations = this.build(view);
  }
  update(update: ViewUpdate) {
    if (update.docChanged || update.selectionSet || update.viewportChanged) {
      this.decorations = this.build(update.view);
    }
  }
  build(view: EditorView): DecorationSet {
    const cm = (view as EditorViewExtended).cm;
    if (!cm?.state?.vim) return Decoration.none;
    const vim = cm.state.vim;
    if (!vim.visualMode || !vim.visualLine) return Decoration.none;
    const sel = vim.sel;
    if (!sel) return Decoration.none;
    const startLine = Math.min(sel.anchor.line, sel.head.line);
    const endLine = Math.max(sel.anchor.line, sel.head.line);
    const doc = view.state.doc;
    const builder = new RangeSetBuilder<Decoration>();
    for (let i = startLine; i <= endLine; i++) {
      const lineNum = i + 1;
      if (lineNum > doc.lines) break;
      builder.add(doc.line(lineNum).from, doc.line(lineNum).from, linewiseSelMark);
    }
    return builder.finish();
  }
}, {
  decorations: (v) => v.decorations,
});

export function vim(options: { status?: boolean; cursorShapes?: import("./block-cursor").CursorShapeConfig } = {}): Extension {
  if (options.cursorShapes) {
    initialCursorShapes = options.cursorShapes;
  }
  return [
    vimStyle,
    vimPlugin,
    hideNativeSelection,
    linewiseVisualHighlight,
    options.status ? showPanel.of(statusPanel) : vimPanelState,
  ];
}

let initialCursorShapes: import("./block-cursor").CursorShapeConfig | undefined;

let _keyInterceptActive = false;

/**
 * When set to `true`, the capture-phase keydown handler skips vim processing
 * and lets the event propagate to the host plugin's own capture-phase
 * handlers (flash labels, EasyMotion labels, hint mode, etc.).
 *
 * The host plugin must call `setKeyInterceptActive(true)` before entering
 * a modal key-interception state and `setKeyInterceptActive(false)` when
 * the modal exits.
 */
export function setKeyInterceptActive(active: boolean): void {
  _keyInterceptActive = active;
}

export function resetForkedVimState(): void {
  _keyInterceptActive = false;
  initialCursorShapes = undefined;
}

export { CodeMirror, Vim };
export { foldopenAnnotation, setLivePreviewField, setPropertiesSource } from "./cm_adapter";
export { setCursorSuppressed, setCursorSuppressedForView, clearCursorSuppressedForView, isCursorSuppressedForView, resetCursorState } from "./block-cursor";
export type { CursorShape, CursorShapeConfig } from "./block-cursor";
export type { FoldopenCategory } from "./types";

export function getCM(view: EditorView): CodeMirror | null {
  return (view as EditorViewExtended).cm || null;
}

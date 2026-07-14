import { CodeMirror } from "./cm_adapter"
import {initVim} from "./vim"
export type Vim = ReturnType<typeof initVim>
export type SurroundReplacementSpec =
    | { kind: 'tag', value: string }
    | { kind: 'func', value: string, spaced: boolean };

export type vimState = {
    onPasteFn?: () => void,
    sel: {head: Pos, anchor: Pos},
    insertModeReturn: boolean, 
    visualBlock: boolean, 
    selectMode: boolean,
    virtualReplace: boolean,
    replaceStack: { original: string, vcols: number }[],
    marks: {[mark: string]: Marker}, 
    visualMode: boolean, 
    insertMode: boolean, 
    pasteFn?: any, 
    lastSelection: {
        anchorMark: Marker,
        headMark: Marker,
        visualLine: boolean,
        visualBlock: boolean,
        visualMode: boolean,
        selectMode?: boolean,
        anchor: Pos,
        head: Pos,
    }, 
    searchState_?: SearchStateInterface, 
    lastEditActionCommand: actionCommand|void, 
    lastPastedText?: string, 
    lastMotion?: MotionFn|null, 
    options: {[optionName: string]: vimOption}, 
    lastEditInputState: InputStateInterface|void, 
    inputState: InputStateInterface,
    visualLine: boolean, 
    insertModeRepeat?: number,
    lastHSPos: number,
    lastHPos: number,
    wasInVisualBlock?: boolean,
    blockInsertLeft?: number,
    insertEnd?: Marker,
    status: string,
    exMode?: boolean,
    mode?: string,
    expectLiteralNext?: boolean,
    cursorShapes?: import("./block-cursor").CursorShapeConfig,
    surroundInsertClose?: string,
    _commandGeneration: number,
    _preventReselect?: boolean,
    _suppressModeSignal?: boolean,
    insertModeReturnArgs?: { replace?: boolean, virtualReplace?: boolean },
    surroundState?: {
        type: string,
        target?: string,
        from?: Pos,
        to?: Pos,
        tagResult?: { open: { from: Pos, to: Pos }, close: { from: Pos, to: Pos } },
        funcResult?: { funcNameStart: Pos, open: Pos, close: Pos },
        linewise?: boolean,
        newline?: boolean,
        count?: number,
        charRepeat?: number,
        operatorArgs?: Record<string, unknown>,
        onRepeat?: (replacement: string | SurroundReplacementSpec) => void,
        pendingInput?: {
            kind: string,
            buffer: string,
            prompt: string,
            acceptOn: Record<string, boolean>,
            spaced?: boolean,
            onAccept: (buffer: string) => void,
        } | null,
    } | null,
}
export type Marker = ReturnType<CodeMirror["setBookmark"]>
export type LineHandle = ReturnType<CodeMirror["getLineHandle"]>
export type Pos = { line: number, ch: number, sticky?: string }

export interface CM5Range {
    anchor: Pos,
    head: Pos,

    from(): Pos,
    empty(): boolean
}
export interface CM5RangeInterface {
    anchor: Pos,
    head: Pos,
}

export type RegisterController = ReturnType<Vim["getRegisterController"]>
export type Register = ReturnType<RegisterController["getRegister"]>

export type SearchArgs = {
    forward?: boolean,
    toJumplist?: boolean,
    wholeWordOnly?: boolean,
    querySrc?: string,
}

export type OperatorArgs = {
    repeat?: number,
    forward?: boolean,
    linewise?: boolean,
    fullLine?: boolean,
    registerName?: string|null,
    indentRight?: boolean,
    toLower?: boolean,
    shouldMoveCursor?: boolean,
    selectedCharacter?: string,
    lastSel?: {
        head: Pos,
        anchor: Pos,
        visualLine: boolean,
        visualBlock: boolean,
    },
    keepCursor?: boolean;
    cursorCol?: number;
    surroundNewline?: boolean;
    surroundCharRepeat?: number;
} 
// version of CodeMirror with vim state checked
export type CodeMirrorV = CodeMirror & {state: {vim: vimState}}
export type OperatorFn = (cm: CodeMirrorV, args: OperatorArgs, ranges: CM5RangeInterface[], oldAnchor: Pos, newHead?: Pos) => Pos|void
export type vimOperators = {
    change(cm: CodeMirrorV, args: OperatorArgs, ranges: CM5RangeInterface[]): void,
    delete(cm: CodeMirrorV, args: OperatorArgs, ranges: CM5RangeInterface[]): void,
    indent(cm: CodeMirrorV, args: OperatorArgs, ranges: CM5RangeInterface[]): void,
    indentAuto(cm: CodeMirrorV, args: OperatorArgs, ranges: CM5RangeInterface[]): void,
    hardWrap(cm: CodeMirrorV, args: OperatorArgs, ranges: CM5RangeInterface[], oldAnchor: Pos): Pos|void,
    changeCase(cm: CodeMirrorV, args: OperatorArgs, ranges: CM5RangeInterface[], oldAnchor: Pos, newHead?: Pos): Pos|void,
    yank(cm: CodeMirrorV, args: OperatorArgs, ranges: CM5RangeInterface[], oldAnchor: Pos): Pos|void,
} & {
    [key: string]: OperatorFn
}

export type ActionArgsPartial = {
    repeat?: number,
    forward?: boolean,
    head?: Pos,
    position?: string
    backtrack?: boolean,
    increase?: boolean,
    repeatIsExplicit?: boolean,
    indentRight?: boolean,
    selectedCharacter?: string,
    after?: boolean,
    matchIndent?: boolean,
    registerName?: string,
    isEdit?: boolean
    linewise?: boolean,
    insertAt?: string,
    blockwise?: boolean,
    keepSpaces?: boolean,
    replace?: boolean,
    virtualReplace?: boolean,
    keepCursor?: boolean,
    pendingOperator?: string | null,
    pendingOperatorArgs?: OperatorArgs | null,
}
export type ActionArgs = ActionArgsPartial & {repeat: number};

export type ActionFn = (cm: CodeMirrorV, actionArgs: ActionArgs, vim: vimState) => void 

export type vimActions  = {
    jumpListWalk(cm: CodeMirrorV, actionArgs: ActionArgs, vim: vimState): void,
    continuePaste(cm: CodeMirrorV, actionArgs: ActionArgs, vim: vimState, text: string, register: Register): void
    enterInsertMode(cm: CodeMirrorV, actionArgs: ActionArgsPartial, vum: vimState): void,
} & {
    [key: string]: ActionFn
}

export type MotionArgsPartial = {
    repeat?: number,
    forward?: boolean,
    selectedCharacter?: string,
    linewise?: boolean,
    textObjectInner?: boolean,
    sameLine?: boolean,
    repeatOffset?: number,
    toJumplist?: boolean,
    inclusive?: boolean,
    wordEnd?: boolean,
    toFirstChar?:boolean,
    explicitRepeat?: boolean,
    bigWord?: boolean,
    repeatIsExplicit?: boolean,
    noRepeat?: boolean
};

export type MotionArgs = MotionArgsPartial & {repeat: number};

export type MotionFn = (cm: CodeMirrorV, head: Pos, motionArgs: MotionArgs, vim: vimState, inputState: InputStateInterface) => Pos|[Pos,Pos]|Promise<Pos|[Pos,Pos]|null>|null|undefined
export type vimMotions = {
    moveToTopLine(cm: CodeMirrorV, head: Pos, motionArgs: MotionArgs): Pos
    moveToMiddleLine(cm: CodeMirrorV): Pos
    moveToBottomLine(cm: CodeMirrorV, head: Pos, motionArgs: MotionArgs): Pos
    expandToLine(_cm: CodeMirrorV, head: Pos, motionArgs: MotionArgs): Pos
    findNext(_cm: CodeMirrorV, _head: Pos, motionArgs: MotionArgs): Pos | undefined
    findAndSelectNextInclusive(cm: CodeMirrorV, head: Pos, motionArgs: MotionArgs, vim: vimState, inputState: InputStateInterface): Pos|[Pos,Pos] | undefined
    goToMark(cm: CodeMirrorV, _head: Pos, motionArgs: MotionArgs, vim: vimState, inputState: InputStateInterface): Pos | undefined | null
    moveToOtherHighlightedEnd(cm: CodeMirrorV, _head: Pos, motionArgs: MotionArgs, vim: vimState): [Pos,Pos]
    jumpToMark(cm: CodeMirrorV, head: Pos, motionArgs: MotionArgs, vim: vimState):Pos
    moveByCharacters(_cm: CodeMirrorV, head: Pos, motionArgs: MotionArgs): Pos
    moveByLines(cm: CodeMirrorV, head: Pos, motionArgs: MotionArgs, vim: vimState): Pos | null
    moveByDisplayLines(cm: CodeMirrorV, head: Pos, motionArgs: MotionArgs, vim: vimState): Pos
    moveByPage(cm: CodeMirrorV, head: Pos, motionArgs: MotionArgs): Pos
    moveByParagraph(cm: CodeMirrorV, head: Pos, motionArgs: MotionArgs): Pos
    moveBySentence(cm: CodeMirrorV, head: Pos, motionArgs: MotionArgs): Pos
    moveByScroll(cm: CodeMirrorV, head: Pos, motionArgs: MotionArgs, vim: vimState): Pos | null
    moveByWords(cm: CodeMirrorV, head: Pos, motionArgs: MotionArgs): Pos | null | undefined
    moveTillCharacter(cm: CodeMirrorV, _head: Pos, motionArgs: MotionArgs): Pos | null
    moveToCharacter(cm: CodeMirrorV, head: Pos, motionArgs: MotionArgs): Pos
    moveToSymbol(cm: CodeMirrorV, head: Pos, motionArgs: MotionArgs): Pos
    moveToColumn(cm: CodeMirrorV, head: Pos, motionArgs: MotionArgs, vim: vimState): Pos
    moveToEol(cm: CodeMirrorV, head: Pos, motionArgs: MotionArgs, vim: vimState): Pos
    moveToFirstNonWhiteSpaceCharacter(cm: CodeMirrorV, head: Pos): Pos
    moveToMatchedSymbol(cm: CodeMirrorV, head: Pos): Pos | undefined
    moveToStartOfLine(_cm: CodeMirrorV, head: Pos, motionArgs?: MotionArgs, vim?: vimState): Pos
    moveToLineOrEdgeOfDocument(cm: CodeMirrorV, _head: Pos, motionArgs: MotionArgs): Pos
    moveToStartOfDisplayLine(cm: CodeMirrorV): Pos
    moveToEndOfDisplayLine(cm: CodeMirrorV): Pos
    textObjectManipulation(cm: CodeMirrorV, head: Pos, motionArgs: MotionArgs, vim: vimState): Pos | [Pos, Pos] | null
    repeatLastCharacterSearch(cm: CodeMirrorV, head: Pos, motionArgs: MotionArgs): Pos
    [key: string]: MotionFn
}

export type exCommandDefinition = {
    name: string,
    shortName?: string,
    possiblyAsync?: boolean,
    excludeFromCommandHistory?: boolean,
    argDelimiter?: string,
    type? : string,
    toKeys? : string,
    toInput?: string,
    user?: boolean,
    noremap?: boolean,
};

export type optionCallback = (value?: string|undefined, cm?: CodeMirror) => any
export type booleanOptionCallback = (value?: boolean, cm?: CodeMirror) => any
export type numberOptionCallback = (value?: number, cm?: CodeMirror) => any
export type stringOptionCallback = (value?: string, cm?: CodeMirror) => any

export type vimOption = {
    type?: string,
    defaultValue?: unknown,
    callback?: optionCallback,
    value?: unknown
} | {
    type: 'boolean',
    defaultValue?: boolean|null|undefined,
    callback?: booleanOptionCallback,
    value?: boolean
}; 
export type defineOption1 = ((
    name: string,
    defaultValue: unknown,
    type: string,
    aliases?: string[]|undefined|null,
    callback?: optionCallback
) => void) 
export type defineOption2 = ((
    name: string,
    defaultValue: boolean|undefined|null,
    type: 'boolean',
    aliases?: string[]|undefined|null,
    callback?: booleanOptionCallback
) => void);


export type ExFn = (cm: CodeMirrorV, params: ExParams)=> void;

type allCommands = {
    keys: string,
    context?: string,
    interlaceInsertRepeat?: boolean,
    exitVisualBlock?: boolean,
    isEdit?: boolean,
    repeatOverride?: number,
    noremap?: boolean,
    operatorPending?: boolean,
    _isDefault?: boolean,
}
export type motionCommand = allCommands & {
    type: 'motion',
    motion: string,
    motionArgs?: MotionArgsPartial,
    repeatOverride?: number
}
export type operatorCommand = allCommands & {
    type: 'operator',
    operator: string,
    operatorArgs?: OperatorArgs
}
export type actionCommand = allCommands & {
    type: 'action',
    action: string,
    actionArgs?: ActionArgsPartial,
    motion?: string,
    operator?: string,
    interlaceInsertRepeat?: boolean
}
export type searchCommand = allCommands & {
    type: 'search',
    searchArgs: SearchArgs
}
export type operatorMotionCommand = allCommands & {
    type: 'operatorMotion',
    motion: string,
    operator: string,
    motionArgs?: MotionArgsPartial,
    operatorArgs?: OperatorArgs,
    operatorMotionArgs?: { 
        visualLine?: boolean,
    },
}
export type idleCommand = allCommands & { type: 'idle' }
export type exCommand = allCommands & { type: 'ex' }
export type keyToExCommand = allCommands & { type: 'keyToEx', exArgs: ExParams }
export type keyToKeyCommand = allCommands & { toKeys: string, type: 'keyToKey' }

export type vimKey =
    motionCommand
    | operatorCommand
    | actionCommand
    | searchCommand
    | operatorMotionCommand
    | idleCommand
    | exCommand
    | keyToExCommand
    | keyToKeyCommand;

export type vimKeyMap = vimKey[];

export type KeymapEntry = {
    keys: string;
    type: string;
    context?: string;
    operator?: string;
    operatorArgs?: OperatorArgs;
    motion?: string;
    motionArgs?: MotionArgsPartial;
    action?: string;
    actionArgs?: ActionArgsPartial;
    toKeys?: string;
    isEdit?: boolean;
    searchArgs?: SearchArgs;
    operatorPending?: boolean;
};

export type KeymapCompletion = KeymapEntry & {
    suffix: string;
};

export interface InputStateInterface {
    prefixRepeat: string[];
    motionRepeat: string[];
    operator: string| undefined | null;
    operatorArgs: OperatorArgs | undefined | null;
    motion: string | undefined | null;
    motionArgs: MotionArgs | null;
    keyBuffer: string[];
    registerName?: string;
    changeQueue: null | { inserted: string, removed: string[]};
    operatorShortcut?: string;
    selectedCharacter?: string;
    repeatOverride?: number;
    changeQueueList?: (InputStateInterface["changeQueue"])[];
    pushRepeatDigit(n: string): void;
    getRepeat(): number;
    _surroundReplacement?: string | SurroundReplacementSpec;
    _surroundType?: string;
    _surroundSelOffset?: { lineDelta: number, chDelta: number };
    _surroundNewline?: boolean;
    _asyncMotionTarget?: { lineDelta: number, chDelta: number };
    _ysTextObjectMotion?: string;
    _ysTextObjectChar?: string;
}
export interface SearchStateInterface {
    setReversed(reversed: boolean): void;
    isReversed(): boolean|undefined;
    getQuery(): RegExp; 
    setQuery(query: string|RegExp): void;
    highlightTimeout: number|undefined;
    getOverlay(): {
        query: RegExp,
    };
    getScrollbarAnnotate(): any;
    setScrollbarAnnotate(query: RegExp| null): void;
    setOverlay(overlay: {query: RegExp}|null): void;
}

export type exCommandArgs = {
    callback?: (() => void) | undefined; 
    input?: string | undefined; 
    line?: string | undefined;
    commandName?: string | undefined;
    argString?: string;
    args?: string[]; 
};

export type vimExCommands = {
    colorscheme(cm: CodeMirrorV, params: vimExCommandsParams): void,
    map(cm: CodeMirrorV, params: vimExCommandsParams, ctx: string): void,
    imap(cm: CodeMirrorV, params: vimExCommandsParams): void,
    nmap(cm: CodeMirrorV, params: vimExCommandsParams): void,
    vmap(cm: CodeMirrorV, params: vimExCommandsParams): void,
    unmap(cm: CodeMirrorV, params: vimExCommandsParams, ctx: string): void,
    move(cm: CodeMirrorV, params: vimExCommandsParams): void,
    set(cm: CodeMirrorV, params: vimExCommandsParams): void,
    setlocal(cm: CodeMirrorV, params: vimExCommandsParams): void,
    setglobal(cm: CodeMirrorV, params: vimExCommandsParams): void,
    registers(cm: CodeMirrorV, params: vimExCommandsParams): void,
    sort(cm: CodeMirrorV, params: vimExCommandsParams): void,
    vglobal(cm: CodeMirrorV, params: vimExCommandsParams): void,
    global(cm: CodeMirrorV, params: vimExCommandsParams): void,
    substitute(cm: CodeMirrorV, params: vimExCommandsParams): void,
    redo(cm: CodeMirrorV): void,
    undo(cm: CodeMirrorV): void,
    write(cm: CodeMirrorV & {save?: Function}): void,
    nohlsearch(cm: CodeMirrorV): void,
    yank(cm: CodeMirrorV): void,
    delete(cm: CodeMirrorV, params: vimExCommandsParams): void,
    join(cm: CodeMirrorV, params: vimExCommandsParams): void,
    delmarks(cm: CodeMirrorV, params: vimExCommandsParams): void,
    [key: string]:(cm: CodeMirrorV, params: vimExCommandsParams, ctx: string)=> void,
}

type vimExCommandsParams = {
    args?: string[],
    input?: string,
    line?: number,
    setCfg?: {scope?: string},
    argString?: string,
    lineEnd?: number,
    commandName?: string,
    callback?: () => any,
    selectionLine?: number,
    selectionLineEnd?: number
}

type InsertModeKey = InstanceType<Vim["InsertModeKey"]>
export type InsertModeChanges = {
    changes: (InsertModeKey|string|[string,number?])[];
    expectCursorActivityForChange: boolean;
    visualBlock?: number,
    blockInsertLeft?: number,
    maybeReset?: boolean,
    ignoreCount?: number,
    repeatOverride?: number,
}

export type ExParams = {
    commandName: string,
    argString: string,
    input: string,
    args?: string[],
    
    line: number,
    lineEnd?: number,
    selectionLine: number,
    selectionLineEnd?: number,

    setCfg?: Object,
    callback?: () => void,
}

export type PromptOptions = {
    onClose?: Function; 
    prefix: string|HTMLElement;
    desc?: string|HTMLElement; 
    onKeyUp?: Function; 
    onKeyDown: Function; 
    value?: string; 
    selectValueOnOpen?: boolean;
}


declare global {
    function isNaN(v: any): v is Exclude<typeof v, number>;
    interface String {
        trimStart(): string
    }
}

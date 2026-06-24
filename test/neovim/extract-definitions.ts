import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface TestDefinition {
    name: string;
    content: string;
    cursor: { line: number; ch: number };
    keys: string;
    expectedCursor?: { line: number; ch: number };
}

interface EditDefinition extends TestDefinition {
    expectedContent: string;
}

interface SelectionDefinition extends TestDefinition {
    expectedSelection: string;
}

interface SubstituteDefinition {
    name: string;
    content: string;
    cursor: { line: number; ch: number };
    keys: string;
    expectedContent: string;
}

interface SubstituteConfirmDefinition {
    name: string;
    content: string;
    cursor: { line: number; ch: number };
    keys: string;
    expectedContent: string;
    expectedCursor: { line: number; ch: number };
}

interface ExtractedSuites {
    motions: TestDefinition[];
    motionsWithFolding: TestDefinition[];
    jumplist: TestDefinition[];
    edits: EditDefinition[];
    selections: SelectionDefinition[];
    substitutes: SubstituteDefinition[];
    substituteConfirms: SubstituteConfirmDefinition[];
}

function extract(): ExtractedSuites {
    const vimTestPath = path.resolve(__dirname, '..', 'vim_test.js');
    const source = fs.readFileSync(vimTestPath, 'utf-8');

    const suites: ExtractedSuites = {
        motions: [],
        motionsWithFolding: [],
        jumplist: [],
        edits: [],
        selections: [],
        substitutes: [],
        substituteConfirms: [],
    };

    const code = '' +
        ' wOrd1 (#%\n' +
        ' word3] \n' +
        'aopop pop 0 1 2 3 4\n' +
        ' (a) [b] {c} \n' +
        'int getchar(void) {\n' +
        '  static char buf[BUFSIZ];\n' +
        '  static char *bufp = buf;\n' +
        '  if (n == 0) {  /* buffer is empty */\n' +
        '    n = read(0, buf, sizeof buf);\n' +
        '    bufp = buf;\n' +
        '  }\n' +
        '\n' +
        '  return (--n >= 0) ? (unsigned char) *bufp++ : EOF;\n' +
        ' \n' +
        '}\n';

    const jumplistScene = '' +
        'word\n' +
        '(word)\n' +
        '{word\n' +
        'word.\n' +
        '\n' +
        'word search\n' +
        '}word\n' +
        'word\n' +
        'word\n';

    function Pos(line: number, ch: number) { return { line, ch }; }
    function makeCursor(line: number, ch: number) { return { line, ch }; }
    function offsetCursor(cur: { line: number; ch: number }, offsetLine: number, offsetCh: number) {
        return { line: cur.line + offsetLine, ch: cur.ch + offsetCh };
    }

    const lineText = code.split('\n');
    const lines: { line: number; length: number; lineText: string; textStart: number }[] = [];
    for (let i = 0; i < lineText.length; i++) {
        const match = /^\s*/.exec(lineText[i]);
        lines[i] = {
            line: i,
            length: lineText[i].length,
            lineText: lineText[i],
            textStart: match ? match[0].length : 0,
        };
    }
    const endOfDocument = makeCursor(lines.length - 1, lines[lines.length - 1].length);
    const wordLine = lines[0];
    const bigWordLine = lines[1];
    const charLine = lines[2];
    const bracesLine = lines[3];
    const seekBraceLine = lines[4];
    const foldingStart = lines[7];
    const foldingEnd = lines[11];

    const word1 = { start: Pos(wordLine.line, 1), end: Pos(wordLine.line, 5) };
    const word2 = { start: Pos(wordLine.line, word1.end.ch + 2), end: Pos(wordLine.line, word1.end.ch + 4) };
    const word3 = { start: Pos(bigWordLine.line, 1), end: Pos(bigWordLine.line, 5) };
    const bigWord1 = word1;
    const bigWord2 = word2;
    const bigWord3 = { start: Pos(bigWordLine.line, 1), end: Pos(bigWordLine.line, 7) };
    const bigWord4 = { start: Pos(bigWordLine.line, bigWord1.end.ch + 3), end: Pos(bigWordLine.line, bigWord1.end.ch + 7) };

    const oChars = [Pos(charLine.line, 1), Pos(charLine.line, 3), Pos(charLine.line, 7)];
    const pChars = [Pos(charLine.line, 2), Pos(charLine.line, 4), Pos(charLine.line, 6), Pos(charLine.line, 8)];
    const numChars = [Pos(charLine.line, 10), Pos(charLine.line, 12), Pos(charLine.line, 14), Pos(charLine.line, 16), Pos(charLine.line, 18)];

    const parens1 = { start: Pos(bracesLine.line, 1), end: Pos(bracesLine.line, 3) };
    const squares1 = { start: Pos(bracesLine.line, 5), end: Pos(bracesLine.line, 7) };
    const curlys1 = { start: Pos(bracesLine.line, 9), end: Pos(bracesLine.line, 11) };
    const seekOutside = { start: Pos(seekBraceLine.line, 1), end: Pos(seekBraceLine.line, 16) };
    const seekInside = { start: Pos(seekBraceLine.line, 14), end: Pos(seekBraceLine.line, 11) };
    const foldingRangeDown = { start: Pos(foldingStart.line, 3), end: Pos(foldingEnd.line, 0) };
    const foldingRangeUp = { start: Pos(foldingEnd.line, 0), end: Pos(foldingStart.line, 0) };

    const ctx: Record<string, unknown> = {
        code, lines, endOfDocument, wordLine, bigWordLine, charLine, bracesLine,
        seekBraceLine, foldingStart, foldingEnd, word1, word2, word3,
        bigWord1, bigWord2, bigWord3, bigWord4, oChars, pChars, numChars,
        parens1, squares1, curlys1, seekOutside, seekInside,
        foldingRangeDown, foldingRangeUp, jumplistScene,
        Pos, makeCursor, offsetCursor,
    };

    const KEY_MAP: Record<string, string> = {
        'Space': '<Space>',
        'Enter': '<CR>',
        'Return': '<CR>',
        'Backspace': '<BS>',
        'Delete': '<Del>',
        'Escape': '<Esc>',
        'Tab': '<Tab>',
        'Up': '<Up>',
        'Down': '<Down>',
        'Left': '<Left>',
        'Right': '<Right>',
    };

    function translateKey(key: string): string {
        if (KEY_MAP[key]) return KEY_MAP[key];
        return key;
    }

    function keysToString(keys: string | string[]): string {
        if (typeof keys === 'string') return translateKey(keys);
        return keys.map(translateKey).join('');
    }

    function cursorFromRegex(before: string, pos: RegExp): { line: number; ch: number } {
        const ch = before.search(pos);
        if (ch === -1) return { line: 0, ch: 0 };
        const prefix = before.substring(0, ch);
        const line = prefix.split('\n').length - 1;
        const col = line ? (prefix.split('\n').pop()?.length ?? 0) : ch;
        return { line, ch: col };
    }

    function extractBalancedArgs(src: string, startIndex: number): string[] | null {
        let i = startIndex;
        while (i < src.length && src[i] !== '(') i++;
        if (i >= src.length) return null;
        i++;

        const args: string[] = [];
        let depth = 1;
        let current = '';
        let inSingleQuote = false;
        let inDoubleQuote = false;
        let inRegex = false;

        while (i < src.length && depth > 0) {
            const c = src[i];
            if (inSingleQuote) {
                current += c;
                if (c === '\\' && i + 1 < src.length) { current += src[++i]; }
                else if (c === "'") { inSingleQuote = false; }
            } else if (inDoubleQuote) {
                current += c;
                if (c === '\\' && i + 1 < src.length) { current += src[++i]; }
                else if (c === '"') { inDoubleQuote = false; }
            } else if (inRegex) {
                current += c;
                if (c === '\\' && i + 1 < src.length) { current += src[++i]; }
                else if (c === '/') { inRegex = false; }
            } else if (c === "'") {
                inSingleQuote = true;
                current += c;
            } else if (c === '"') {
                inDoubleQuote = true;
                current += c;
            } else if (c === '/' && isRegexStart(current)) {
                inRegex = true;
                current += c;
            } else if (c === '(' || c === '[' || c === '{') {
                depth++;
                current += c;
            } else if (c === ')' || c === ']' || c === '}') {
                depth--;
                if (depth === 0) {
                    args.push(current.trim());
                } else {
                    current += c;
                }
            } else if (c === ',' && depth === 1) {
                args.push(current.trim());
                current = '';
            } else {
                current += c;
            }
            i++;
        }
        return depth === 0 ? args : null;
    }

    function isRegexStart(preceding: string): boolean {
        const trimmed = preceding.trimEnd();
        if (trimmed.length === 0) return true;
        const last = trimmed[trimmed.length - 1];
        return '(,=[!&|?:;{~^'.includes(last);
    }

    function findAllCalls(src: string, funcName: string): { index: number; args: string[] }[] {
        const results: { index: number; args: string[] }[] = [];
        const pattern = new RegExp(`(?:^|[^a-zA-Z_])${funcName}(?![a-zA-Z_])\\(`, 'gm');
        let m;
        while ((m = pattern.exec(src)) !== null) {
            const callStart = m.index + m[0].indexOf(funcName);
            const args = extractBalancedArgs(src, callStart);
            if (args) results.push({ index: callStart, args });
        }
        return results;
    }

    for (const call of findAllCalls(source, 'testMotion')) {
        if (call.args.length < 3) continue;
        const name = 'vim_' + stripQuotes(call.args[0]);
        try {
            const keysVal = evalInContext(call.args[1], ctx);
            const endPos = evalInContext(call.args[2], ctx) as { line: number; ch: number };
            const startPos = call.args.length >= 4
                ? evalInContext(call.args[3], ctx) as { line: number; ch: number }
                : { line: 0, ch: 0 };
            suites.motions.push({
                name, content: code, cursor: startPos,
                keys: keysToString(keysVal as string | string[]),
                expectedCursor: endPos,
            });
        } catch (e) {
            process.stderr.write(`SKIP testMotion('${stripQuotes(call.args[0])}'): ${e}\n`);
        }
    }

    for (const call of findAllCalls(source, 'testMotionWithFolding')) {
        if (call.args.length < 4) continue;
        const name = 'vim_' + stripQuotes(call.args[0]);
        try {
            const keysVal = evalInContext(call.args[1], ctx);
            const endPos = evalInContext(call.args[2], ctx) as { line: number; ch: number };
            const startPos = evalInContext(call.args[3], ctx) as { line: number; ch: number };
            suites.motionsWithFolding.push({
                name, content: code, cursor: startPos,
                keys: keysToString(keysVal as string | string[]),
                expectedCursor: endPos,
            });
        } catch (e) {
            process.stderr.write(`SKIP testMotionWithFolding('${stripQuotes(call.args[0])}'): ${e}\n`);
        }
    }

    for (const call of findAllCalls(source, 'testJumplist')) {
        if (call.args.length < 4) continue;
        const name = 'vim_' + stripQuotes(call.args[0]);
        try {
            const keysVal = evalInContext(call.args[1], ctx) as string[];
            const endRaw = evalInContext(call.args[2], ctx);
            const endPos = Array.isArray(endRaw)
                ? { line: endRaw[0] as number, ch: endRaw[1] as number }
                : endRaw as { line: number; ch: number };
            const startRaw = evalInContext(call.args[3], ctx);
            const startPos = Array.isArray(startRaw)
                ? { line: startRaw[0] as number, ch: startRaw[1] as number }
                : startRaw as { line: number; ch: number };
            suites.jumplist.push({
                name, content: jumplistScene, cursor: startPos,
                keys: keysToString(keysVal),
                expectedCursor: endPos,
            });
        } catch (e) {
            process.stderr.write(`SKIP testJumplist('${stripQuotes(call.args[0])}'): ${e}\n`);
        }
    }

    for (const call of findAllCalls(source, 'testEdit')) {
        if (call.args.length < 5) continue;
        const name = 'vim_' + stripQuotes(call.args[0]);
        try {
            const before = evalInContext(call.args[1], ctx) as string;
            const posRegex = evalInContext(call.args[2], ctx) as RegExp;
            const editKeys = evalInContext(call.args[3], ctx) as string;
            const after = evalInContext(call.args[4], ctx) as string;
            const cursor = cursorFromRegex(before, posRegex);
            suites.edits.push({
                name, content: before, cursor,
                keys: editKeys, expectedContent: after,
            });
        } catch (e) {
            process.stderr.write(`SKIP testEdit('${stripQuotes(call.args[0])}'): ${e}\n`);
        }
    }

    for (const call of findAllCalls(source, 'testSelection')) {
        if (call.args.length < 5) continue;
        const name = 'vim_' + stripQuotes(call.args[0]);
        try {
            const before = evalInContext(call.args[1], ctx) as string;
            const posRegex = evalInContext(call.args[2], ctx) as RegExp;
            const keys = evalInContext(call.args[3], ctx) as string;
            const expectedSel = evalInContext(call.args[4], ctx) as string;
            const cursor = cursorFromRegex(before, posRegex);
            suites.selections.push({
                name, content: before, cursor,
                keys, expectedSelection: expectedSel,
            });
        } catch (e) {
            process.stderr.write(`SKIP testSelection('${stripQuotes(call.args[0])}'): ${e}\n`);
        }
    }

    for (const call of findAllCalls(source, 'testSubstitute')) {
        if (call.args.length < 2) continue;
        const name = stripQuotes(call.args[0]);
        if (name === 'name') continue;
        try {
            const optsStr = call.args[1];
            const value = extractProperty(optsStr, 'value');
            const expectedValue = extractProperty(optsStr, 'expectedValue');
            const expr = extractProperty(optsStr, 'expr');
            const noPcreExpr = extractProperty(optsStr, 'noPcreExpr');

            if (value !== null && expectedValue !== null && expr !== null) {
                suites.substitutes.push({
                    name: 'vim_' + name + '_pcre',
                    content: value, cursor: { line: 1, ch: 0 },
                    keys: ':' + expr + '\n', expectedContent: expectedValue,
                });
                suites.substitutes.push({
                    name: 'vim_' + name + '_nopcre',
                    content: value, cursor: { line: 1, ch: 0 },
                    keys: ':' + (noPcreExpr ?? expr) + '\n', expectedContent: expectedValue,
                });
            }
        } catch (e) {
            process.stderr.write(`SKIP testSubstitute('${name}'): ${e}\n`);
        }
    }

    for (const call of findAllCalls(source, 'testSubstituteConfirm')) {
        if (call.args.length < 6) continue;
        const name = 'vim_' + stripQuotes(call.args[0]);
        if (name === 'vim_name') continue;
        try {
            const command = evalInContext(call.args[1], ctx) as string;
            const initialValue = evalInContext(call.args[2], ctx) as string;
            const expectedValue = evalInContext(call.args[3], ctx) as string;
            const keys = evalInContext(call.args[4], ctx) as string;
            const finalPos = evalInContext(call.args[5], ctx) as { line: number; ch: number };
            suites.substituteConfirms.push({
                name, content: initialValue,
                cursor: { line: 0, ch: 0 },
                keys: ':' + command + '\n' + keys,
                expectedContent: expectedValue,
                expectedCursor: finalPos,
            });
        } catch (e) {
            process.stderr.write(`SKIP testSubstituteConfirm('${stripQuotes(call.args[0])}'): ${e}\n`);
        }
    }

    return suites;
}

function stripQuotes(s: string): string {
    if ((s.startsWith("'") && s.endsWith("'")) || (s.startsWith('"') && s.endsWith('"'))) {
        return s.slice(1, -1);
    }
    return s;
}

function evalInContext(expr: string, ctx: Record<string, unknown>): unknown {
    const keys = Object.keys(ctx);
    const vals = keys.map(k => ctx[k]);
    const fn = new Function(...keys, `return (${expr});`);
    return fn(...vals);
}

function unescapeJsString(s: string): string {
    return s
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\r/g, '\r')
        .replace(/\\\\/g, '\\')
        .replace(/\\'/g, "'")
        .replace(/\\"/g, '"');
}

function extractProperty(optsStr: string, prop: string): string | null {
    const pattern = new RegExp(`${prop}\\s*:\\s*'((?:[^'\\\\]|\\\\.)*)'`);
    const match = pattern.exec(optsStr);
    if (match) return unescapeJsString(match[1]);
    return null;
}

function main() {
    const suites = extract();
    const defDir = path.resolve(__dirname, 'definitions');
    if (!fs.existsSync(defDir)) fs.mkdirSync(defDir, { recursive: true });

    const stats: Record<string, number> = {};

    for (const [suiteName, cases] of Object.entries(suites)) {
        const filePath = path.join(defDir, `${suiteName}.json`);
        fs.writeFileSync(filePath, JSON.stringify(cases, null, 2) + '\n');
        stats[suiteName] = (cases as unknown[]).length;
        process.stderr.write(`${suiteName}: ${(cases as unknown[]).length} definitions\n`);
    }

    const total = Object.values(stats).reduce((a, b) => a + b, 0);
    process.stderr.write(`\nTotal: ${total} definitions extracted\n`);
}

main();

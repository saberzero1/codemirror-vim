import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { NeovimClient } from './client.js';
import { saveGoldenFile, type GoldenCase, type GoldenFile, type StepResult } from './golden.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function withTimeout<T>(fn: () => Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms);
        fn().then(
            (val) => { clearTimeout(timer); resolve(val); },
            (err) => { clearTimeout(timer); reject(err); },
        );
    });
}

interface TestDefinition {
    name: string;
    content: string;
    cursor: { line: number; ch: number };
    steps?: Array<
        | { type: 'keys'; keys: string }
        | { type: 'setCursor'; line: number; ch: number }
        | { type: 'setRegister'; register: string; text: string; linewise: boolean }
    >;
    keys?: string;
}

function clampCursor(content: string, line: number, ch: number): { line: number; ch: number } {
    const contentLines = content.split('\n');
    const clampedLine = Math.min(line, Math.max(0, contentLines.length - 1));
    const lineLen = contentLines[clampedLine]?.length ?? 0;
    const clampedCh = Math.min(ch, Math.max(0, lineLen - 1));
    return { line: clampedLine, ch: clampedCh };
}

function getKeysFromSteps(steps: TestDefinition['steps']): string {
    if (!steps) return '';
    return steps
        .filter(step => step.type === 'keys')
        .map(step => (step.type === 'keys' ? step.keys : ''))
        .join('');
}

async function recordSuite(
    nvim: NeovimClient,
    suiteName: string,
    cases: TestDefinition[],
    nvimVersion: string,
): Promise<{ recorded: number; skipped: number }> {
    const goldenCases: GoldenCase[] = [];
    let skipped = 0;

    for (const tc of cases) {
        process.stderr.write(`  ${tc.name}...`);
        try {
            const result = await withTimeout(async () => {
                await nvim.input('<Esc><Esc>');
                await nvim.setContent(tc.content);
                const initialCursor = clampCursor(tc.content, tc.cursor.line, tc.cursor.ch);
                await nvim.setCursor(initialCursor.line, initialCursor.ch);

                const stepResults: StepResult[] = [];
                if (tc.steps && tc.steps.length > 0) {
                    for (const step of tc.steps) {
                        if (step.type === 'setCursor') {
                            const currentContent = await nvim.getContent();
                            const cursor = clampCursor(currentContent, step.line, step.ch);
                            await nvim.setCursor(cursor.line, cursor.ch);
                        } else if (step.type === 'keys') {
                            await nvim.input(step.keys);
                            stepResults.push({
                                content: await nvim.getContent(),
                                cursor: await nvim.getCursor(),
                                mode: await nvim.getMode(),
                            });
                        } else if (step.type === 'setRegister') {
                            await nvim.setRegister(step.register, step.text, step.linewise ? 'l' : 'c');
                        }
                    }
                } else if (tc.keys) {
                    await nvim.input(tc.keys);
                }

                return {
                    content: await nvim.getContent(),
                    cursor: await nvim.getCursor(),
                    mode: await nvim.getMode(),
                    stepResults: stepResults.length > 0 ? stepResults : undefined,
                };
            }, 10000);

            goldenCases.push({
                name: tc.name,
                initial: { content: tc.content, cursor: tc.cursor },
                keys: tc.keys ?? getKeysFromSteps(tc.steps),
                result: { content: result.content, cursor: result.cursor, mode: result.mode },
                stepResults: result.stepResults,
            });
            process.stderr.write(' ok\n');
        } catch (e) {
            process.stderr.write(` SKIP: ${e}\n`);
            skipped++;
            try {
                await withTimeout(() => nvim.stop(), 2000);
            } catch {
                nvim.kill();
            }
            try {
                await nvim.start();
            } catch {
                process.stderr.write('  Failed to restart Neovim, aborting suite\n');
                break;
            }
        }
    }

    if (goldenCases.length > 0) {
        saveGoldenFile({
            suite: suiteName,
            neovim_version: nvimVersion,
            recorded_at: new Date().toISOString(),
            cases: goldenCases,
        });
    }

    process.stderr.write(
        `Recorded ${goldenCases.length} cases for ${suiteName} (${skipped} skipped)\n`,
    );
    return { recorded: goldenCases.length, skipped };
}

async function main() {
    const filterSuite = process.argv
        .find((a) => a.startsWith('--suite='))
        ?.split('=')[1];

    const defDir = path.resolve(__dirname, 'definitions');
    if (!fs.existsSync(defDir)) {
        process.stderr.write('No definitions found. Run extract-definitions.ts first.\n');
        process.exit(1);
    }

    const suiteFiles = fs.readdirSync(defDir).filter(f => f.endsWith('.json'));
    if (suiteFiles.length === 0) {
        process.stderr.write('No definition files found.\n');
        process.exit(1);
    }

    const nvim = new NeovimClient();
    await nvim.start();
    const nvimVersion = await nvim.getVersion();
    process.stderr.write(`Neovim ${nvimVersion}\n\n`);

    let totalRecorded = 0;
    let totalSkipped = 0;

    for (const file of suiteFiles) {
        const suiteName = path.basename(file, '.json');
        if (filterSuite && suiteName !== filterSuite) continue;

        const cases = JSON.parse(
            fs.readFileSync(path.join(defDir, file), 'utf-8'),
        ) as TestDefinition[];

        process.stderr.write(`\n=== ${suiteName} (${cases.length} tests) ===\n`);
        const { recorded, skipped } = await recordSuite(nvim, suiteName, cases, nvimVersion);
        totalRecorded += recorded;
        totalSkipped += skipped;
    }

    await nvim.stop();
    process.stderr.write(`\nDone. ${totalRecorded} recorded, ${totalSkipped} skipped.\n`);
}

main().catch((err) => {
    process.stderr.write(String(err) + '\n');
    process.exit(1);
});

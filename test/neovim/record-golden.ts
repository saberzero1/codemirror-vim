import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { NeovimClient } from './client.js';
import { saveGoldenFile, type GoldenCase, type GoldenFile } from './golden.js';

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
    keys: string;
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
                await nvim.setContent(tc.content);
                const contentLines = tc.content.split('\n');
                const clampedLine = Math.min(tc.cursor.line, contentLines.length - 1);
                const lineLen = contentLines[clampedLine]?.length ?? 0;
                const clampedCh = Math.min(tc.cursor.ch, Math.max(0, lineLen - 1));
                await nvim.setCursor(clampedLine, clampedCh);
                await nvim.input(tc.keys);

                return {
                    content: await nvim.getContent(),
                    cursor: await nvim.getCursor(),
                    mode: await nvim.getMode(),
                };
            }, 5000);

            goldenCases.push({
                name: tc.name,
                initial: { content: tc.content, cursor: tc.cursor },
                keys: tc.keys,
                result,
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

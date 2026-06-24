import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { loadAllGoldenFiles, type GoldenCase, type GoldenFile } from './golden.js';
import { isKnownDeviation } from './deviations.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface CompareResult {
    name: string;
    status: 'pass' | 'diff' | 'known-deviation';
    diffs: string[];
    deviation?: string;
}

interface SuiteReport {
    suite: string;
    total: number;
    pass: number;
    diff: number;
    knownDeviation: number;
    results: CompareResult[];
}

interface DefinitionWithExpected {
    name: string;
    expectedContent?: string;
    expectedCursor?: { line: number; ch: number };
    expectedSelection?: string;
}

function loadDefinitions(suiteName: string): DefinitionWithExpected[] {
    const defPath = path.resolve(__dirname, 'definitions', `${suiteName}.json`);
    if (!fs.existsSync(defPath)) return [];
    return JSON.parse(fs.readFileSync(defPath, 'utf-8'));
}

function compareSuite(golden: GoldenFile): SuiteReport {
    const definitions = loadDefinitions(golden.suite);
    const defMap = new Map<string, DefinitionWithExpected>();
    for (const d of definitions) defMap.set(d.name, d);

    const results: CompareResult[] = [];

    for (const gc of golden.cases) {
        const diffs: string[] = [];
        const def = defMap.get(gc.name);

        if (def?.expectedContent !== undefined) {
            if (gc.result.content !== def.expectedContent) {
                diffs.push(
                    `content: neovim=${JSON.stringify(gc.result.content)} fork-expects=${JSON.stringify(def.expectedContent)}`,
                );
            }
        }

        if (def?.expectedCursor !== undefined) {
            if (
                gc.result.cursor.line !== def.expectedCursor.line ||
                gc.result.cursor.ch !== def.expectedCursor.ch
            ) {
                diffs.push(
                    `cursor: neovim=${JSON.stringify(gc.result.cursor)} fork-expects=${JSON.stringify(def.expectedCursor)}`,
                );
            }
        }

        const deviation = isKnownDeviation(gc.name);
        let status: CompareResult['status'];
        if (diffs.length === 0) {
            status = 'pass';
        } else if (deviation) {
            status = 'known-deviation';
        } else {
            status = 'diff';
        }

        results.push({
            name: gc.name,
            status,
            diffs,
            deviation: deviation?.description,
        });
    }

    return {
        suite: golden.suite,
        total: results.length,
        pass: results.filter(r => r.status === 'pass').length,
        diff: results.filter(r => r.status === 'diff').length,
        knownDeviation: results.filter(r => r.status === 'known-deviation').length,
        results,
    };
}

function main() {
    const goldenFiles = loadAllGoldenFiles();
    if (goldenFiles.length === 0) {
        process.stderr.write('No golden files found. Run record-golden.ts first.\n');
        process.exit(1);
    }

    const verbose = process.argv.includes('--verbose');
    const reports: SuiteReport[] = [];
    let totalPass = 0;
    let totalDiff = 0;
    let totalKnown = 0;
    let totalTests = 0;

    for (const golden of goldenFiles) {
        const report = compareSuite(golden);
        reports.push(report);

        console.log(`\n=== ${report.suite} (${report.total} tests) ===`);
        for (const r of report.results) {
            if (r.status === 'pass') {
                if (verbose) console.log(`  PASS: ${r.name}`);
            } else if (r.status === 'known-deviation') {
                console.log(`  KNOWN: ${r.name} — ${r.deviation}`);
                if (verbose) for (const d of r.diffs) console.log(`    ${d}`);
            } else {
                console.log(`  DIFF: ${r.name}`);
                for (const d of r.diffs) console.log(`    ${d}`);
            }
        }

        totalPass += report.pass;
        totalDiff += report.diff;
        totalKnown += report.knownDeviation;
        totalTests += report.total;
    }

    console.log(`\n========================================`);
    console.log(`Summary: ${totalTests} tests`);
    console.log(`  Pass: ${totalPass}`);
    console.log(`  Diff: ${totalDiff}`);
    console.log(`  Known deviations: ${totalKnown}`);
    console.log(`========================================`);

    if (totalDiff > 0 && !process.argv.includes('--no-fail')) {
        process.exit(1);
    }
}

main();

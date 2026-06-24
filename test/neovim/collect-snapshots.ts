import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface Snapshot {
    name: string;
    initialContent: string;
    initialCursor: { line: number; ch: number };
    keySequence: string[];
    finalContent: string;
    finalCursor: { line: number; ch: number };
    finalMode: string;
    error: string | null;
}

interface TestDefinition {
    name: string;
    content: string;
    cursor: { line: number; ch: number };
    keys: string;
    expectedContent?: string;
    expectedCursor?: { line: number; ch: number };
}

const KEY_MAP: Record<string, string> = {
    'Shift-Space': '<S-Space>',
};

function translateKey(key: string): string {
    if (KEY_MAP[key]) return KEY_MAP[key];
    if (key.length === 1) return key;
    if (key.startsWith('<') && key.endsWith('>')) return key;
    if (key === 'Space') return '<Space>';
    if (key === 'Enter' || key === 'Return') return '<CR>';
    if (key === 'Backspace') return '<BS>';
    if (key === 'Delete') return '<Del>';
    if (key === 'Escape') return '<Esc>';
    if (key === 'Tab') return '<Tab>';
    if (/^(Ctrl|Shift|Alt)-/.test(key)) return '<' + key.replace('Ctrl-', 'C-').replace('Shift-', 'S-').replace('Alt-', 'A-') + '>';
    return key;
}

function snapshotToDefinition(snap: Snapshot): TestDefinition | null {
    if (snap.keySequence.length === 0) return null;

    const keys = snap.keySequence.map(translateKey).join('');

    return {
        name: snap.name,
        content: snap.initialContent,
        cursor: snap.initialCursor,
        keys,
        expectedContent: snap.finalContent,
        expectedCursor: snap.finalCursor,
    };
}

async function main() {
    const { gatherTests, createTestServer } = await import('@marijn/testtool');
    const { Builder, By, until } = await import('selenium-webdriver');
    const chrome = await import('selenium-webdriver/chrome.js');

    const root = path.resolve(__dirname, '..', '..');
    const testFile = path.resolve(root, 'test', 'webtest-vim-instrumented.js');

    if (!fs.existsSync(testFile)) {
        process.stderr.write('Instrumented test file not found\n');
        process.exit(1);
    }

    process.stderr.write('Starting test server...\n');
    const server = createTestServer({
        files: [testFile],
        root,
        selenium: true,
    });
    const port = server.address().port;
    process.stderr.write(`Test server on port ${port}\n`);

    process.stderr.write('Launching headless Chrome...\n');
    const options = new chrome.Options().addArguments('--headless=new', '--no-sandbox', '--disable-gpu');
    if (process.env.CHROME_BIN) {
        options.setChromeBinaryPath(process.env.CHROME_BIN);
    }
    const driver = await new Builder()
        .forBrowser('chrome')
        .setChromeOptions(options)
        .build();

    try {
        const url = `http://localhost:${port}/`;
        process.stderr.write(`Navigating to ${url}\n`);
        await driver.get(url);

        process.stderr.write('Waiting for tests to complete...\n');
        await driver.wait(until.elementLocated(By.css('pre.test-result')), 300000);
        process.stderr.write('Tests complete. Collecting snapshots...\n');

        const snapshots = await driver.executeScript(
            'return window.__neovimSnapshots || []'
        ) as Snapshot[];

        process.stderr.write(`Collected ${snapshots.length} snapshots\n`);

        const phase1Names = loadPhase1Names();
        const newSnapshots = snapshots.filter(s => !phase1Names.has(s.name));
        process.stderr.write(`${newSnapshots.length} new (not in Phase 1)\n`);

        const definitions: TestDefinition[] = [];
        let skipped = 0;
        for (const snap of newSnapshots) {
            const def = snapshotToDefinition(snap);
            if (def) {
                definitions.push(def);
            } else {
                skipped++;
            }
        }
        process.stderr.write(`${definitions.length} converted to definitions, ${skipped} skipped (no keys)\n`);

        const outPath = path.resolve(__dirname, 'definitions', 'vim-general.json');
        fs.writeFileSync(outPath, JSON.stringify(definitions, null, 2) + '\n');
        process.stderr.write(`Written to ${outPath}\n`);

        const errored = newSnapshots.filter(s => s.error);
        if (errored.length > 0) {
            process.stderr.write(`\n${errored.length} tests had errors:\n`);
            for (const s of errored.slice(0, 20)) {
                process.stderr.write(`  ${s.name}: ${s.error}\n`);
            }
            if (errored.length > 20) {
                process.stderr.write(`  ... and ${errored.length - 20} more\n`);
            }
        }
    } finally {
        await driver.quit();
        server.close();
    }
}

function loadPhase1Names(): Set<string> {
    const defDir = path.resolve(__dirname, 'definitions');
    const names = new Set<string>();
    if (!fs.existsSync(defDir)) return names;

    for (const file of fs.readdirSync(defDir)) {
        if (file === 'vim-general.json' || !file.endsWith('.json')) continue;
        try {
            const data = JSON.parse(fs.readFileSync(path.join(defDir, file), 'utf-8'));
            if (Array.isArray(data)) {
                for (const d of data) {
                    if (d.name) names.add(d.name);
                }
            }
        } catch {
            // skip malformed files
        }
    }
    return names;
}

main().catch((err) => {
    process.stderr.write(String(err) + '\n');
    process.exit(1);
});

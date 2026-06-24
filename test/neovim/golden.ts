import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface StepResult {
    content: string;
    cursor: { line: number; ch: number };
    mode: string;
}

export interface GoldenCase {
    name: string;
    initial: { content: string; cursor: { line: number; ch: number } };
    keys: string;
    result: {
        content: string;
        cursor: { line: number; ch: number };
        mode: string;
    };
    stepResults?: StepResult[];
}

export interface GoldenFile {
    suite: string;
    neovim_version: string;
    recorded_at: string;
    cases: GoldenCase[];
}

const GOLDEN_DIR = path.resolve(__dirname, 'golden-data');

export function loadGoldenFile(suite: string): GoldenFile | null {
    const filePath = path.join(GOLDEN_DIR, `${suite}.json`);
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as GoldenFile;
}

export function saveGoldenFile(data: GoldenFile): void {
    if (!fs.existsSync(GOLDEN_DIR))
        fs.mkdirSync(GOLDEN_DIR, { recursive: true });
    const filePath = path.join(GOLDEN_DIR, `${data.suite}.json`);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 4) + '\n');
}

export function loadAllGoldenFiles(): GoldenFile[] {
    if (!fs.existsSync(GOLDEN_DIR)) return [];
    return fs.readdirSync(GOLDEN_DIR)
        .filter(f => f.endsWith('.json'))
        .map(f => JSON.parse(fs.readFileSync(path.join(GOLDEN_DIR, f), 'utf-8')) as GoldenFile);
}

#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const ALLOWLIST_PATH = path.join(ROOT, 'security', 'secret-scan-allowlist.json');

const SKIP_PREFIXES = [
    '.git/',
    'node_modules/',
    'coverage/',
    'dist/',
    'playwright-report/',
    'test-results/',
    'output/',
];

const SKIP_EXTENSIONS = new Set([
    '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.pdf',
    '.zip', '.tar', '.gz', '.7z', '.mp3', '.mp4', '.mov', '.woff',
    '.woff2', '.ttf', '.eot', '.sqlite', '.db',
]);

const SECRET_PATTERNS = [
    {
        name: 'Telegram bot token',
        regex: /\b\d{6,}:[A-Za-z0-9_-]{20,}\b/g,
    },
    {
        name: 'OpenAI-style API key',
        regex: /\bsk-(?:proj-|live-|test-)?[A-Za-z0-9_-]{20,}\b/g,
    },
    {
        name: 'Anthropic API key',
        regex: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g,
    },
    {
        name: 'GitHub personal token',
        regex: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
    },
    {
        name: 'AWS access key',
        regex: /\bAKIA[0-9A-Z]{16}\b/g,
    },
];

function loadAllowlist() {
    if (!fs.existsSync(ALLOWLIST_PATH)) return [];
    try {
        const parsed = JSON.parse(fs.readFileSync(ALLOWLIST_PATH, 'utf8'));
        if (!Array.isArray(parsed.allowlist)) return [];
        return parsed.allowlist.map((item) => ({
            path: String(item.path || '').trim(),
            pattern: String(item.pattern || '').trim(),
            note: String(item.note || '').trim(),
        }));
    } catch {
        return [];
    }
}

function getTrackedFiles() {
    const result = spawnSync('git', ['ls-files'], {
        cwd: ROOT,
        encoding: 'utf8',
    });
    if (result.status !== 0) {
        console.error('[security:scan] git ls-files failed.');
        process.exit(2);
    }
    return result.stdout.split('\n').map((line) => line.trim()).filter(Boolean);
}

function shouldSkip(relPath) {
    if (SKIP_PREFIXES.some((prefix) => relPath.startsWith(prefix))) return true;
    if (SKIP_EXTENSIONS.has(path.extname(relPath).toLowerCase())) return true;
    return false;
}

function isProbablyText(buffer) {
    const probe = buffer.subarray(0, Math.min(buffer.length, 1024));
    return !probe.includes(0);
}

function lineNumberFromIndex(content, index) {
    return content.slice(0, index).split('\n').length;
}

function isAllowlisted(finding, allowlist) {
    return allowlist.some((entry) => {
        if (entry.path && entry.path !== finding.path) return false;
        if (entry.pattern && entry.pattern !== finding.pattern) return false;
        return true;
    });
}

function mask(value) {
    if (!value) return '';
    if (value.length <= 10) return '***';
    return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function main() {
    const allowlist = loadAllowlist();
    const findings = [];
    const files = getTrackedFiles();

    files.forEach((relPath) => {
        if (shouldSkip(relPath)) return;
        const absPath = path.join(ROOT, relPath);
        let raw;
        try {
            raw = fs.readFileSync(absPath);
        } catch {
            return;
        }
        if (!isProbablyText(raw)) return;
        const content = raw.toString('utf8');

        SECRET_PATTERNS.forEach((patternDef) => {
            const regex = new RegExp(patternDef.regex.source, patternDef.regex.flags);
            let match = regex.exec(content);
            while (match) {
                findings.push({
                    path: relPath,
                    line: lineNumberFromIndex(content, match.index),
                    pattern: patternDef.name,
                    sample: mask(match[0]),
                });
                match = regex.exec(content);
            }
        });
    });

    const effectiveFindings = findings.filter((finding) => !isAllowlisted(finding, allowlist));

    if (effectiveFindings.length === 0) {
        console.log(`[security:scan] OK (${files.length} files scanned, no secrets found).`);
        return;
    }

    console.error(`[security:scan] Found ${effectiveFindings.length} potential secret(s):`);
    effectiveFindings.forEach((finding, index) => {
        console.error(
            `${index + 1}. ${finding.path}:${finding.line} - ${finding.pattern} (${finding.sample})`
        );
    });
    process.exit(1);
}

main();

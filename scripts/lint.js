#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const TARGET_DIRS = ['src', 'scripts', 'test'];
const JS_EXTENSIONS = new Set(['.js', '.cjs', '.mjs']);

function walk(dir, files = []) {
    if (!fs.existsSync(dir)) return files;
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    entries.forEach((entry) => {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            walk(fullPath, files);
            return;
        }

        if (JS_EXTENSIONS.has(path.extname(entry.name))) {
            files.push(fullPath);
        }
    });

    return files;
}

function relative(filePath) {
    return path.relative(ROOT, filePath);
}

const files = TARGET_DIRS.flatMap((dir) => walk(path.join(ROOT, dir))).sort();

if (files.length === 0) {
    console.log('No JavaScript files found to lint.');
    process.exit(0);
}

let failures = 0;

files.forEach((filePath) => {
    const result = spawnSync(process.execPath, ['--check', filePath], {
        cwd: ROOT,
        encoding: 'utf8',
    });

    if (result.status !== 0) {
        failures += 1;
        console.error(`\n[lint] Syntax error in ${relative(filePath)}`);
        if (result.stderr) console.error(result.stderr.trim());
    }
});

if (failures > 0) {
    console.error(`\nLint failed: ${failures} file(s) contain syntax errors.`);
    process.exit(1);
}

console.log(`Lint passed: ${files.length} file(s) checked.`);

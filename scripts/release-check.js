#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const {
    parsePackJsonOutput,
    evaluatePackReport,
    normalizeRequiredFiles,
} = require('../src/release/readiness');

const ROOT = path.resolve(__dirname, '..');
const PACKAGE_JSON_PATH = path.join(ROOT, 'package.json');
const CHANGELOG_PATH = path.join(ROOT, 'CHANGELOG.md');

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function isSemverLike(version) {
    return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(String(version || '').trim());
}

function isExecutable(filePath) {
    if (process.platform === 'win32') return true;
    const mode = fs.statSync(filePath).mode & 0o777;
    return (mode & 0o111) !== 0;
}

function runNpmPackDryRun() {
    const result = spawnSync('npm', ['pack', '--dry-run', '--json'], {
        cwd: ROOT,
        encoding: 'utf8',
    });
    return {
        status: result.status,
        stdout: result.stdout || '',
        stderr: result.stderr || '',
    };
}

function main() {
    const errors = [];
    const warnings = [];

    const pkg = readJson(PACKAGE_JSON_PATH);
    const version = pkg.version;
    if (!isSemverLike(version)) {
        errors.push(`package.json version is not semver-like: "${version}"`);
    }

    const binTarget = pkg?.bin?.nichebot ? String(pkg.bin.nichebot) : null;
    if (!binTarget) {
        errors.push('package.json bin.nichebot is missing.');
    } else {
        const binPath = path.join(ROOT, binTarget);
        if (!fs.existsSync(binPath)) {
            errors.push(`bin target not found: ${binTarget}`);
        } else if (!isExecutable(binPath)) {
            errors.push(`bin target is not executable: ${binTarget}`);
        }
    }

    if (!fs.existsSync(CHANGELOG_PATH)) {
        errors.push('CHANGELOG.md not found.');
    } else {
        const changelog = fs.readFileSync(CHANGELOG_PATH, 'utf8');
        if (!changelog.includes('## [Unreleased]')) {
            errors.push('CHANGELOG.md missing "## [Unreleased]" section.');
        }
    }

    const packResult = runNpmPackDryRun();
    if (packResult.status !== 0) {
        errors.push('npm pack --dry-run failed.');
        if (packResult.stderr) {
            warnings.push(packResult.stderr.trim());
        }
    } else {
        const entries = parsePackJsonOutput(packResult.stdout);
        if (entries.length === 0) {
            errors.push('npm pack --dry-run returned no manifest entries.');
        } else {
            const requiredFiles = normalizeRequiredFiles([
                '.env.example',
                'README.md',
                'LICENSE',
                'SECURITY.md',
                'CODE_OF_CONDUCT.md',
                'src/cli.js',
                'src/index.js',
            ]);
            const report = evaluatePackReport(entries[0], {
                requiredFiles,
                maxPackedSizeBytes: 1024 * 1024,
                maxUnpackedSizeBytes: 2 * 1024 * 1024,
            });
            errors.push(...report.errors);
            warnings.push(...report.warnings);

            console.log('[release:check] pack metrics');
            console.log(`  package: ${report.metrics.packageName}@${report.metrics.packageVersion}`);
            console.log(`  tarball: ${report.metrics.tarball}`);
            console.log(`  files: ${report.metrics.files}`);
            console.log(`  packedSize: ${report.metrics.packedSize}`);
            console.log(`  unpackedSize: ${report.metrics.unpackedSize}`);
        }
    }

    if (warnings.length > 0) {
        console.log('\n[release:check] warnings');
        warnings.forEach((warning, idx) => {
            console.log(`  ${idx + 1}. ${warning}`);
        });
    }

    if (errors.length > 0) {
        console.error('\n[release:check] failed');
        errors.forEach((error, idx) => {
            console.error(`  ${idx + 1}. ${error}`);
        });
        process.exit(1);
    }

    console.log('\n[release:check] OK');
}

main();

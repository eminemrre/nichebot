const assert = require('assert/strict');
const { test } = require('node:test');
const {
    parsePackJsonOutput,
    evaluatePackReport,
    normalizeRequiredFiles,
} = require('../src/release/readiness');

test('parsePackJsonOutput parses npm pack JSON array', () => {
    const raw = JSON.stringify([{ name: 'nichebot', version: '1.2.0', files: [] }]);
    const result = parsePackJsonOutput(raw);
    assert.equal(Array.isArray(result), true);
    assert.equal(result.length, 1);
    assert.equal(result[0].name, 'nichebot');
});

test('normalizeRequiredFiles converts file paths to normalized entries', () => {
    const result = normalizeRequiredFiles(['./README.md', 'src\\cli.js', '', null]);
    assert.deepEqual(result, ['README.md', 'src/cli.js']);
});

test('evaluatePackReport fails when required packaged file is missing', () => {
    const report = evaluatePackReport(
        {
            name: 'nichebot',
            version: '1.2.0',
            size: 1000,
            unpackedSize: 2000,
            files: [{ path: 'README.md', size: 100 }],
        },
        {
            requiredFiles: ['README.md', 'src/cli.js'],
        }
    );

    assert.equal(report.ok, false);
    assert.equal(report.errors.some((e) => e.includes('src/cli.js')), true);
});

test('evaluatePackReport warns when size thresholds are exceeded', () => {
    const report = evaluatePackReport(
        {
            name: 'nichebot',
            version: '1.2.0',
            size: 1000,
            unpackedSize: 3000,
            files: [{ path: 'README.md', size: 100 }],
        },
        {
            requiredFiles: ['README.md'],
            maxPackedSizeBytes: 500,
            maxUnpackedSizeBytes: 1000,
        }
    );

    assert.equal(report.ok, true);
    assert.equal(report.warnings.length >= 1, true);
});

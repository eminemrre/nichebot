const path = require('path');

function parsePackJsonOutput(rawOutput) {
    const text = String(rawOutput || '').trim();
    if (!text) return [];
    try {
        const parsed = JSON.parse(text);
        return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
        return [];
    }
}

function evaluatePackReport(packEntry, options = {}) {
    const requiredFiles = Array.isArray(options.requiredFiles)
        ? options.requiredFiles
        : [];
    const maxUnpackedSizeBytes = Number.isFinite(options.maxUnpackedSizeBytes)
        ? options.maxUnpackedSizeBytes
        : 2 * 1024 * 1024;
    const maxPackedSizeBytes = Number.isFinite(options.maxPackedSizeBytes)
        ? options.maxPackedSizeBytes
        : 1 * 1024 * 1024;

    const errors = [];
    const warnings = [];
    const files = Array.isArray(packEntry?.files) ? packEntry.files : [];
    const packagedPaths = new Set(files.map((item) => item.path));

    requiredFiles.forEach((requiredPath) => {
        const normalized = String(requiredPath || '').replace(/^\.?\//, '');
        if (!normalized) return;
        if (!packagedPaths.has(normalized)) {
            errors.push(`Missing packaged file: ${normalized}`);
        }
    });

    const packedSize = Number(packEntry?.size || 0);
    const unpackedSize = Number(packEntry?.unpackedSize || 0);
    if (packedSize > maxPackedSizeBytes) {
        warnings.push(`Packed size is high (${packedSize} bytes > ${maxPackedSizeBytes}).`);
    }
    if (unpackedSize > maxUnpackedSizeBytes) {
        warnings.push(`Unpacked size is high (${unpackedSize} bytes > ${maxUnpackedSizeBytes}).`);
    }

    return {
        ok: errors.length === 0,
        errors,
        warnings,
        metrics: {
            files: files.length,
            packedSize,
            unpackedSize,
            packageName: packEntry?.name || null,
            packageVersion: packEntry?.version || null,
            tarball: packEntry?.filename || null,
        },
    };
}

function normalizeRequiredFiles(entries = []) {
    return entries
        .map((entry) => String(entry || '').trim())
        .filter(Boolean)
        .map((entry) => entry.replace(/^\.?\//, ''))
        .map((entry) => entry.replace(/\\/g, path.posix.sep));
}

module.exports = {
    parsePackJsonOutput,
    evaluatePackReport,
    normalizeRequiredFiles,
};

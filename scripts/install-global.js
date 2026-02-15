#!/usr/bin/env node

const { runInstallGlobal } = require('../src/runtime/install-global');

function main() {
    const argv = process.argv.slice(2);
    const dryRun = argv.includes('--dry-run');
    const noPathWrite = argv.includes('--no-path-write');

    if (dryRun) {
        console.log('[install:global] Dry run mode enabled.');
    } else {
        console.log('[install:global] Linking nichebot command...');
    }

    const result = runInstallGlobal({
        dryRun,
        noPathWrite,
        cwd: process.cwd(),
        env: process.env,
    });

    console.log(`[install:global] npm global prefix: ${result.after.prefix}`);
    console.log(`[install:global] npm global bin: ${result.after.binDir}`);

    if (result.pathUpdate.alreadyAvailable) {
        console.log('[install:global] PATH already contains npm global bin.');
    } else if (dryRun || noPathWrite) {
        if (result.pathUpdate.wouldUpdate) {
            console.log(`[install:global] PATH entry is missing; target file: ${result.pathUpdate.filePath}`);
            if (noPathWrite) {
                console.log('[install:global] --no-path-write set; PATH file was not modified.');
            } else {
                console.log('[install:global] Dry run; PATH file was not modified.');
            }
            if (result.pathUpdate.reloadHint) {
                console.log(`Reload shell: ${result.pathUpdate.reloadHint}`);
            }
        } else {
            console.log(`[install:global] PATH entry already exists in: ${result.pathUpdate.filePath}`);
            if (result.pathUpdate.reloadHint) {
                console.log(`Reload shell: ${result.pathUpdate.reloadHint}`);
            }
        }
    } else if (result.pathUpdate.updated) {
        console.log(`[install:global] PATH entry added to: ${result.pathUpdate.filePath}`);
        if (result.pathUpdate.reloadHint) {
            console.log(`Reload shell: ${result.pathUpdate.reloadHint}`);
        }
    } else {
        console.log(`[install:global] PATH entry already exists in: ${result.pathUpdate.filePath}`);
        if (result.pathUpdate.reloadHint) {
            console.log(`Reload shell: ${result.pathUpdate.reloadHint}`);
        }
    }

    if (dryRun) {
        console.log(`[install:global] Dry run complete. Expected binary path: ${result.after.binaryPath}`);
        return;
    }

    if (!result.after.binaryExists) {
        throw new Error(`nichebot binary not found after npm link: ${result.after.binaryPath}`);
    }

    console.log(`[install:global] nichebot binary ready: ${result.after.binaryPath}`);
    console.log('[install:global] Done. Try: nichebot doctor');
}

if (require.main === module) {
    try {
        main();
    } catch (error) {
        console.error(`[install:global] Failed: ${error.message}`);
        process.exit(1);
    }
}

module.exports = {
    main,
};

#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

function run(cmd, args, options = {}) {
    const result = spawnSync(cmd, args, {
        encoding: 'utf8',
        stdio: options.capture ? 'pipe' : 'inherit',
    });

    if (result.status !== 0) {
        const stderr = (result.stderr || '').trim();
        const stdout = (result.stdout || '').trim();
        const message = stderr || stdout || `${cmd} ${args.join(' ')} failed`;
        throw new Error(message);
    }

    return result;
}

function getNpmGlobalPrefix() {
    const result = run('npm', ['prefix', '-g'], { capture: true });
    return String(result.stdout || '').trim();
}

function getGlobalBinDir(prefix) {
    if (process.platform === 'win32') return prefix;
    return path.join(prefix, 'bin');
}

function detectShell() {
    const shell = String(process.env.SHELL || '').trim();
    const base = path.basename(shell);
    if (base.includes('fish')) return 'fish';
    if (base.includes('zsh')) return 'zsh';
    if (base.includes('bash')) return 'bash';
    return 'posix';
}

function getRcTarget(shellType) {
    const home = os.homedir();
    if (shellType === 'fish') {
        return {
            filePath: path.join(home, '.config', 'fish', 'config.fish'),
            lineBuilder: (binPath) => `fish_add_path -g "${binPath}"`,
        };
    }

    if (shellType === 'zsh') {
        return {
            filePath: path.join(home, '.zshrc'),
            lineBuilder: (binPath) => `export PATH="${binPath}:$PATH"`,
        };
    }

    if (shellType === 'bash') {
        return {
            filePath: path.join(home, '.bashrc'),
            lineBuilder: (binPath) => `export PATH="${binPath}:$PATH"`,
        };
    }

    return {
        filePath: path.join(home, '.profile'),
        lineBuilder: (binPath) => `export PATH="${binPath}:$PATH"`,
    };
}

function ensurePathEntry(binPath, shellType, options = {}) {
    const dryRun = Boolean(options.dryRun);
    const noPathWrite = Boolean(options.noPathWrite);
    const normalizedPath = path.resolve(binPath);
    const currentPath = String(process.env.PATH || '');
    const pathEntries = currentPath
        .split(path.delimiter)
        .filter(Boolean)
        .map((entry) => path.resolve(entry));

    if (pathEntries.includes(normalizedPath)) {
        return { updated: false, alreadyAvailable: true, filePath: null };
    }

    const target = getRcTarget(shellType);
    const rcDir = path.dirname(target.filePath);
    if (!fs.existsSync(rcDir)) fs.mkdirSync(rcDir, { recursive: true });

    const line = target.lineBuilder(binPath);
    const marker = String(binPath);
    const existing = fs.existsSync(target.filePath)
        ? fs.readFileSync(target.filePath, 'utf8')
        : '';

    const hasPathAlready = existing.includes(marker);
    if (!hasPathAlready && !dryRun && !noPathWrite) {
        const linesToAppend = [
            '',
            '# Added by nichebot install:global',
            line,
            '',
        ].join('\n');
        fs.appendFileSync(target.filePath, linesToAppend, 'utf8');
    }

    return {
        updated: !hasPathAlready && !dryRun && !noPathWrite,
        wouldUpdate: !hasPathAlready,
        alreadyAvailable: false,
        filePath: target.filePath,
    };
}

function getNichebotBinaryPath(binDir) {
    if (process.platform === 'win32') {
        return path.join(binDir, 'nichebot.cmd');
    }
    return path.join(binDir, 'nichebot');
}

function printReloadHint(shellType) {
    if (shellType === 'fish') {
        console.log('Reload shell: exec fish -l');
        return;
    }

    if (shellType === 'zsh') {
        console.log('Reload shell: exec zsh -l');
        return;
    }

    if (shellType === 'bash') {
        console.log('Reload shell: exec bash -l');
        return;
    }

    console.log('Reload shell: exec "$SHELL" -l');
}

function main() {
    const argv = process.argv.slice(2);
    const dryRun = argv.includes('--dry-run');
    const noPathWrite = argv.includes('--no-path-write');

    if (dryRun) {
        console.log('[install:global] Dry run mode enabled.');
    } else {
        console.log('[install:global] Linking nichebot command...');
        run('npm', ['link']);
    }

    const prefix = getNpmGlobalPrefix();
    const binDir = getGlobalBinDir(prefix);
    const shellType = detectShell();

    console.log(`[install:global] npm global prefix: ${prefix}`);
    console.log(`[install:global] npm global bin: ${binDir}`);

    const pathResult = ensurePathEntry(binDir, shellType, { dryRun, noPathWrite });
    if (pathResult.alreadyAvailable) {
        console.log('[install:global] PATH already contains npm global bin.');
    } else if (dryRun || noPathWrite) {
        if (pathResult.wouldUpdate) {
            console.log(`[install:global] PATH entry is missing; target file: ${pathResult.filePath}`);
            if (noPathWrite) {
                console.log('[install:global] --no-path-write set; PATH file was not modified.');
            } else {
                console.log('[install:global] Dry run; PATH file was not modified.');
            }
            printReloadHint(shellType);
        } else {
            console.log(`[install:global] PATH entry already exists in: ${pathResult.filePath}`);
            printReloadHint(shellType);
        }
    } else if (pathResult.updated) {
        console.log(`[install:global] PATH entry added to: ${pathResult.filePath}`);
        printReloadHint(shellType);
    } else {
        console.log(`[install:global] PATH entry already exists in: ${pathResult.filePath}`);
        printReloadHint(shellType);
    }

    const binPath = getNichebotBinaryPath(binDir);
    if (!dryRun && !fs.existsSync(binPath)) {
        throw new Error(`nichebot binary not found after npm link: ${binPath}`);
    }

    if (dryRun) {
        console.log(`[install:global] Dry run complete. Expected binary path: ${binPath}`);
        return;
    }

    console.log(`[install:global] nichebot binary ready: ${binPath}`);
    console.log('[install:global] Done. Try: nichebot doctor');
}

try {
    main();
} catch (error) {
    console.error(`[install:global] Failed: ${error.message}`);
    process.exit(1);
}

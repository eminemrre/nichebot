const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

function runCommand(cmd, args, options = {}) {
    const {
        capture = false,
        allowFailure = false,
        cwd = process.cwd(),
        env = process.env,
        exec = spawnSync,
    } = options;

    const result = exec(cmd, args, {
        encoding: 'utf8',
        stdio: capture ? 'pipe' : 'inherit',
        cwd,
        env,
    });

    if (result.status !== 0 && !allowFailure) {
        const stderr = (result.stderr || '').trim();
        const stdout = (result.stdout || '').trim();
        const message = stderr || stdout || `${cmd} ${args.join(' ')} failed`;
        throw new Error(message);
    }

    return {
        status: Number(result.status ?? 1),
        stdout: String(result.stdout || ''),
        stderr: String(result.stderr || ''),
    };
}

function getNpmGlobalPrefix(options = {}) {
    const result = runCommand('npm', ['prefix', '-g'], { ...options, capture: true });
    return String(result.stdout || '').trim();
}

function getGlobalBinDir(prefix) {
    if (process.platform === 'win32') return prefix;
    return path.join(prefix, 'bin');
}

function detectShell(shellValue = process.env.SHELL || '') {
    const base = path.basename(String(shellValue || '').trim());
    if (base.includes('fish')) return 'fish';
    if (base.includes('zsh')) return 'zsh';
    if (base.includes('bash')) return 'bash';
    return 'posix';
}

function getRcTarget(shellType, homeDir = os.homedir()) {
    if (shellType === 'fish') {
        return {
            filePath: path.join(homeDir, '.config', 'fish', 'config.fish'),
            lineBuilder: (binPath) => `fish_add_path -g "${binPath}"`,
            reloadHint: 'exec fish -l',
        };
    }

    if (shellType === 'zsh') {
        return {
            filePath: path.join(homeDir, '.zshrc'),
            lineBuilder: (binPath) => `export PATH="${binPath}:$PATH"`,
            reloadHint: 'exec zsh -l',
        };
    }

    if (shellType === 'bash') {
        return {
            filePath: path.join(homeDir, '.bashrc'),
            lineBuilder: (binPath) => `export PATH="${binPath}:$PATH"`,
            reloadHint: 'exec bash -l',
        };
    }

    return {
        filePath: path.join(homeDir, '.profile'),
        lineBuilder: (binPath) => `export PATH="${binPath}:$PATH"`,
        reloadHint: 'exec "$SHELL" -l',
    };
}

function getNichebotBinaryPath(binDir) {
    if (process.platform === 'win32') {
        return path.join(binDir, 'nichebot.cmd');
    }
    return path.join(binDir, 'nichebot');
}

function resolveNichebotCommand(options = {}) {
    if (process.platform === 'win32') {
        const result = runCommand('where', ['nichebot'], {
            ...options,
            capture: true,
            allowFailure: true,
        });
        if (result.status !== 0) return null;
        const first = result.stdout
            .split(/\r?\n/)
            .map((line) => line.trim())
            .find(Boolean);
        return first || null;
    }

    const result = runCommand('which', ['nichebot'], {
        ...options,
        capture: true,
        allowFailure: true,
    });
    if (result.status !== 0) return null;
    const first = result.stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find(Boolean);
    return first || null;
}

function pathContainsDir(dirPath, pathValue = process.env.PATH || '') {
    const normalized = path.resolve(String(dirPath || ''));
    const entries = String(pathValue || '')
        .split(path.delimiter)
        .filter(Boolean)
        .map((entry) => path.resolve(entry));
    return entries.includes(normalized);
}

function ensurePathEntry(binPath, shellType, options = {}) {
    const {
        dryRun = false,
        noPathWrite = false,
        homeDir = os.homedir(),
        pathValue = process.env.PATH || '',
    } = options;

    if (pathContainsDir(binPath, pathValue)) {
        return {
            alreadyAvailable: true,
            updated: false,
            wouldUpdate: false,
            filePath: null,
            reloadHint: null,
        };
    }

    const target = getRcTarget(shellType, homeDir);
    const rcDir = path.dirname(target.filePath);
    if (!fs.existsSync(rcDir) && !dryRun && !noPathWrite) {
        fs.mkdirSync(rcDir, { recursive: true });
    }

    const existing = fs.existsSync(target.filePath)
        ? fs.readFileSync(target.filePath, 'utf8')
        : '';
    const marker = String(binPath);
    const hasPathAlready = existing.includes(marker);

    if (!hasPathAlready && !dryRun && !noPathWrite) {
        const linesToAppend = [
            '',
            '# Added by nichebot install:global',
            target.lineBuilder(binPath),
            '',
        ].join('\n');
        fs.appendFileSync(target.filePath, linesToAppend, 'utf8');
    }

    return {
        alreadyAvailable: false,
        updated: !hasPathAlready && !dryRun && !noPathWrite,
        wouldUpdate: !hasPathAlready,
        filePath: target.filePath,
        reloadHint: target.reloadHint,
    };
}

function inspectGlobalInstall(options = {}) {
    const prefix = getNpmGlobalPrefix(options);
    const binDir = getGlobalBinDir(prefix);
    const binaryPath = getNichebotBinaryPath(binDir);
    const binaryExists = fs.existsSync(binaryPath);
    const commandPath = resolveNichebotCommand(options);
    const pathContainsBin = pathContainsDir(binDir, options.pathValue || process.env.PATH || '');

    return {
        prefix,
        binDir,
        binaryPath,
        binaryExists,
        commandPath,
        pathContainsBin,
    };
}

function runInstallGlobal(options = {}) {
    const {
        dryRun = false,
        noPathWrite = false,
        cwd = process.cwd(),
        env = process.env,
        exec = spawnSync,
    } = options;

    const runOptions = { cwd, env, exec };
    const shellType = detectShell(env.SHELL || process.env.SHELL || '');

    if (!dryRun) {
        runCommand('npm', ['link'], runOptions);
    }

    const statusBefore = inspectGlobalInstall({ ...runOptions, pathValue: env.PATH || process.env.PATH || '' });

    const pathUpdate = ensurePathEntry(statusBefore.binDir, shellType, {
        dryRun,
        noPathWrite,
        homeDir: os.homedir(),
        pathValue: env.PATH || process.env.PATH || '',
    });

    const statusAfter = inspectGlobalInstall({ ...runOptions, pathValue: env.PATH || process.env.PATH || '' });

    return {
        ok: dryRun ? true : statusAfter.binaryExists,
        dryRun,
        shellType,
        pathUpdate,
        before: statusBefore,
        after: statusAfter,
    };
}

module.exports = {
    runCommand,
    getNpmGlobalPrefix,
    getGlobalBinDir,
    detectShell,
    getRcTarget,
    getNichebotBinaryPath,
    resolveNichebotCommand,
    pathContainsDir,
    ensurePathEntry,
    inspectGlobalInstall,
    runInstallGlobal,
};

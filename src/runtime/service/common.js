const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const {
    packageRoot,
    runtimeHome,
    logsDir,
    ensureRuntimeDirs,
} = require('../paths');

const SERVICE_NAME = 'nichebot';
const SERVICE_LABEL = 'com.nichebot.agent';
const WINDOWS_TASK_NAME = 'NicheBot';

function runCommand(cmd, args, options = {}) {
    const {
        capture = true,
        allowFailure = false,
        cwd = packageRoot,
        env = process.env,
        exec = spawnSync,
    } = options;

    const result = exec(cmd, args, {
        encoding: 'utf8',
        stdio: capture ? 'pipe' : 'inherit',
        cwd,
        env,
    });

    const wrapped = {
        status: Number(result.status ?? 1),
        stdout: String(result.stdout || ''),
        stderr: String(result.stderr || ''),
        cmd,
        args,
    };

    if (wrapped.status !== 0 && !allowFailure) {
        const message = wrapped.stderr.trim() || wrapped.stdout.trim() || `${cmd} ${args.join(' ')} failed`;
        const error = new Error(message);
        error.command = wrapped;
        throw error;
    }

    return wrapped;
}

function readTemplate(name) {
    const templatePath = path.join(__dirname, 'templates', name);
    return fs.readFileSync(templatePath, 'utf8');
}

function renderTemplate(template, vars) {
    return Object.entries(vars).reduce((acc, [key, value]) => {
        const escapedKey = String(key).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`{{${escapedKey}}}`, 'g');
        return acc.replace(regex, String(value ?? ''));
    }, template);
}

function tailFile(filePath, lines = 200) {
    if (!fs.existsSync(filePath)) {
        return { exists: false, path: filePath, lines: [] };
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const split = content.split(/\r?\n/).filter(Boolean);
    return {
        exists: true,
        path: filePath,
        lines: split.slice(-Math.max(1, lines)),
    };
}

function xmlEscape(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function getServiceContext() {
    ensureRuntimeDirs();
    const cliPath = path.join(packageRoot, 'src', 'cli.js');
    const nodePath = process.execPath;
    const logFile = path.join(logsDir, 'nichebot.log');
    const errorLogFile = path.join(logsDir, 'error.log');

    return {
        packageRoot,
        runtimeHome,
        logsDir,
        cliPath,
        nodePath,
        logFile,
        errorLogFile,
        serviceName: SERVICE_NAME,
        serviceLabel: SERVICE_LABEL,
        windowsTaskName: WINDOWS_TASK_NAME,
    };
}

module.exports = {
    SERVICE_NAME,
    SERVICE_LABEL,
    WINDOWS_TASK_NAME,
    runCommand,
    readTemplate,
    renderTemplate,
    tailFile,
    xmlEscape,
    getServiceContext,
};

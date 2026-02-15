const path = require('path');
const { logsDir } = require('../paths');
const { tailFile, getServiceContext } = require('./common');
const {
    installLinuxService,
    uninstallLinuxService,
    startLinuxService,
    stopLinuxService,
    restartLinuxService,
    statusLinuxService,
} = require('./linux-systemd');
const {
    installMacosService,
    uninstallMacosService,
    startMacosService,
    stopMacosService,
    restartMacosService,
    statusMacosService,
} = require('./macos-launchd');
const {
    installWindowsService,
    uninstallWindowsService,
    startWindowsService,
    stopWindowsService,
    restartWindowsService,
    statusWindowsService,
} = require('./windows-taskschd');
const {
    loadEnv,
    reloadConfig,
    validateConfig,
    formatValidationReport,
} = require('../../config');

function detectServicePlatform(platform = process.platform) {
    if (platform === 'linux') return 'linux';
    if (platform === 'darwin') return 'darwin';
    if (platform === 'win32') return 'win32';
    return 'linux';
}

function getServiceAdapter(platform = process.platform) {
    const detected = detectServicePlatform(platform);

    if (detected === 'linux') {
        return {
            platform: detected,
            install: installLinuxService,
            uninstall: uninstallLinuxService,
            start: startLinuxService,
            stop: stopLinuxService,
            restart: restartLinuxService,
            status: statusLinuxService,
        };
    }

    if (detected === 'darwin') {
        return {
            platform: detected,
            install: installMacosService,
            uninstall: uninstallMacosService,
            start: startMacosService,
            stop: stopMacosService,
            restart: restartMacosService,
            status: statusMacosService,
        };
    }

    return {
        platform: detected,
        install: installWindowsService,
        uninstall: uninstallWindowsService,
        start: startWindowsService,
        stop: stopWindowsService,
        restart: restartWindowsService,
        status: statusWindowsService,
    };
}

function installService(options = {}) {
    const adapter = getServiceAdapter(options.platform);
    return adapter.install(options);
}

function uninstallService(options = {}) {
    const adapter = getServiceAdapter(options.platform);
    return adapter.uninstall(options);
}

function startService(options = {}) {
    const adapter = getServiceAdapter(options.platform);
    return adapter.start(options);
}

function stopService(options = {}) {
    const adapter = getServiceAdapter(options.platform);
    return adapter.stop(options);
}

function restartService(options = {}) {
    const adapter = getServiceAdapter(options.platform);
    return adapter.restart(options);
}

function statusService(options = {}) {
    const adapter = getServiceAdapter(options.platform);
    return adapter.status(options);
}

function logsService(options = {}) {
    const lineCount = Number.isInteger(options.lines) && options.lines > 0 ? options.lines : 200;
    const logFile = path.join(logsDir, 'nichebot.log');
    const errorFile = path.join(logsDir, 'error.log');

    const standard = tailFile(logFile, lineCount);
    const errors = tailFile(errorFile, lineCount);

    return {
        source: 'file',
        lines: lineCount,
        standard,
        errors,
    };
}

function doctorService(options = {}) {
    loadEnv({ override: true });
    reloadConfig({ override: true });

    let service;
    try {
        service = statusService(options);
    } catch (error) {
        service = {
            platform: detectServicePlatform(options.platform || process.platform),
            installed: false,
            running: false,
            enabled: false,
            error: error.message,
        };
    }
    const validation = validateConfig();

    const relevantCodes = new Set([
        'INSECURE_ENV_FILE_PERMISSIONS',
        'MISSING_ALLOWED_USER_ID',
        'OBSERVABILITY_EXPOSED_NO_TOKEN',
    ]);

    const securityIssues = [
        ...validation.errors,
        ...validation.warnings,
    ].filter((issue) => relevantCodes.has(issue.code));

    return {
        service,
        validation: {
            valid: validation.valid,
            errors: validation.errors,
            warnings: validation.warnings,
            formatted: formatValidationReport(validation),
        },
        security: {
            checks: {
                envPermissionsOk: !securityIssues.some((i) => i.code === 'INSECURE_ENV_FILE_PERMISSIONS'),
                allowedUserConfigured: !securityIssues.some((i) => i.code === 'MISSING_ALLOWED_USER_ID'),
                observabilitySafe: !securityIssues.some((i) => i.code === 'OBSERVABILITY_EXPOSED_NO_TOKEN'),
            },
            issues: securityIssues,
        },
        context: getServiceContext(),
    };
}

module.exports = {
    detectServicePlatform,
    getServiceAdapter,
    installService,
    uninstallService,
    startService,
    stopService,
    restartService,
    statusService,
    logsService,
    doctorService,
};

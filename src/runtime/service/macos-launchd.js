const fs = require('fs');
const os = require('os');
const path = require('path');
const {
    runCommand,
    readTemplate,
    renderTemplate,
    getServiceContext,
} = require('./common');

function getMacosPaths(homeDir = os.homedir()) {
    const launchAgentsDir = path.join(homeDir, 'Library', 'LaunchAgents');
    const plistPath = path.join(launchAgentsDir, 'com.nichebot.agent.plist');
    return { launchAgentsDir, plistPath };
}

function renderMacosPlist(context = getServiceContext()) {
    const template = readTemplate('launchd-user.plist');
    return renderTemplate(template, {
        SERVICE_LABEL: context.serviceLabel,
        NODE_PATH: context.nodePath,
        CLI_PATH: context.cliPath,
        WORKING_DIRECTORY: context.packageRoot,
        RUNTIME_HOME: context.runtimeHome,
        LOG_FILE: context.logFile,
        ERROR_LOG_FILE: context.errorLogFile,
    });
}

function installMacosService(options = {}) {
    const context = options.context || getServiceContext();
    const homeDir = options.homeDir || os.homedir();
    const { launchAgentsDir, plistPath } = getMacosPaths(homeDir);

    fs.mkdirSync(launchAgentsDir, { recursive: true });
    fs.writeFileSync(plistPath, renderMacosPlist(context), 'utf8');

    runCommand('launchctl', ['unload', '-w', plistPath], {
        ...options,
        allowFailure: true,
    });
    runCommand('launchctl', ['load', '-w', plistPath], options);

    return {
        platform: 'darwin',
        plistPath,
        installed: true,
    };
}

function uninstallMacosService(options = {}) {
    const homeDir = options.homeDir || os.homedir();
    const { plistPath } = getMacosPaths(homeDir);

    runCommand('launchctl', ['unload', '-w', plistPath], {
        ...options,
        allowFailure: true,
    });

    if (fs.existsSync(plistPath)) {
        fs.unlinkSync(plistPath);
    }

    return {
        platform: 'darwin',
        plistPath,
        installed: false,
    };
}

function startMacosService(options = {}) {
    runCommand('launchctl', ['start', 'com.nichebot.agent'], options);
    return { platform: 'darwin', started: true };
}

function stopMacosService(options = {}) {
    runCommand('launchctl', ['stop', 'com.nichebot.agent'], {
        ...options,
        allowFailure: true,
    });
    return { platform: 'darwin', stopped: true };
}

function restartMacosService(options = {}) {
    stopMacosService(options);
    startMacosService(options);
    return { platform: 'darwin', restarted: true };
}

function statusMacosService(options = {}) {
    const homeDir = options.homeDir || os.homedir();
    const { plistPath } = getMacosPaths(homeDir);

    const detail = runCommand('launchctl', ['list', 'com.nichebot.agent'], {
        ...options,
        allowFailure: true,
    });

    return {
        platform: 'darwin',
        installed: fs.existsSync(plistPath),
        running: detail.status === 0,
        enabled: fs.existsSync(plistPath),
        plistPath,
        detail: detail.stdout || detail.stderr,
    };
}

module.exports = {
    getMacosPaths,
    renderMacosPlist,
    installMacosService,
    uninstallMacosService,
    startMacosService,
    stopMacosService,
    restartMacosService,
    statusMacosService,
};

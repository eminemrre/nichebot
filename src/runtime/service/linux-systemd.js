const fs = require('fs');
const os = require('os');
const path = require('path');
const {
    runCommand,
    readTemplate,
    renderTemplate,
    getServiceContext,
} = require('./common');

function getLinuxPaths(homeDir = os.homedir()) {
    const serviceDir = path.join(homeDir, '.config', 'systemd', 'user');
    const servicePath = path.join(serviceDir, 'nichebot.service');
    return { serviceDir, servicePath };
}

function renderLinuxServiceFile(context = getServiceContext()) {
    const template = readTemplate('systemd-user.service');
    return renderTemplate(template, {
        WORKING_DIRECTORY: context.packageRoot,
        RUNTIME_HOME: context.runtimeHome,
        NODE_PATH: context.nodePath,
        CLI_PATH: context.cliPath,
    });
}

function installLinuxService(options = {}) {
    const context = options.context || getServiceContext();
    const homeDir = options.homeDir || os.homedir();
    const { serviceDir, servicePath } = getLinuxPaths(homeDir);

    fs.mkdirSync(serviceDir, { recursive: true });
    fs.writeFileSync(servicePath, renderLinuxServiceFile(context), 'utf8');

    runCommand('systemctl', ['--user', 'daemon-reload'], options);
    runCommand('systemctl', ['--user', 'enable', 'nichebot.service'], options);

    return {
        platform: 'linux',
        servicePath,
        installed: true,
    };
}

function uninstallLinuxService(options = {}) {
    const homeDir = options.homeDir || os.homedir();
    const { servicePath } = getLinuxPaths(homeDir);

    runCommand('systemctl', ['--user', 'disable', '--now', 'nichebot.service'], {
        ...options,
        allowFailure: true,
    });

    if (fs.existsSync(servicePath)) {
        fs.unlinkSync(servicePath);
    }

    runCommand('systemctl', ['--user', 'daemon-reload'], {
        ...options,
        allowFailure: true,
    });

    return {
        platform: 'linux',
        servicePath,
        installed: false,
    };
}

function startLinuxService(options = {}) {
    runCommand('systemctl', ['--user', 'start', 'nichebot.service'], options);
    return { platform: 'linux', started: true };
}

function stopLinuxService(options = {}) {
    runCommand('systemctl', ['--user', 'stop', 'nichebot.service'], options);
    return { platform: 'linux', stopped: true };
}

function restartLinuxService(options = {}) {
    runCommand('systemctl', ['--user', 'restart', 'nichebot.service'], options);
    return { platform: 'linux', restarted: true };
}

function statusLinuxService(options = {}) {
    const homeDir = options.homeDir || os.homedir();
    const { servicePath } = getLinuxPaths(homeDir);

    const active = runCommand('systemctl', ['--user', 'is-active', '--quiet', 'nichebot.service'], {
        ...options,
        allowFailure: true,
    }).status === 0;

    const enabled = runCommand('systemctl', ['--user', 'is-enabled', '--quiet', 'nichebot.service'], {
        ...options,
        allowFailure: true,
    }).status === 0;

    const detail = runCommand('systemctl', ['--user', 'status', 'nichebot.service', '--no-pager', '--lines=20'], {
        ...options,
        allowFailure: true,
    });

    return {
        platform: 'linux',
        installed: fs.existsSync(servicePath),
        running: active,
        enabled,
        servicePath,
        detail: detail.stdout || detail.stderr,
    };
}

module.exports = {
    getLinuxPaths,
    renderLinuxServiceFile,
    installLinuxService,
    uninstallLinuxService,
    startLinuxService,
    stopLinuxService,
    restartLinuxService,
    statusLinuxService,
};

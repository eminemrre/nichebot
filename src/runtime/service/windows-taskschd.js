const fs = require('fs');
const path = require('path');
const {
    runCommand,
    readTemplate,
    renderTemplate,
    getServiceContext,
    xmlEscape,
} = require('./common');

function getWindowsPaths(context = getServiceContext()) {
    const serviceDir = path.join(context.runtimeHome, 'service');
    const taskXmlPath = path.join(serviceDir, 'nichebot-task.xml');
    return { serviceDir, taskXmlPath };
}

function renderWindowsTaskXml(context = getServiceContext()) {
    const template = readTemplate('windows-task.xml');
    const cliArgs = `&quot;${xmlEscape(context.cliPath)}&quot; start`;
    return renderTemplate(template, {
        NODE_PATH: xmlEscape(context.nodePath),
        CLI_ARGS: cliArgs,
        WORKING_DIRECTORY: xmlEscape(context.packageRoot),
    });
}

function installWindowsService(options = {}) {
    const context = options.context || getServiceContext();
    const { serviceDir, taskXmlPath } = getWindowsPaths(context);

    fs.mkdirSync(serviceDir, { recursive: true });
    const content = `\uFEFF${renderWindowsTaskXml(context)}`;
    fs.writeFileSync(taskXmlPath, content, { encoding: 'utf16le' });

    runCommand('schtasks', ['/Create', '/TN', context.windowsTaskName, '/XML', taskXmlPath, '/F'], options);

    return {
        platform: 'win32',
        installed: true,
        taskName: context.windowsTaskName,
        taskXmlPath,
    };
}

function uninstallWindowsService(options = {}) {
    const context = options.context || getServiceContext();
    const { taskXmlPath } = getWindowsPaths(context);

    runCommand('schtasks', ['/Delete', '/TN', context.windowsTaskName, '/F'], {
        ...options,
        allowFailure: true,
    });

    if (fs.existsSync(taskXmlPath)) {
        fs.unlinkSync(taskXmlPath);
    }

    return {
        platform: 'win32',
        installed: false,
        taskName: context.windowsTaskName,
        taskXmlPath,
    };
}

function startWindowsService(options = {}) {
    const context = options.context || getServiceContext();
    runCommand('schtasks', ['/Run', '/TN', context.windowsTaskName], options);
    return { platform: 'win32', started: true, taskName: context.windowsTaskName };
}

function stopWindowsService(options = {}) {
    const context = options.context || getServiceContext();
    runCommand('schtasks', ['/End', '/TN', context.windowsTaskName], {
        ...options,
        allowFailure: true,
    });
    return { platform: 'win32', stopped: true, taskName: context.windowsTaskName };
}

function restartWindowsService(options = {}) {
    stopWindowsService(options);
    startWindowsService(options);
    return { platform: 'win32', restarted: true };
}

function statusWindowsService(options = {}) {
    const context = options.context || getServiceContext();
    const query = runCommand('schtasks', ['/Query', '/TN', context.windowsTaskName, '/FO', 'LIST', '/V'], {
        ...options,
        allowFailure: true,
    });

    const output = (query.stdout || query.stderr || '').toLowerCase();
    const installed = query.status === 0;
    const running = installed && output.includes('running');

    return {
        platform: 'win32',
        installed,
        running,
        enabled: installed,
        taskName: context.windowsTaskName,
        detail: query.stdout || query.stderr,
    };
}

module.exports = {
    getWindowsPaths,
    renderWindowsTaskXml,
    installWindowsService,
    uninstallWindowsService,
    startWindowsService,
    stopWindowsService,
    restartWindowsService,
    statusWindowsService,
};

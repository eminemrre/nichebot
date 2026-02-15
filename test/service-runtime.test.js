const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { test } = require('node:test');

const {
    detectServicePlatform,
    installService,
    statusService,
} = require('../src/runtime/service');
const {
    renderLinuxServiceFile,
    installLinuxService,
} = require('../src/runtime/service/linux-systemd');
const {
    renderMacosPlist,
} = require('../src/runtime/service/macos-launchd');
const {
    renderWindowsTaskXml,
} = require('../src/runtime/service/windows-taskschd');

test('detectServicePlatform falls back to linux for unknown values', () => {
    assert.equal(detectServicePlatform('linux'), 'linux');
    assert.equal(detectServicePlatform('darwin'), 'darwin');
    assert.equal(detectServicePlatform('win32'), 'win32');
    assert.equal(detectServicePlatform('freebsd'), 'linux');
});

test('service templates render required runtime placeholders', () => {
    const context = {
        packageRoot: '/tmp/nichebot',
        runtimeHome: '/tmp/.nichebot',
        cliPath: '/tmp/nichebot/src/cli.js',
        nodePath: '/usr/bin/node',
        logFile: '/tmp/.nichebot/data/logs/nichebot.log',
        errorLogFile: '/tmp/.nichebot/data/logs/error.log',
        serviceLabel: 'com.nichebot.agent',
    };

    const linux = renderLinuxServiceFile(context);
    assert.equal(linux.includes('ExecStart=/usr/bin/node /tmp/nichebot/src/cli.js start'), true);
    assert.equal(linux.includes('Environment=NICHEBOT_HOME=/tmp/.nichebot'), true);

    const mac = renderMacosPlist(context);
    assert.equal(mac.includes('<string>com.nichebot.agent</string>'), true);
    assert.equal(mac.includes('<string>/tmp/nichebot/src/cli.js</string>'), true);

    const win = renderWindowsTaskXml({
        ...context,
        nodePath: 'C:\\node\\node.exe',
        cliPath: 'C:\\nichebot\\src\\cli.js',
    });
    assert.equal(win.includes('<Command>C:\\node\\node.exe</Command>'), true);
    assert.equal(win.includes('&quot;C:\\nichebot\\src\\cli.js&quot; start'), true);
});

test('installLinuxService writes unit file and executes systemctl calls', () => {
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'nichebot-service-linux-'));
    const calls = [];

    function mockExec(cmd, args) {
        calls.push([cmd, ...args]);
        return { status: 0, stdout: '', stderr: '' };
    }

    const context = {
        packageRoot: '/tmp/nichebot',
        runtimeHome: '/tmp/.nichebot',
        cliPath: '/tmp/nichebot/src/cli.js',
        nodePath: '/usr/bin/node',
    };

    try {
        const result = installLinuxService({
            homeDir: tempHome,
            context,
            exec: mockExec,
        });

        assert.equal(result.installed, true);
        assert.equal(fs.existsSync(result.servicePath), true);

        const serializedCalls = calls.map((entry) => entry.join(' '));
        assert.equal(serializedCalls.some((line) => line.includes('systemctl --user daemon-reload')), true);
        assert.equal(serializedCalls.some((line) => line.includes('systemctl --user enable nichebot.service')), true);
    } finally {
        fs.rmSync(tempHome, { recursive: true, force: true });
    }
});

test('service index dispatches linux install/status with mocked executor', () => {
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'nichebot-service-dispatch-'));
    const calls = [];

    function mockExec(cmd, args) {
        calls.push([cmd, ...args]);
        return { status: 0, stdout: 'active', stderr: '' };
    }

    const context = {
        packageRoot: '/tmp/nichebot',
        runtimeHome: '/tmp/.nichebot',
        cliPath: '/tmp/nichebot/src/cli.js',
        nodePath: '/usr/bin/node',
    };

    try {
        const install = installService({
            platform: 'linux',
            homeDir: tempHome,
            context,
            exec: mockExec,
        });
        assert.equal(install.installed, true);

        const status = statusService({
            platform: 'linux',
            homeDir: tempHome,
            context,
            exec: mockExec,
        });
        assert.equal(status.platform, 'linux');
        assert.equal(status.installed, true);

        const serializedCalls = calls.map((entry) => entry.join(' '));
        assert.equal(serializedCalls.some((line) => line.includes('systemctl --user status nichebot.service')), true);
    } finally {
        fs.rmSync(tempHome, { recursive: true, force: true });
    }
});

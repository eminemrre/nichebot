const http = require('http');
const { config, getActiveProvider, isTwitterConfigured } = require('../config');
const { runtimeHome, envPath, dataDir, dbPath, logsDir } = require('../runtime/paths');
const { getActiveJobCount } = require('../scheduler/cron');
const logger = require('../utils/logger');
const metrics = require('./metrics');

const PACKAGE_VERSION = require('../../package.json').version;

function getConfiguredValue(options, key, fallback) {
    if (Object.prototype.hasOwnProperty.call(options, key)) {
        return options[key];
    }
    return fallback;
}

function isAuthorized(req, token) {
    if (!token) return true;

    const headerToken = String(req.headers['x-observability-token'] || '').trim();
    if (headerToken && headerToken === token) return true;

    const authHeader = String(req.headers.authorization || '').trim();
    if (authHeader.toLowerCase().startsWith('bearer ')) {
        const bearer = authHeader.slice(7).trim();
        return bearer === token;
    }

    return false;
}

function writeJson(res, statusCode, payload) {
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
    });
    res.end(JSON.stringify(payload));
}

function writeText(res, statusCode, body) {
    res.writeHead(statusCode, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
    });
    res.end(body);
}

function buildHealthPayload() {
    const activeJobs = getActiveJobCount();
    metrics.setGauge(
        'nichebot_scheduler_active_jobs',
        'Number of currently active scheduler jobs',
        {},
        activeJobs
    );

    return {
        status: 'ok',
        service: 'nichebot',
        version: PACKAGE_VERSION,
        timestamp: new Date().toISOString(),
        uptimeSeconds: Number(process.uptime().toFixed(2)),
        provider: getActiveProvider(),
        twitterConfigured: isTwitterConfigured(),
        scheduler: {
            activeJobs,
        },
        runtime: {
            home: runtimeHome,
            envPath,
            dataDir,
            dbPath,
            logsDir,
        },
        metrics: metrics.getSummary(),
    };
}

function startObservabilityServer(options = {}) {
    const enabled = Boolean(getConfiguredValue(options, 'enabled', config.observability?.enabled));
    if (!enabled) return null;

    const host = String(getConfiguredValue(options, 'host', config.observability?.host || '127.0.0.1'));
    const port = Number(getConfiguredValue(options, 'port', config.observability?.port || 9464));
    const token = String(getConfiguredValue(options, 'token', config.observability?.token || ''));

    const server = http.createServer((req, res) => {
        const url = new URL(req.url || '/', `http://${req.headers.host || `${host}:${port}`}`);
        const path = url.pathname;
        const method = String(req.method || 'GET').toUpperCase();

        if (!isAuthorized(req, token)) {
            metrics.incCounter(
                'nichebot_observability_http_requests_total',
                'Total HTTP requests to observability server',
                { path, method, status: '401' }
            );
            writeJson(res, 401, { error: 'Unauthorized' });
            return;
        }

        if (method === 'GET' && path === '/health') {
            metrics.incCounter(
                'nichebot_observability_http_requests_total',
                'Total HTTP requests to observability server',
                { path, method, status: '200' }
            );
            writeJson(res, 200, buildHealthPayload());
            return;
        }

        if (method === 'GET' && path === '/ready') {
            metrics.incCounter(
                'nichebot_observability_http_requests_total',
                'Total HTTP requests to observability server',
                { path, method, status: '200' }
            );
            writeJson(res, 200, { ready: true, timestamp: new Date().toISOString() });
            return;
        }

        if (method === 'GET' && path === '/metrics') {
            metrics.incCounter(
                'nichebot_observability_http_requests_total',
                'Total HTTP requests to observability server',
                { path, method, status: '200' }
            );
            writeText(res, 200, metrics.renderPrometheus());
            return;
        }

        metrics.incCounter(
            'nichebot_observability_http_requests_total',
            'Total HTTP requests to observability server',
            { path, method, status: '404' }
        );
        writeJson(res, 404, { error: 'Not found' });
    });

    server.on('error', (error) => {
        logger.error('Observability server error', { error: error.message });
    });

    const ready = new Promise((resolve) => {
        server.listen(port, host, () => {
            const address = server.address();
            const resolvedPort = typeof address === 'object' && address ? address.port : port;
            logger.info('Observability server started', {
                host,
                port: resolvedPort,
                tokenProtected: Boolean(token),
                endpoints: ['/health', '/ready', '/metrics'],
            });
            resolve();
        });
    });

    return {
        server,
        ready,
        host,
        port,
        close: () =>
            new Promise((resolve, reject) => {
                server.close((error) => {
                    if (error) {
                        reject(error);
                        return;
                    }
                    resolve();
                });
            }),
    };
}

module.exports = {
    startObservabilityServer,
};

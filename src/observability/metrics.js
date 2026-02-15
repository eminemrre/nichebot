const START_TIME_MS = Date.now();

const registry = new Map();

function normalizeLabels(labels = {}) {
    return Object.entries(labels)
        .filter(([, value]) => value !== undefined && value !== null)
        .map(([key, value]) => [String(key), String(value)])
        .sort(([a], [b]) => a.localeCompare(b));
}

function labelsKey(labels) {
    return JSON.stringify(normalizeLabels(labels));
}

function ensureMetric(name, type, help) {
    if (!registry.has(name)) {
        registry.set(name, {
            name,
            type,
            help,
            samples: new Map(),
        });
    }

    const metric = registry.get(name);
    if (!metric.help && help) metric.help = help;
    return metric;
}

function ensureSample(metric, labels = {}) {
    const key = labelsKey(labels);
    if (!metric.samples.has(key)) {
        metric.samples.set(key, {
            labels: Object.fromEntries(normalizeLabels(labels)),
            value: 0,
        });
    }
    return metric.samples.get(key);
}

function incCounter(name, help, labels = {}, delta = 1) {
    const metric = ensureMetric(name, 'counter', help);
    const sample = ensureSample(metric, labels);
    sample.value += Number(delta) || 0;
}

function setGauge(name, help, labels = {}, value = 0) {
    const metric = ensureMetric(name, 'gauge', help);
    const sample = ensureSample(metric, labels);
    sample.value = Number(value) || 0;
}

function formatLabelValue(value) {
    return String(value)
        .replace(/\\/g, '\\\\')
        .replace(/\n/g, '\\n')
        .replace(/"/g, '\\"');
}

function formatLabels(labels = {}) {
    const entries = normalizeLabels(labels);
    if (entries.length === 0) return '';
    const body = entries.map(([key, value]) => `${key}="${formatLabelValue(value)}"`).join(',');
    return `{${body}}`;
}

function getMetricTotal(name) {
    const metric = registry.get(name);
    if (!metric) return 0;
    let total = 0;
    metric.samples.forEach((sample) => {
        total += Number(sample.value) || 0;
    });
    return total;
}

function observeError(scope = 'application') {
    const normalizedScope = String(scope || 'application');
    const ts = Math.floor(Date.now() / 1000);
    incCounter('nichebot_errors_total', 'Total number of application errors', { scope: normalizedScope });
    setGauge(
        'nichebot_last_error_timestamp_seconds',
        'Unix timestamp of the most recent application error',
        {},
        ts
    );
}

function getSummary() {
    return {
        startedAt: new Date(START_TIME_MS).toISOString(),
        uptimeSeconds: Math.floor((Date.now() - START_TIME_MS) / 1000),
        counters: {
            errorsTotal: getMetricTotal('nichebot_errors_total'),
            telegramMessagesAttempted: getMetricTotal('nichebot_telegram_send_attempts_total'),
            telegramMessagesFailed: getMetricTotal('nichebot_telegram_send_failures_total'),
            commandsReceived: getMetricTotal('nichebot_commands_received_total'),
            llmRequests: getMetricTotal('nichebot_llm_requests_total'),
            schedulerRuns: getMetricTotal('nichebot_scheduler_runs_total'),
        },
    };
}

function renderPrometheus() {
    setGauge(
        'nichebot_process_uptime_seconds',
        'Process uptime in seconds',
        {},
        Number(process.uptime().toFixed(2))
    );

    const lines = [];
    Array.from(registry.values())
        .sort((a, b) => a.name.localeCompare(b.name))
        .forEach((metric) => {
            lines.push(`# HELP ${metric.name} ${metric.help || metric.name}`);
            lines.push(`# TYPE ${metric.name} ${metric.type}`);

            Array.from(metric.samples.values())
                .sort((a, b) => JSON.stringify(a.labels).localeCompare(JSON.stringify(b.labels)))
                .forEach((sample) => {
                    lines.push(`${metric.name}${formatLabels(sample.labels)} ${sample.value}`);
                });
        });

    return `${lines.join('\n')}\n`;
}

setGauge(
    'nichebot_process_start_time_seconds',
    'Unix timestamp when the NicheBot process started',
    {},
    Math.floor(START_TIME_MS / 1000)
);

module.exports = {
    incCounter,
    setGauge,
    getMetricTotal,
    getSummary,
    observeError,
    renderPrometheus,
};

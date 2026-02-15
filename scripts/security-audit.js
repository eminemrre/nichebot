#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const ALLOWLIST_PATH = path.join(ROOT, 'security', 'npm-audit-allowlist.json');

const SEVERITY_ORDER = ['low', 'moderate', 'high', 'critical'];

function severityRank(value) {
    return SEVERITY_ORDER.indexOf(String(value || '').toLowerCase());
}

function extractGhsaId(url = '') {
    const match = String(url).match(/GHSA-[A-Za-z0-9-]+/i);
    return match ? match[0].toUpperCase() : '';
}

function loadAllowlist() {
    if (!fs.existsSync(ALLOWLIST_PATH)) return [];
    try {
        const parsed = JSON.parse(fs.readFileSync(ALLOWLIST_PATH, 'utf8'));
        if (!Array.isArray(parsed.allowlist)) return [];
        return parsed.allowlist.map((entry) => ({
            id: String(entry.id || '').toUpperCase(),
            package: String(entry.package || '').trim(),
            expires: String(entry.expires || '').trim(),
            reason: String(entry.reason || '').trim(),
        }));
    } catch {
        return [];
    }
}

function isExpired(dateText) {
    if (!dateText) return false;
    const parsed = Date.parse(dateText);
    if (Number.isNaN(parsed)) return false;
    return parsed < Date.now();
}

function isAllowlisted(finding, allowlist) {
    return allowlist.some((entry) => {
        if (entry.id && finding.id !== entry.id) return false;
        if (entry.package && finding.package !== entry.package) return false;
        if (isExpired(entry.expires)) return false;
        return true;
    });
}

function runAuditJson() {
    const result = spawnSync('npm', ['audit', '--json', '--omit=dev'], {
        cwd: ROOT,
        encoding: 'utf8',
    });

    const payload = result.stdout || result.stderr;
    if (!payload) {
        console.error('[security:audit] npm audit returned empty output.');
        process.exit(2);
    }

    try {
        return JSON.parse(payload);
    } catch (error) {
        console.error('[security:audit] Failed to parse npm audit JSON:', error.message);
        process.exit(2);
    }
}

function extractFindings(auditJson) {
    const findings = [];
    const vulnerabilities = auditJson?.vulnerabilities || {};

    Object.entries(vulnerabilities).forEach(([pkg, details]) => {
        const viaList = Array.isArray(details?.via) ? details.via : [];
        viaList.forEach((via) => {
            if (typeof via !== 'object' || !via) return;
            const severity = String(via.severity || details?.severity || '').toLowerCase();
            if (severityRank(severity) < severityRank('high')) return;

            const id = extractGhsaId(via.url) || String(via.source || '').toUpperCase();
            findings.push({
                package: pkg,
                id,
                severity,
                title: String(via.title || via.name || '').trim(),
                url: String(via.url || '').trim(),
            });
        });
    });

    const deduped = new Map();
    findings.forEach((finding) => {
        const key = `${finding.package}|${finding.id}|${finding.severity}`;
        if (!deduped.has(key)) deduped.set(key, finding);
    });
    return Array.from(deduped.values());
}

function main() {
    const allowlist = loadAllowlist();
    const auditJson = runAuditJson();
    const findings = extractFindings(auditJson);

    if (findings.length === 0) {
        console.log('[security:audit] OK (no high/critical vulnerabilities).');
        return;
    }

    const activeFindings = findings.filter((finding) => !isAllowlisted(finding, allowlist));
    const allowlistedFindings = findings.filter((finding) => isAllowlisted(finding, allowlist));

    if (allowlistedFindings.length > 0) {
        console.log(`[security:audit] Allowlisted findings: ${allowlistedFindings.length}`);
        allowlistedFindings.forEach((finding, index) => {
            console.log(
                `  ${index + 1}. ${finding.package} ${finding.severity} ${finding.id || '(no-id)'}`
            );
        });
    }

    if (activeFindings.length === 0) {
        console.log('[security:audit] OK (no unallowlisted high/critical vulnerabilities).');
        return;
    }

    console.error(`[security:audit] Found ${activeFindings.length} unallowlisted high/critical vulnerability(ies):`);
    activeFindings.forEach((finding, index) => {
        console.error(
            `${index + 1}. ${finding.package} [${finding.severity}] ${finding.id || '(no-id)'}`
        );
        if (finding.title) console.error(`   ${finding.title}`);
        if (finding.url) console.error(`   ${finding.url}`);
    });
    console.error(`\nReview allowlist: ${path.relative(ROOT, ALLOWLIST_PATH)}`);
    process.exit(1);
}

main();

const fs = require('fs');
const { envPath, ensureRuntimeDirs } = require('./paths');
const { runInstallGlobal, inspectGlobalInstall } = require('./install-global');
const { loadEnv, reloadConfig, validateConfig, formatValidationReport } = require('../config');

function pushStep(steps, name, status, message, details = null) {
    steps.push({ name, status, message, details });
}

async function runBootstrap(options = {}) {
    const {
        nonInteractive = false,
        skipInstall = false,
        skipSetup = false,
        skipDoctor = false,
        runSetupWizard = null,
        canPromptUser = () => false,
        runDoctorReport = null,
        cwd = process.cwd(),
        env = process.env,
    } = options;

    const steps = [];
    const warnings = [];

    ensureRuntimeDirs();

    if (skipInstall) {
        pushStep(steps, 'install', 'skipped', 'Install step skipped (--skip-install).');
    } else {
        const inspect = inspectGlobalInstall({ cwd, env, pathValue: env.PATH || process.env.PATH || '' });
        const commandReady = Boolean(inspect.commandPath);

        if (commandReady && inspect.binaryExists && inspect.pathContainsBin) {
            pushStep(steps, 'install', 'ok', 'Global nichebot command is already ready.', inspect);
        } else {
            try {
                const installResult = runInstallGlobal({
                    dryRun: false,
                    noPathWrite: false,
                    cwd,
                    env,
                });
                if (!installResult.after.binaryExists) {
                    pushStep(
                        steps,
                        'install',
                        'failed',
                        'Global install completed but nichebot binary is not available.',
                        installResult
                    );
                    return {
                        ok: false,
                        steps,
                        warnings,
                        recommendation: 'Run npm run install:global and reload your shell.',
                    };
                }

                pushStep(steps, 'install', 'ok', 'Global nichebot command installed.', installResult);
            } catch (error) {
                pushStep(steps, 'install', 'failed', `Install step failed: ${error.message}`);
                return {
                    ok: false,
                    steps,
                    warnings,
                    recommendation: 'Fix install errors, then rerun nichebot bootstrap.',
                };
            }
        }
    }

    const envExists = fs.existsSync(envPath);
    if (skipSetup) {
        pushStep(steps, 'setup', 'skipped', 'Setup step skipped (--skip-setup).', { envExists });
    } else if (envExists) {
        pushStep(steps, 'setup', 'ok', `Runtime config already exists: ${envPath}`);
    } else {
        loadEnv({ override: true });
        reloadConfig({ override: true });
        const processValidation = validateConfig();

        if (processValidation.valid) {
            pushStep(
                steps,
                'setup',
                'ok',
                'Runtime .env missing; using valid process environment variables for this session.',
                { envPath, validationFromProcessEnv: true }
            );
        } else {
            const interactiveAllowed = Boolean(canPromptUser());
            if (nonInteractive || !interactiveAllowed) {
                pushStep(
                    steps,
                    'setup',
                    'failed',
                    `Runtime config is missing and setup cannot run in non-interactive mode: ${envPath}`,
                    { validation: processValidation }
                );
                return {
                    ok: false,
                    steps,
                    warnings,
                    recommendation: 'Run nichebot setup in an interactive terminal, then rerun nichebot bootstrap.',
                };
            }

            if (typeof runSetupWizard !== 'function') {
                pushStep(
                    steps,
                    'setup',
                    'failed',
                    'Setup wizard runner is not available in bootstrap context.'
                );
                return {
                    ok: false,
                    steps,
                    warnings,
                    recommendation: 'Run nichebot setup manually, then nichebot doctor.',
                };
            }

            try {
                await runSetupWizard();
            } catch (error) {
                pushStep(
                    steps,
                    'setup',
                    'failed',
                    `Setup wizard failed: ${error.message}`
                );
                return {
                    ok: false,
                    steps,
                    warnings,
                    recommendation: 'Retry nichebot setup, then rerun nichebot bootstrap.',
                };
            }
            loadEnv({ override: true });
            reloadConfig({ override: true });
            const postSetupValidation = validateConfig();
            if (!postSetupValidation.valid) {
                pushStep(
                    steps,
                    'setup',
                    'failed',
                    'Setup completed but config is still invalid.',
                    { validation: postSetupValidation, formatted: formatValidationReport(postSetupValidation) }
                );
                return {
                    ok: false,
                    steps,
                    warnings,
                    recommendation: 'Run nichebot doctor and fix reported configuration errors.',
                };
            }

            pushStep(steps, 'setup', 'ok', `Runtime config created: ${envPath}`);
        }
    }

    if (skipDoctor) {
        pushStep(steps, 'doctor', 'skipped', 'Doctor step skipped (--skip-doctor).');
    } else {
        if (typeof runDoctorReport !== 'function') {
            pushStep(steps, 'doctor', 'failed', 'Doctor runner is not available in bootstrap context.');
            return {
                ok: false,
                steps,
                warnings,
                recommendation: 'Run nichebot doctor manually.',
            };
        }

        const report = runDoctorReport();
        const valid = Boolean(report?.config?.validation?.valid);
        if (!valid) {
            pushStep(steps, 'doctor', 'failed', 'Doctor found configuration/runtime issues.', report);
            return {
                ok: false,
                steps,
                warnings,
                recommendation: 'Run nichebot doctor and apply fix hints.',
            };
        }

        pushStep(steps, 'doctor', 'ok', 'Doctor preflight passed.', report);
    }

    warnings.push('If any token or API key was exposed, rotate it immediately.');
    warnings.push('Telegram token rotation: @BotFather -> /revoke + /token.');
    warnings.push('Provider key rotation: regenerate key in provider panel and rerun nichebot setup.');

    return {
        ok: true,
        steps,
        warnings,
        recommendation: 'Bootstrap completed. Next: nichebot start',
    };
}

module.exports = {
    runBootstrap,
};

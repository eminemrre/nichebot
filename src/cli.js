#!/usr/bin/env node

/**
 * NicheBot CLI — Cross-platform entry point
 * Works on Windows, macOS, and Linux
 */

const path = require('path');
const fs = require('fs');

// Proje kök dizinini bul
const rootDir = path.resolve(__dirname, '..');

// .env kontrolü
const envPath = path.join(rootDir, '.env');
if (!fs.existsSync(envPath)) {
    const envExample = path.join(rootDir, '.env.example');
    console.log(`
╔══════════════════════════════════════════╗
║  🤖 NicheBot — First Time Setup         ║
╚══════════════════════════════════════════╝

No .env file found. Creating from template...
`);

    if (fs.existsSync(envExample)) {
        fs.copyFileSync(envExample, envPath);
        console.log(`✅ Created .env from .env.example`);
        console.log(`📝 Please edit .env with your API keys:\n`);

        if (process.platform === 'win32') {
            console.log(`   notepad "${envPath}"`);
        } else {
            console.log(`   nano "${envPath}"`);
        }

        console.log(`\nThen run nichebot again.`);
        process.exit(0);
    } else {
        console.error('❌ .env.example not found. Please reinstall NicheBot.');
        process.exit(1);
    }
}

// Ana uygulamayı başlat
require('./index');

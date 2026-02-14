#!/usr/bin/env bash
# NicheBot Launcher for macOS / Linux
# Usage: ./nichebot.sh

echo ""
echo "======================================"
echo "  🤖 NicheBot - AI Content Assistant"
echo "======================================"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed."
    echo "Install: https://nodejs.org/"
    echo ""
    echo "macOS:   brew install node"
    echo "Ubuntu:  sudo apt install nodejs npm"
    echo "Arch:    sudo pacman -S nodejs npm"
    exit 1
fi

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Check node_modules
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    echo ""
fi

# Run
node src/cli.js

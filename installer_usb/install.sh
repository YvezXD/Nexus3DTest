#!/usr/bin/env bash
# =============================================================================
#  NEXUS 3D — Linux / Raspberry Pi Installer
# =============================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "========================================================================"
echo "  NEXUS 3D — Fleet Telemetry Bridge Linux Installer"
echo "========================================================================"
echo ""

# Check for Python 3
if ! command -v python3 &>/dev/null; then
    echo "[!] python3 not found. Attempting to install..."
    if command -v apt-get &>/dev/null; then
        sudo apt-get update && sudo apt-get install -y python3
    elif command -v dnf &>/dev/null; then
        sudo dnf install -y python3
    else
        echo "[ERROR] Please install python3 manually and rerun this script."
        exit 1
    fi
fi

# Run setup wizard
python3 setup_wizard.py

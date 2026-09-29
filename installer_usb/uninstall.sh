#!/usr/bin/env bash
# =============================================================================
#  NEXUS 3D — Linux / Raspberry Pi Uninstaller
# =============================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "========================================================================"
echo "  NEXUS 3D — Fleet Telemetry Bridge Linux Uninstaller"
echo "========================================================================"
echo ""

if command -v python3 &>/dev/null; then
    python3 uninstall_wizard.py
else
    echo "[*] Stopping running processes..."
    pkill -f bridge_daemon.py || true

    if [ -f "/etc/systemd/system/nexus3d-bridge.service" ]; then
        echo "[*] Removing systemd service..."
        sudo systemctl stop nexus3d-bridge.service || true
        sudo systemctl disable nexus3d-bridge.service || true
        sudo rm -f /etc/systemd/system/nexus3d-bridge.service
        sudo systemctl daemon-reload
        echo "[OK] Systemd service removed."
    fi

    echo "[OK] Uninstallation complete."
fi

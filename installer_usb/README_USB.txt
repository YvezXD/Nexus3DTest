========================================================================
 NEXUS 3D — USB FLASH DRIVE INSTALLATION INSTRUCTIONS (v2.1)
========================================================================

Follow these simple steps on the computer located on your home network:

1. COPY TO USB OR DESKTOP:
   Copy this entire folder ("installer_usb") onto a USB drive, or directly
   onto a desktop computer / mini-PC connected to the same Wi-Fi / LAN
   as your 3D printers:
     • Printer 1: QIDI Q2 (192.168.1.124)
     • Printer 2: FLASHFORGE AD5X (192.168.1.36)

2. RUN THE INSTALLER (ONCE):
   Double-click:
       install.bat   (Self-contained single-file installer)
   Or run on Linux / macOS:
       python3 setup_wizard.py

   * What happens automatically:
     - The installer checks for Python. If not found on Windows, it
       automatically downloads a portable, zero-install Python runtime.
     - An interactive Setup Wizard opens directly in your terminal.
     - Pre-configured smart defaults are already filled in for both printers.
     - Tests live LAN connectivity to both printers (Moonraker + cameras)
       and verifies authorized access to your Pantheon Cloud web app.
     - Registers the bridge to start automatically whenever Windows boots
       (silent background auto-run).
     - Launches the bridge daemon immediately!

3. NEW IN v2.1:
   - Dual Fleet Management: Monitor both QIDI Q2 and FLASHFORGE AD5X simultaneously.
   - Low-Bandwidth Adaptive Engine: Camera snapshots automatically throttle
     if the uplink is slow, ensuring real-time telemetry never freezes.
   - Bidirectional Remote Commands: Trigger Pause, Cancel, Resume, Emergency Stop
     (M112), and G-Code terminal commands from anywhere in Cloud or LAN mode!

4. OPEN YOUR REMOTE DASHBOARD:
   Open your browser on any phone, tablet, or laptop anywhere in the world:
       https://dev-nexus3-d.pantheonsite.io/

   Sign in with:
       Username: admin
       Password: nexus3d

========================================================================
 HELPER UTILITIES:
========================================================================
- start_bridge.bat       : Starts the bridge manually in the background.
- stop_bridge.bat        : Gracefully stops all bridge processes.
- status.bat             : Instant probe of both printers, daemon PID, and live log.
- enable_autostart.bat   : One-click enables automatic startup on Windows boot.
- disable_autostart.bat  : Disables automatic startup on Windows boot.
- uninstall.bat          : Self-contained uninstaller. Stops daemon, removes
                           startup tasks, and optionally cleans config & logs.
- bridge.log             : Text file containing all recent activity logs.
========================================================================

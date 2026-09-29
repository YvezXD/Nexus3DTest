========================================================================
 NEXUS 3D — USB FLASH DRIVE INSTALLATION INSTRUCTIONS
========================================================================

Follow these simple steps on the computer located on your home network:

1. COPY TO USB OR DESKTOP:
   Copy this entire folder ("installer_usb") onto a USB drive, or directly
   onto the desktop computer that is connected to the same Wi-Fi / LAN
   as your QIDI Q2 3D printer (192.168.1.124).

2. RUN THE INSTALLER (ONCE):
   Double-click:
       install.bat   (on Windows)
   Or run:
       bash install.sh   (on Linux / Raspberry Pi)

   * What happens automatically:
     - The installer checks for Python. If not found, it automatically
       downloads a portable, zero-install Python runtime.
     - An interactive Setup Wizard opens.
     - Pre-configured smart defaults are already filled in.
     - The installer tests live connectivity to your QIDI Q2 printer,
       the camera stream, and your Pantheon Cloud web app.
     - It registers the bridge to start automatically whenever your
       computer boots up (in the background, silently).
     - It launches the bridge daemon immediately!

3. OPEN YOUR REMOTE DASHBOARD:
   Open your browser on any phone, tablet, or laptop anywhere in the world:
       https://dev-nexus3-d.pantheonsite.io/

   Sign in with:
       Username: admin
       Password: nexus3d

   Your QIDI Q2 live metrics, print progress, nozzle/bed temperatures,
   and camera feed will now sync seamlessly over Pantheon HTTPS!

========================================================================
 HELPER UTILITIES:
========================================================================
- start_bridge.bat : Starts the bridge manually if ever stopped.
- stop_bridge.bat  : Gracefully stops the bridge process.
- status.bat       : Shows if the bridge is currently running and tails
                     the latest log output.
- uninstall.bat    : Uninstalls the bridge daemon, removes Windows Startup
                     launcher, and cleans up local configuration.
- uninstall.sh     : Uninstalls the daemon on Linux / Raspberry Pi.
- bridge.log       : Text file containing all recent activity logs.
========================================================================

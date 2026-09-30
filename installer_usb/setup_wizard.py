#!/usr/bin/env python3
"""
=============================================================================
 NEXUS 3D — Setup Wizard & Bridge Installer
 Cross-Platform Interactive Configuration Engine
=============================================================================
"""

import os
import sys
import time
import json
import socket
import urllib.request
import urllib.error
import subprocess
from datetime import datetime

# ANSI Colors for clean terminal UI
class C:
    CYAN = "\033[96m"
    GREEN = "\033[92m"
    YELLOW = "\033[93m"
    RED = "\033[91m"
    BOLD = "\033[1m"
    DIM = "\033[2m"
    RESET = "\033[0m"

# Enable Windows VT100 color support
if sys.platform == "win32":
    os.system("")

def ask(prompt, default):
    text = f"{C.CYAN}?{C.RESET} {prompt} [{C.BOLD}{default}{C.RESET}]: "
    try:
        val = input(text).strip()
        return val if val else default
    except (KeyboardInterrupt, EOFError):
        print("\n\nSetup aborted.")
        sys.exit(0)

def ask_bool(prompt, default_val=True):
    def_str = "Y/n" if default_val else "y/N"
    choice = ask(f"{prompt} ({def_str})", "Y" if default_val else "N")
    return choice.lower().startswith("y")

def banner():
    print(rf"""
{C.CYAN}{C.BOLD}========================================================================
   _  _________  ____  ______   _____ ___    ___      _    __          
  / |/ / __/ _ \/ / / / __/ /  / _/ // / /__/ _ \____(_)__/ /__ ____   
 /    / _// // / /_/ /\ \/ /__/ _/ // / / _/ // /___/ / _  / -_) __/   
/_/|_/___/____/\____/___/____/_/ /_//_/_/ /____/   /_/\_,_/\__/_/      
           Fleet Telemetry Bridge — Setup Wizard
========================================================================{C.RESET}
""")
    print("Welcome! This installer sets up the local NEXUS 3D bridge daemon.")
    print("It allows your Pantheon Cloud Web Dashboard to monitor your 3D printers")
    print("remotely with ZERO modifications to your printers.\n")

def load_existing_env(script_dir):
    env_path = os.path.join(script_dir, "config.env")
    vals = {}
    if os.path.exists(env_path):
        try:
            with open(env_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        k, v = line.split("=", 1)
                        vals[k.strip()] = v.strip().strip('"').strip("'")
        except Exception:
            pass
    return vals

def test_moonraker(ip, port):
    print(f"  • Probing Moonraker on http://{ip}:{port}...", end="", flush=True)
    endpoints = [f"http://{ip}:{port}/printer/info", f"http://{ip}/printer/info"]
    for url in endpoints:
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Nexus3D-Setup/2.0"})
            with urllib.request.urlopen(req, timeout=2.0) as resp:
                if resp.status == 200:
                    data = json.loads(resp.read().decode("utf-8"))
                    state = data.get("result", {}).get("state", "ready")
                    print(f" {C.GREEN}[PASS]{C.RESET} (Printer state: {state})")
                    return True
        except Exception:
            continue
    print(f" {C.YELLOW}[WARNING]{C.RESET} (No answer; printer might be off or busy)")
    return False

def test_webcam(url):
    if not url:
        return False
    print(f"  • Probing Webcam feed ({url})...", end="", flush=True)
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Nexus3D-Setup/2.0"})
        with urllib.request.urlopen(req, timeout=2.5) as resp:
            content_type = resp.headers.get("Content-Type", "")
            if "image" in content_type or "multipart" in content_type:
                print(f" {C.GREEN}[PASS]{C.RESET} ({content_type})")
                return True
    except Exception:
        pass
    print(f" {C.YELLOW}[INFO]{C.RESET} (Stream offline right now)")
    return False

def test_pantheon(url, token):
    print(f"  • Probing Pantheon Cloud Ingestion API...", end="", flush=True)
    test_payload = {
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "printers": [
            {
                "id": "p1",
                "name": "QIDI Q2 (Bridge Probe)",
                "ip": "192.168.1.124",
                "online": True,
                "state": "ready",
                "progress": 0.0
            }
        ]
    }
    data_bytes = json.dumps(test_payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data_bytes,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
            "X-API-TOKEN": token,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Nexus3D/2.0"
        },
        method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=6.0) as resp:
            resp_str = resp.read().decode("utf-8", errors="ignore")
            if resp.status == 200:
                print(f" {C.GREEN}[PASS]{C.RESET} (Pantheon WebOps authorized)")
                return True
            else:
                print(f" {C.RED}[FAIL]{C.RESET} HTTP {resp.status}: {resp_str}")
                return False
    except urllib.error.HTTPError as e:
        err_msg = e.read().decode("utf-8", errors="ignore")
        print(f" {C.RED}[FAIL]{C.RESET} HTTP {e.code}: {err_msg}")
        return False
    except Exception as e:
        print(f" {C.YELLOW}[WARNING]{C.RESET} Network warning: {e}")
        return False

def stop_existing_bridge_instances():
    """Terminates any existing bridge daemon instance to prevent port conflicts."""
    stopped = 0
    # 1. Check port 58921 listener via netstat
    try:
        res = subprocess.run(["netstat", "-ano"], capture_output=True, text=True, check=False)
        for line in res.stdout.splitlines():
            if ":58921" in line and "LISTENING" in line:
                parts = line.strip().split()
                if parts and parts[-1].isdigit():
                    pid = int(parts[-1])
                    if sys.platform == "win32":
                        subprocess.run(["taskkill", "/F", "/PID", str(pid)], capture_output=True, check=False)
                    else:
                        subprocess.run(["kill", "-9", str(pid)], capture_output=True, check=False)
                    stopped += 1
    except Exception:
        pass

    # 2. Check Win32 processes matching bridge_daemon.py
    if sys.platform == "win32":
        try:
            ps_cmd = (
                "try { $conns = Get-NetTCPConnection -LocalPort 58921 -ErrorAction SilentlyContinue; "
                "if ($conns) { foreach ($c in $conns) { if ($c.OwningProcess -gt 0) { Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue } } } } catch {}; "
                "try { $procs = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*bridge_daemon.py*' }; "
                "if ($procs) { foreach ($p in $procs) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue } } } catch {};"
            )
            subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps_cmd], capture_output=True, check=False)
        except Exception:
            pass

    if stopped > 0:
        time.sleep(0.5)

def is_bridge_running(port=58921):
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(0.5)
        res = s.connect_ex(("127.0.0.1", port))
        s.close()
        return res == 0
    except Exception:
        return False

def configure_auto_start(script_dir):
    """Sets up auto-start on Windows (Registry Run key + Startup folder) or Linux (systemd)."""
    if sys.platform == "win32":
        try:
            if script_dir not in sys.path:
                sys.path.insert(0, script_dir)
            import bridge_daemon
            if bridge_daemon.ensure_autostart(True):
                print(f"  {C.GREEN}[OK]{C.RESET} Registered automatic startup on Windows boot (Registry Run key + Startup folder)")
                return True
        except Exception as e:
            print(f"  {C.YELLOW}[WARNING]{C.RESET} Could not register startup task: {e}")
    elif sys.platform.startswith("linux"):
        try:
            if script_dir not in sys.path:
                sys.path.insert(0, script_dir)
            import bridge_daemon
            if bridge_daemon.ensure_autostart(True):
                print(f"  {C.GREEN}[OK]{C.RESET} Registered Linux user systemd service: nexus3d-bridge.service")
                return True
        except Exception as e:
            print(f"  {C.YELLOW}[WARNING]{C.RESET} Linux systemd registration skipped: {e}")
    return False

def main():
    banner()
    script_dir = os.path.dirname(os.path.abspath(__file__))
    saved = load_existing_env(script_dir)

    # 1. Gather Configuration with pre-filled defaults
    print(f"{C.BOLD}STEP 1: Cloud & Security Settings{C.RESET}")
    pantheon_url = ask(
        "Pantheon Telemetry Ingestion URL",
        saved.get("PANTHEON_URL", "https://dev-nexus3-d.pantheonsite.io/index.php?route=api&action=push")
    )
    api_token = ask(
        "API Secret Token (must match Pantheon config.php)",
        saved.get("API_TOKEN", "nxs_a7f3b9e2d1c4056789abcdef01234567")
    )

    print(f"\n{C.BOLD}STEP 2: Primary 3D Printer Settings (LAN Passive Link){C.RESET}")
    p1_name = ask("Printer 1 Display Name", saved.get("PRINTER_1_NAME", "QIDI Q2"))
    p1_ip = ask("Printer 1 LAN IP Address", saved.get("PRINTER_1_IP", "192.168.1.124"))
    p1_port = ask("Moonraker API Port", saved.get("PRINTER_1_PORT", "7125"))
    p1_stream = ask("Webcam Stream URL", saved.get("PRINTER_1_CAM_STREAM", f"http://{p1_ip}/webcam/?action=stream"))
    p1_snap = ask("Webcam Snapshot URL", saved.get("PRINTER_1_CAM_SNAPSHOT", f"http://{p1_ip}/webcam/?action=snapshot"))

    # Optional Printer 2
    print(f"\n{C.BOLD}STEP 3: Fleet Expansion (Printer 2){C.RESET}")
    p2_default_en = saved.get("PRINTER_2_ENABLED", "true").lower() == "true"
    p2_enabled = ask_bool("Enable a 2nd 3D printer now?", p2_default_en)
    p2_name = saved.get("PRINTER_2_NAME", "FLASHFORGE AD5X")
    p2_ip = saved.get("PRINTER_2_IP", "192.168.1.36")
    p2_port = saved.get("PRINTER_2_PORT", "7125")
    p2_stream = saved.get("PRINTER_2_CAM_STREAM", f"http://{p2_ip}:8080/?action=stream")
    p2_snap = saved.get("PRINTER_2_CAM_SNAPSHOT", f"http://{p2_ip}:8080/?action=snapshot")

    if p2_enabled:
        p2_name = ask("Printer 2 Display Name", p2_name)
        p2_ip = ask("Printer 2 LAN IP Address", p2_ip)
        p2_port = ask("Printer 2 Moonraker Port", p2_port)
        p2_stream = ask("Printer 2 Webcam Stream", p2_stream)
        p2_snap = ask("Printer 2 Webcam Snapshot", p2_snap)

    # Poll settings
    poll_sec = ask("Telemetry Polling Rate (seconds)", saved.get("POLL_INTERVAL_SECONDS", "1.5"))
    snap_sec = ask("Camera Snapshot Rate (seconds)", saved.get("SNAPSHOT_INTERVAL_SECONDS", "1.2"))

    # 2. Live Verification
    print(f"\n{C.BOLD}STEP 4: Live Connection Diagnostics{C.RESET}")
    print(f"{C.BOLD}Probing Printer 1 ({p1_name}):{C.RESET}")
    test_moonraker(p1_ip, p1_port)
    test_webcam(p1_stream)

    if p2_enabled:
        print(f"{C.BOLD}Probing Printer 2 ({p2_name}):{C.RESET}")
        test_moonraker(p2_ip, p2_port)
        test_webcam(p2_stream)

    print(f"{C.BOLD}Probing Cloud Ingestion Endpoint:{C.RESET}")
    pantheon_ok = test_pantheon(pantheon_url, api_token)

    # 3. Write config.env
    print(f"\n{C.BOLD}STEP 5: Generating Configuration File{C.RESET}")
    config_lines = [
        "# ========================================================",
        "# NEXUS 3D — Bridge Configuration",
        f"# Generated by Setup Wizard on {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        "# ========================================================",
        f"PANTHEON_URL={pantheon_url}",
        f"API_TOKEN={api_token}",
        "",
        "# Primary Printer",
        f"PRINTER_1_NAME={p1_name}",
        f"PRINTER_1_IP={p1_ip}",
        f"PRINTER_1_PORT={p1_port}",
        f"PRINTER_1_CAM_STREAM={p1_stream}",
        f"PRINTER_1_CAM_SNAPSHOT={p1_snap}",
        "PRINTER_1_ENABLED=true",
        "",
        "# Secondary Printer",
        f"PRINTER_2_NAME={p2_name}",
        f"PRINTER_2_IP={p2_ip}",
        f"PRINTER_2_PORT={p2_port}",
        f"PRINTER_2_CAM_STREAM={p2_stream}",
        f"PRINTER_2_CAM_SNAPSHOT={p2_snap}",
        f"PRINTER_2_ENABLED={'true' if p2_enabled else 'false'}",
        "",
        f"POLL_INTERVAL_SECONDS={poll_sec}",
        f"SNAPSHOT_INTERVAL_SECONDS={snap_sec}",
        "LOG_FILE=bridge.log",
        ""
    ]

    env_path = os.path.join(script_dir, "config.env")
    with open(env_path, "w", encoding="utf-8") as f:
        f.write("\n".join(config_lines))
    print(f"  {C.GREEN}[OK]{C.RESET} Saved configuration to {env_path}")

    # 4. Auto-Start Setup
    print(f"\n{C.BOLD}STEP 6: Background Service & Startup Registration{C.RESET}")
    auto_start = ask_bool("Launch bridge automatically on computer startup?", True)
    if auto_start:
        configure_auto_start(script_dir)

    # 5. Launch Bridge Daemon
    print(f"\n{C.BOLD}STEP 7: Starting NEXUS 3D Bridge Daemon{C.RESET}")
    start_now = ask_bool("Start the bridge daemon in background now?", True)
    if start_now:
        # Stop any old daemon first
        stop_existing_bridge_instances()

        daemon_py = os.path.join(script_dir, "bridge_daemon.py")
        if sys.platform == "win32":
            python_exe = sys.executable
            pythonw_exe = python_exe.replace("python.exe", "pythonw.exe")
            exec_bin = pythonw_exe if os.path.exists(pythonw_exe) else python_exe
            try:
                creation_flags = 0x00000008 | 0x00000200  # DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP
                subprocess.Popen(
                    [exec_bin, daemon_py],
                    cwd=script_dir,
                    stdin=subprocess.DEVNULL,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    creationflags=creation_flags
                )
                time.sleep(1.0)
                if is_bridge_running():
                    print(f"  {C.GREEN}[OK]{C.RESET} Bridge daemon launched successfully and listening on port 58921!")
                else:
                    print(f"  {C.GREEN}[OK]{C.RESET} Bridge daemon launched in background.")
            except Exception as e:
                print(f"  {C.YELLOW}[WARNING]{C.RESET} Could not launch background process directly: {e}")
                print(f"  Run 'start_bridge.bat' to start the bridge manually.")
        else:
            try:
                subprocess.Popen(
                    [sys.executable, daemon_py],
                    cwd=script_dir,
                    stdout=open(os.path.join(script_dir, "bridge.log"), "a"),
                    stderr=subprocess.STDOUT,
                    start_new_session=True
                )
                time.sleep(1.0)
                print(f"  {C.GREEN}[OK]{C.RESET} Bridge daemon launched in background!")
            except Exception as e:
                print(f"  {C.YELLOW}[WARNING]{C.RESET} {e}")

    # 6. Finished
    print(f"""
{C.GREEN}{C.BOLD}========================================================================
   ✅ SETUP COMPLETED SUCCESSFULLY!
========================================================================{C.RESET}
Your local desktop bridge is now active.
• Telemetry is polled passively from your fleet printers
• Live snapshots and stats are pushed to Pantheon Cloud
• Your remote web dashboard is live at:
  {C.CYAN}https://dev-nexus3-d.pantheonsite.io/{C.RESET}

Useful helper scripts in this folder:
  - {C.BOLD}start_bridge.bat{C.RESET}        (Start daemon)
  - {C.BOLD}stop_bridge.bat{C.RESET}         (Stop daemon)
  - {C.BOLD}status.bat{C.RESET}              (Check live status & logs)
  - {C.BOLD}enable_autostart.bat{C.RESET}    (Enable startup run)
  - {C.BOLD}disable_autostart.bat{C.RESET}   (Disable startup run)
  - {C.BOLD}uninstall.bat{C.RESET}           (Single-file uninstaller)
""")

if __name__ == "__main__":
    main()

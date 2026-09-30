#!/usr/bin/env python3
"""
=============================================================================
 NEXUS 3D — Uninstaller Wizard
 Cross-Platform Bridge Daemon Removal Engine
=============================================================================
"""

import os
import sys
import shutil
import socket
import subprocess

# ANSI Colors for clean terminal UI
class C:
    CYAN = "\033[96m"
    GREEN = "\033[92m"
    YELLOW = "\033[93m"
    RED = "\033[91m"
    BOLD = "\033[1m"
    DIM = "\033[2m"
    RESET = "\033[0m"

# Windows color support and UTF-8 console encoding
if sys.platform == "win32":
    os.system("")
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
            sys.stderr.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass

def ask(prompt, default):
    text = f"{C.CYAN}?{C.RESET} {prompt} [{C.BOLD}{default}{C.RESET}]: "
    try:
        val = input(text).strip()
        return val if val else default
    except (KeyboardInterrupt, EOFError):
        print("\n\nUninstallation cancelled.")
        sys.exit(0)

def ask_bool(prompt, default_val=True):
    def_str = "Y/n" if default_val else "y/N"
    choice = ask(f"{prompt} ({def_str})", "Y" if default_val else "N")
    return choice.lower().startswith("y")

def banner():
    print(rf"""
{C.RED}{C.BOLD}========================================================================
   _  _________  ____  ______   _____ ___    ___      _    __          
  / |/ / __/ _ \/ / / / __/ /  / _/ // / /__/ _ \____(_)__/ /__ ____   
 /    / _// // / /_/ /\ \/ /__/ _/ // / / _/ // /___/ / _  / -_) __/   
/_/|_/___/____/\____/___/____/_/ /_//_/_/ /____/   /_/\_,_/\__/_/      
           Bridge Daemon v2.1 — Uninstaller Wizard
========================================================================{C.RESET}
""")
    print("This utility will stop the running NEXUS 3D bridge daemon, remove the")
    print("background startup registration, and optionally clean local files.\n")

def stop_processes():
    print(f"{C.BOLD}STEP 1: Stopping Bridge Daemon Processes{C.RESET}")
    stopped_pids = set()

    # 1. Identify listening PID on port 58921 (100% reliable)
    try:
        res = subprocess.run(["netstat", "-ano"], capture_output=True, text=True, check=False)
        for line in res.stdout.splitlines():
            if ":58921" in line and "LISTENING" in line:
                parts = line.strip().split()
                if parts and parts[-1].isdigit():
                    pid = int(parts[-1])
                    stopped_pids.add(pid)
                    if sys.platform == "win32":
                        subprocess.run(["taskkill", "/F", "/PID", str(pid)], capture_output=True, check=False)
                    else:
                        subprocess.run(["kill", "-9", str(pid)], capture_output=True, check=False)
    except Exception:
        pass

    # 2. Check Win32 processes matching bridge_daemon.py
    if sys.platform == "win32":
        try:
            ps_cmd = (
                "try { $conns = Get-NetTCPConnection -LocalPort 58921 -ErrorAction SilentlyContinue; "
                "if ($conns) { foreach ($c in $conns) { if ($c.OwningProcess -gt 0) { Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue; Write-Output $c.OwningProcess } } } } catch {}; "
                "try { $procs = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*bridge_daemon.py*' }; "
                "if ($procs) { foreach ($p in $procs) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue; Write-Output $p.ProcessId } } } catch {};"
            )
            res = subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps_cmd], capture_output=True, text=True, check=False)
            for line in res.stdout.splitlines():
                line = line.strip()
                if line.isdigit():
                    stopped_pids.add(int(line))
        except Exception:
            pass
    else:
        try:
            subprocess.run(["pkill", "-9", "-f", "bridge_daemon.py"], capture_output=True, check=False)
        except Exception:
            pass

    if stopped_pids:
        pid_list = ", ".join(str(p) for p in stopped_pids)
        print(f"  {C.GREEN}[OK]{C.RESET} Terminated {len(stopped_pids)} active bridge process(es): PIDs {pid_list}")
    else:
        print(f"  {C.DIM}[INFO]{C.RESET} No active bridge processes were running.")

def remove_autostart():
    print(f"\n{C.BOLD}STEP 2: Removing Startup / Background Service Registration{C.RESET}")
    removed = False

    if sys.platform == "win32":
        # Remove from Registry Run key
        try:
            import winreg
            reg_key = winreg.OpenKey(
                winreg.HKEY_CURRENT_USER,
                r"Software\Microsoft\Windows\CurrentVersion\Run",
                0,
                winreg.KEY_SET_VALUE
            )
            try:
                winreg.DeleteValue(reg_key, "Nexus3DBridge")
                print(f"  {C.GREEN}[OK]{C.RESET} Removed Windows Startup Registry Run key")
                removed = True
            except FileNotFoundError:
                pass
            winreg.CloseKey(reg_key)
        except Exception as e:
            print(f"  {C.YELLOW}[WARNING]{C.RESET} Could not inspect Registry Run key: {e}")

        # Remove from Startup folder
        try:
            startup_dir = os.path.join(os.environ.get("APPDATA", ""), "Microsoft", "Windows", "Start Menu", "Programs", "Startup")
            vbs_path = os.path.join(startup_dir, "Nexus3DBridge.vbs")
            if os.path.exists(vbs_path):
                os.remove(vbs_path)
                print(f"  {C.GREEN}[OK]{C.RESET} Removed Windows Startup launcher: {vbs_path}")
                removed = True
            else:
                print(f"  {C.DIM}[INFO]{C.RESET} No Windows Startup launcher found in {startup_dir}")
        except Exception as e:
            print(f"  {C.YELLOW}[WARNING]{C.RESET} Could not check/remove Windows Startup launcher: {e}")

    elif sys.platform.startswith("linux"):
        service_file = os.path.expanduser("~/.config/systemd/user/nexus3d-bridge.service")
        if os.path.exists(service_file):
            try:
                subprocess.run(["systemctl", "--user", "stop", "nexus3d-bridge.service"], check=False)
                subprocess.run(["systemctl", "--user", "disable", "nexus3d-bridge.service"], check=False)
                os.remove(service_file)
                subprocess.run(["systemctl", "--user", "daemon-reload"], check=False)
                print(f"  {C.GREEN}[OK]{C.RESET} Stopped, disabled, and removed user systemd service: {service_file}")
                removed = True
            except Exception as e:
                print(f"  {C.YELLOW}[WARNING]{C.RESET} Could not fully remove systemd service: {e}")

    if not removed:
        print(f"  {C.GREEN}[OK]{C.RESET} System startup is clean (no automatic background bridge tasks).")

def clean_files(script_dir):
    print(f"\n{C.BOLD}STEP 3: Optional File Cleanup{C.RESET}")
    
    # 1. config.env
    env_file = os.path.join(script_dir, "config.env")
    if os.path.exists(env_file):
        if ask_bool("Delete configuration file (config.env)?", False):
            try:
                os.remove(env_file)
                print(f"  {C.GREEN}[OK]{C.RESET} Deleted {env_file}")
            except Exception as e:
                print(f"  {C.YELLOW}[WARNING]{C.RESET} Could not delete config.env: {e}")
        else:
            print(f"  {C.DIM}[KEPT]{C.RESET} Kept config.env for future re-installation.")

    # 2. bridge.log
    log_file = os.path.join(script_dir, "bridge.log")
    if os.path.exists(log_file):
        if ask_bool("Delete local bridge log file (bridge.log)?", True):
            try:
                os.remove(log_file)
                print(f"  {C.GREEN}[OK]{C.RESET} Deleted {log_file}")
            except Exception as e:
                print(f"  {C.YELLOW}[WARNING]{C.RESET} Could not delete bridge.log: {e}")
        else:
            print(f"  {C.DIM}[KEPT]{C.RESET} Kept bridge.log.")

    # 3. python_runtime
    runtime_dir = os.path.join(script_dir, "python_runtime")
    if os.path.exists(runtime_dir):
        if ask_bool("Delete downloaded portable Python runtime (python_runtime/)?", False):
            try:
                shutil.rmtree(runtime_dir, ignore_errors=True)
                print(f"  {C.GREEN}[OK]{C.RESET} Deleted portable python runtime folder.")
            except Exception as e:
                print(f"  {C.YELLOW}[WARNING]{C.RESET} Could not delete python_runtime: {e}")

def main():
    banner()
    confirm = ask_bool("Are you sure you want to uninstall the NEXUS 3D bridge daemon?", True)
    if not confirm:
        print("\nUninstallation aborted. No changes were made.")
        sys.exit(0)

    print()
    script_dir = os.path.dirname(os.path.abspath(__file__))

    # Step 1: Stop processes
    stop_processes()

    # Step 2: Remove autostart
    remove_autostart()

    # Step 3: Clean files
    clean_files(script_dir)

    print(f"""
{C.GREEN}{C.BOLD}========================================================================
   ✅ UNINSTALLATION COMPLETED SUCCESSFULLY!
========================================================================{C.RESET}
The NEXUS 3D bridge daemon has been stopped and removed from system startup.
Your 3D printers and Pantheon WebOps dashboard remain completely untouched.

To reinstall in the future, simply run {C.BOLD}install.bat{C.RESET} again!
""")

if __name__ == "__main__":
    main()

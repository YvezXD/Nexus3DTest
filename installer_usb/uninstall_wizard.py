#!/usr/bin/env python3
"""
=============================================================================
 NEXUS 3D — Bridge Daemon Uninstaller & Cleanup Utility
 Cross-platform uninstaller that safely terminates all running bridge processes,
 deregisters auto-start tasks / systemd services, and removes local files.
=============================================================================
"""

import os
import sys
import shutil
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

# Windows color support
if sys.platform == "win32":
    os.system("")

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
              Bridge Daemon — Uninstaller & Service Removal
========================================================================{C.RESET}
""")
    print("This utility will stop the running NEXUS 3D bridge daemon, remove the")
    print("background startup registration, and optionally remove configuration files.\n")

def stop_processes():
    print(f"{C.BOLD}STEP 1: Stopping Bridge Daemon Processes{C.RESET}")
    stopped_count = 0
    if sys.platform == "win32":
        ps_cmd = (
            "Get-WmiObject Win32_Process | "
            "Where-Object { $_.CommandLine -like '*bridge_daemon.py*' } | "
            "ForEach-Object { Stop-Process -Id $_.ProcessId -Force; Write-Output $_.ProcessId }"
        )
        try:
            res = subprocess.run(
                ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps_cmd],
                capture_output=True,
                text=True,
                check=False
            )
            pids = [line.strip() for line in res.stdout.strip().splitlines() if line.strip().isdigit()]
            stopped_count = len(pids)
            if stopped_count > 0:
                print(f"  {C.GREEN}[OK]{C.RESET} Terminated {stopped_count} active bridge process(es): PIDs {', '.join(pids)}")
            else:
                print(f"  {C.DIM}[INFO]{C.RESET} No active bridge processes were running.")
        except Exception as e:
            print(f"  {C.YELLOW}[WARNING]{C.RESET} Error scanning for processes: {e}")
    else:
        try:
            res = subprocess.run(["pkill", "-f", "bridge_daemon.py"], capture_output=True, check=False)
            if res.returncode == 0:
                print(f"  {C.GREEN}[OK]{C.RESET} Terminated running bridge daemon process(es).")
            else:
                print(f"  {C.DIM}[INFO]{C.RESET} No active bridge processes found.")
        except Exception as e:
            print(f"  {C.YELLOW}[WARNING]{C.RESET} {e}")

def remove_autostart():
    print(f"\n{C.BOLD}STEP 2: Removing Startup / Background Service Registration{C.RESET}")
    removed = False

    if sys.platform == "win32":
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
        service_file = "/etc/systemd/system/nexus3d-bridge.service"
        if os.path.exists(service_file):
            try:
                subprocess.run(["sudo", "systemctl", "stop", "nexus3d-bridge.service"], check=False)
                subprocess.run(["sudo", "systemctl", "disable", "nexus3d-bridge.service"], check=False)
                subprocess.run(["sudo", "rm", "-f", service_file], check=False)
                subprocess.run(["sudo", "systemctl", "daemon-reload"], check=False)
                print(f"  {C.GREEN}[OK]{C.RESET} Stopped, disabled, and removed systemd service: {service_file}")
                removed = True
            except Exception as e:
                print(f"  {C.YELLOW}[WARNING]{C.RESET} Could not fully remove systemd service: {e}")
        else:
            print(f"  {C.DIM}[INFO]{C.RESET} No systemd service found at {service_file}")

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

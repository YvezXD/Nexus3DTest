#!/usr/bin/env python3
"""
=============================================================================
 NEXUS 3D — Local Bridge Daemon
 Non-invasive passive telemetry collector and webcam snapshot relay.
 
 Runs locally on a LAN desktop or Raspberry Pi.
 Zero modifications required on the 3D printers.
 Zero external dependencies (uses standard library only).
=============================================================================
"""

import os
import sys
import time
import json
import base64
import socket
import logging
import subprocess
import urllib.request
import urllib.error
from urllib.parse import urlparse, quote
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

# ─── Configuration Loader ───

def load_env(env_path="config.env"):
    """Loads key-value pairs from a .env file into os.environ if not already set."""
    if not os.path.exists(env_path):
        # Look in script directory
        script_dir = os.path.dirname(os.path.abspath(__file__))
        alt_path = os.path.join(script_dir, env_path)
        if os.path.exists(alt_path):
            env_path = alt_path

    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                k = k.strip()
                v = v.strip().strip('"').strip("'")
                if k and k not in os.environ:
                    os.environ[k] = v

load_env()

# ─── Setup Settings ───
PANTHEON_URL = os.environ.get("PANTHEON_URL", "https://dev-nexus3-d.pantheonsite.io/index.php?route=api&action=push")
API_TOKEN = os.environ.get("API_TOKEN", "nxs_a7f3b9e2d1c4056789abcdef01234567")

POLL_INTERVAL = float(os.environ.get("POLL_INTERVAL_SECONDS", "1.5"))
SNAPSHOT_INTERVAL = float(os.environ.get("SNAPSHOT_INTERVAL_SECONDS", "1.2"))
LOG_FILE = os.environ.get("LOG_FILE", "bridge.log")

# Setup Printers Config
PRINTERS = [
    {
        "id": "p1",
        "name": os.environ.get("PRINTER_1_NAME", "QIDI Q2"),
        "ip": os.environ.get("PRINTER_1_IP", "192.168.1.124"),
        "port": int(os.environ.get("PRINTER_1_PORT", "7125")),
        "cam_stream": os.environ.get("PRINTER_1_CAM_STREAM", "http://192.168.1.124/webcam/?action=stream"),
        "cam_snapshot": os.environ.get("PRINTER_1_CAM_SNAPSHOT", "http://192.168.1.124/webcam/?action=snapshot"),
        "enabled": os.environ.get("PRINTER_1_ENABLED", "true").lower() == "true",
    }
]

# Optional Printer 2
if os.environ.get("PRINTER_2_ENABLED", "true").lower() == "true":
    PRINTERS.append({
        "id": "p2",
        "name": os.environ.get("PRINTER_2_NAME", "FLASHFORGE AD5X"),
        "ip": os.environ.get("PRINTER_2_IP", "192.168.1.36"),
        "port": int(os.environ.get("PRINTER_2_PORT", "7125")),
        "cam_stream": os.environ.get("PRINTER_2_CAM_STREAM", "http://192.168.1.36:8080/?action=stream"),
        "cam_snapshot": os.environ.get("PRINTER_2_CAM_SNAPSHOT", "http://192.168.1.36:8080/?action=snapshot"),
        "enabled": True,
    })

# ─── Windows Console Encoding Fix ───
if sys.platform == "win32" and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# ─── Logging Setup ───
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(LOG_FILE, encoding="utf-8")
    ]
)
logger = logging.getLogger("NexusBridge")

# ─── Single-Instance Protection ───
_instance_socket = None

def acquire_single_instance_lock(port=58921):
    """
    Binds to localhost:58921 to ensure only one bridge daemon runs at a time.
    Prevents duplicate background instances when auto-started.
    """
    global _instance_socket
    try:
        _instance_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        _instance_socket.bind(("127.0.0.1", port))
        _instance_socket.listen(1)
        return True
    except (socket.error, OSError):
        return False

# ─── Windows / Cross-Platform Auto-Start Registration ───

def ensure_autostart(enable=True):
    r"""
    Configures the bridge daemon to start automatically when Windows boots.
    Uses multi-layer registration:
      1. Windows Registry (HKCU\Software\Microsoft\Windows\CurrentVersion\Run)
      2. Windows Startup folder silent launcher (.vbs)
      3. Linux systemd user service (if running on Linux)
    """
    script_path = os.path.abspath(__file__)
    script_dir = os.path.dirname(script_path)

    if sys.platform == "win32":
        try:
            import winreg

            # Detect pythonw.exe to run without a black console window
            python_exe = sys.executable
            pythonw_exe = python_exe.replace("python.exe", "pythonw.exe")
            exec_bin = pythonw_exe if os.path.exists(pythonw_exe) else python_exe

            run_cmd = f'"{exec_bin}" "{script_path}"'

            # Layer 1: Windows Registry Run Key
            try:
                reg_key = winreg.OpenKey(
                    winreg.HKEY_CURRENT_USER,
                    r"Software\Microsoft\Windows\CurrentVersion\Run",
                    0,
                    winreg.KEY_SET_VALUE | winreg.KEY_READ
                )
                if enable:
                    winreg.SetValueEx(reg_key, "Nexus3DBridge", 0, winreg.REG_SZ, run_cmd)
                    logger.info(f"Registered Windows Startup Registry Run key: {run_cmd}")
                else:
                    try:
                        winreg.DeleteValue(reg_key, "Nexus3DBridge")
                        logger.info("Removed Windows Startup Registry Run key.")
                    except FileNotFoundError:
                        pass
                winreg.CloseKey(reg_key)
            except Exception as e:
                logger.warning(f"Registry auto-start configuration: {e}")

            # Layer 2: Windows Startup Folder (Silent VBScript Launcher)
            startup_dir = os.path.join(
                os.environ.get("APPDATA", ""),
                "Microsoft", "Windows", "Start Menu", "Programs", "Startup"
            )
            if os.path.exists(startup_dir):
                vbs_path = os.path.join(startup_dir, "Nexus3DBridge.vbs")
                if enable:
                    vbs_code = f'''Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "{script_dir}"
WshShell.Run """{exec_bin}"" ""{script_path}""", 0, False
'''
                    with open(vbs_path, "w", encoding="utf-8") as f:
                        f.write(vbs_code)
                    logger.info(f"Verified Windows Startup folder launcher: {vbs_path}")
                else:
                    if os.path.exists(vbs_path):
                        os.remove(vbs_path)
                        logger.info("Removed Windows Startup folder launcher.")

            return True
        except Exception as e:
            logger.warning(f"Could not configure Windows startup auto-run: {e}")
            return False

    elif sys.platform.startswith("linux"):
        service_file = os.path.expanduser("~/.config/systemd/user/nexus3d-bridge.service")
        if enable:
            try:
                os.makedirs(os.path.dirname(service_file), exist_ok=True)
                service_content = f"""[Unit]
Description=NEXUS 3D Telemetry Bridge Daemon
After=network.target

[Service]
Type=simple
WorkingDirectory={script_dir}
ExecStart={sys.executable} {script_path}
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
"""
                with open(service_file, "w", encoding="utf-8") as f:
                    f.write(service_content)
                subprocess.run(["systemctl", "--user", "daemon-reload"], check=False)
                subprocess.run(["systemctl", "--user", "enable", "--now", "nexus3d-bridge.service"], check=False)
                logger.info(f"Linux user systemd service enabled: {service_file}")
                return True
            except Exception as e:
                logger.warning(f"Could not configure Linux systemd user service: {e}")
        else:
            if os.path.exists(service_file):
                try:
                    subprocess.run(["systemctl", "--user", "stop", "nexus3d-bridge.service"], check=False)
                    subprocess.run(["systemctl", "--user", "disable", "nexus3d-bridge.service"], check=False)
                    os.remove(service_file)
                    subprocess.run(["systemctl", "--user", "daemon-reload"], check=False)
                    logger.info("Linux user systemd service removed.")
                except Exception as e:
                    logger.warning(f"Could not remove Linux user service: {e}")
    return False

# ─── Telemetry Harvester ───

def query_moonraker(printer):
    """
    Issues read-only HTTP GET to Moonraker objects query endpoint.
    Tries configured port, then falls back to port 80 (nginx proxy).
    """
    ip = printer["ip"]
    port = printer["port"]
    endpoints = [
        f"http://{ip}:{port}",
        f"http://{ip}"
    ]

    objects = (
        "print_stats&virtual_sdcard&heater_bed&extruder&toolhead&display_status"
        "&heater_generic%20chamber&temperature_sensor%20Chamber_Thermal_Protection_Sensor"
        "&fan&gcode_move&fan_generic%20cooling_fan&fan_generic%20part_fan&fan_generic%20fanM106"
    )
    query_path = f"/printer/objects/query?{objects}"

    raw_data = None
    last_err = None

    for base in endpoints:
        url = base + query_path
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Nexus3D-Bridge/2.0", "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=1.5) as resp:
                if resp.status == 200:
                    raw_data = json.loads(resp.read().decode("utf-8"))
                    break
        except Exception as e:
            last_err = e

    if not raw_data or "result" not in raw_data or "status" not in raw_data["result"]:
        return None

    status = raw_data["result"]["status"]

    # Normalize telemetry structure
    telemetry = {
        "id": printer["id"],
        "name": printer["name"],
        "ip": printer["ip"],
        "port": printer["port"],
        "online": True,
        "state": "ready",
        "filename": "None (Standby)",
        "currentLayer": 0,
        "totalLayer": 0,
        "progress": 0.0,
        "elapsedSeconds": 0,
        "totalDurationSeconds": 0,
        "filamentUsedMm": 0.0,
        "extruder": {"actual": 0.0, "target": 0.0, "power": 0.0},
        "bed": {"actual": 0.0, "target": 0.0, "power": 0.0},
        "chamber": {"actual": 0.0},
        "toolhead": {"x": 0.0, "y": 0.0, "z": 0.0, "maxVel": 600, "maxAccel": 10000, "fan": 0, "speedFactor": 100}
    }

    # Print stats
    if "print_stats" in status:
        ps = status["print_stats"]
        telemetry["state"] = ps.get("state", "ready").lower()
        telemetry["filename"] = ps.get("filename", "None (Standby)")
        telemetry["filamentUsedMm"] = round(float(ps.get("filament_used") or 0.0), 1)
        dur = ps.get("print_duration") or ps.get("total_duration") or 0.0
        telemetry["elapsedSeconds"] = round(float(dur), 0)

        info = ps.get("info", {})
        if isinstance(info, dict):
            telemetry["currentLayer"] = int(info.get("current_layer") or 0)
            telemetry["totalLayer"] = int(info.get("total_layer") or 0)

    # Progress calculation matching Fluidd / Moonraker
    prog = 0.0
    if "virtual_sdcard" in status and status["virtual_sdcard"].get("progress") is not None:
        prog = float(status["virtual_sdcard"]["progress"])
    elif "display_status" in status and status["display_status"].get("progress") is not None:
        prog = float(status["display_status"]["progress"])
    elif telemetry["totalLayer"] > 0:
        prog = telemetry["currentLayer"] / float(telemetry["totalLayer"])

    if prog > 0:
        telemetry["progress"] = round(prog * 100.0, 1)
        dur = telemetry["elapsedSeconds"]
        if dur > 0 and prog > 0:
            est_total = dur / prog
            telemetry["totalDurationSeconds"] = round(est_total, 0)

    # When print is complete, cancelled, or standby, reset metrics so old print data never lingers
    if telemetry["state"] not in ("printing", "paused"):
        telemetry["progress"] = 0.0
        telemetry["currentLayer"] = 0
        telemetry["totalLayer"] = 0
        telemetry["filename"] = "None (Standby)"
        telemetry["elapsedSeconds"] = 0
        telemetry["totalDurationSeconds"] = 0
        telemetry["filamentUsedMm"] = 0.0

    # Heaters
    if "extruder" in status:
        ext = status["extruder"]
        telemetry["extruder"]["actual"] = round(float(ext.get("temperature", 0.0)), 1)
        telemetry["extruder"]["target"] = round(float(ext.get("target", 0.0)), 1)
        telemetry["extruder"]["power"] = round(float(ext.get("power", 0.0)), 2)

    if "heater_bed" in status:
        bed = status["heater_bed"]
        telemetry["bed"]["actual"] = round(float(bed.get("temperature", 0.0)), 1)
        telemetry["bed"]["target"] = round(float(bed.get("target", 0.0)), 1)
        telemetry["bed"]["power"] = round(float(bed.get("power", 0.0)), 2)

    # Chamber temperature (Queried across known Klipper/Moonraker chamber sensors)
    ch_temp = None
    if "heater_generic chamber" in status:
        ch_temp = float(status["heater_generic chamber"].get("temperature", 0.0))
    elif "temperature_sensor Chamber_Thermal_Protection_Sensor" in status:
        ch_temp = float(status["temperature_sensor Chamber_Thermal_Protection_Sensor"].get("temperature", 0.0))
    elif "chamber" in status:
        ch_temp = float(status["chamber"].get("temperature", 0.0))
    elif "temperature_sensor chamber" in status:
        ch_temp = float(status["temperature_sensor chamber"].get("temperature", 0.0))

    if ch_temp is not None and ch_temp > 0:
        telemetry["chamber"]["actual"] = round(ch_temp, 1)

    # Toolhead kinematics
    if "toolhead" in status:
        th = status["toolhead"]
        pos = th.get("position", [0.0, 0.0, 0.0, 0.0])
        telemetry["toolhead"]["x"] = round(float(pos[0]), 1)
        telemetry["toolhead"]["y"] = round(float(pos[1]), 1)
        telemetry["toolhead"]["z"] = round(float(pos[2]), 2)
        telemetry["toolhead"]["maxVel"] = int(th.get("max_velocity", 600))
        telemetry["toolhead"]["maxAccel"] = int(th.get("max_accel", 10000))

    # Part Cooling Fan & Speed Factor
    fan_speed = 0.0
    if "fan" in status and status["fan"].get("speed") is not None:
        fan_speed = float(status["fan"]["speed"])
    elif "fan_generic fanM106" in status and status["fan_generic fanM106"].get("speed") is not None:
        fan_speed = float(status["fan_generic fanM106"]["speed"])
    elif "fan_generic cooling_fan" in status and status["fan_generic cooling_fan"].get("speed") is not None:
        fan_speed = float(status["fan_generic cooling_fan"]["speed"])
    elif "fan_generic part_fan" in status and status["fan_generic part_fan"].get("speed") is not None:
        fan_speed = float(status["fan_generic part_fan"]["speed"])
    telemetry["toolhead"]["fan"] = int(round(fan_speed * 100))

    if "gcode_move" in status and status["gcode_move"].get("speed_factor") is not None:
        telemetry["toolhead"]["speedFactor"] = int(round(float(status["gcode_move"]["speed_factor"]) * 100))

    return telemetry

# ─── Snapshot Capture (JPEG / MJPEG) ───

def capture_webcam_snapshot(printer):
    """
    Retrieves a single JPEG frame from the printer's webcam.
    Tries direct snapshot URL first. If that fails or gives stream,
    extracts the first valid JPEG frame (0xFFD8 to 0xFFD9) from the stream.
    """
    snap_urls = []
    if printer.get("cam_snapshot"):
        snap_urls.append(printer["cam_snapshot"])

    stream_url = printer.get("cam_stream", "")
    if stream_url:
        # Derive snapshot URL if MJPEG stream
        if "?action=stream" in stream_url:
            derived = stream_url.replace("?action=stream", "?action=snapshot")
            if derived not in snap_urls:
                snap_urls.append(derived)
        snap_urls.append(stream_url)

    for url in snap_urls:
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Nexus3D-Bridge/2.0"})
            with urllib.request.urlopen(req, timeout=3.0) as resp:
                content_type = resp.headers.get("Content-Type", "")

                # Direct JPEG response
                if "image/jpeg" in content_type or "image/jpg" in content_type:
                    data = resp.read()
                    if len(data) > 500:
                        return data

                # MJPEG Stream parsing (look for JPEG start 0xFFD8 and end 0xFFD9)
                buffer = b""
                start_idx = -1
                # Read chunks up to 256KB to grab the first complete frame
                for _ in range(64):
                    chunk = resp.read(4096)
                    if not chunk:
                        break
                    buffer += chunk
                    if start_idx == -1:
                        start_idx = buffer.find(b"\xff\xd8")
                    if start_idx != -1:
                        end_idx = buffer.find(b"\xff\xd9", start_idx + 2)
                        if end_idx != -1:
                            frame = buffer[start_idx : end_idx + 2]
                            if len(frame) > 500:
                                return frame
        except Exception:
            continue

# ─── Remote Cloud Command Execution ───

def execute_printer_command(cmd):
    """
    Executes a queued command on the target 3D printer via its local Moonraker REST API.
    Enables Pause, Cancel, Resume, E-Stop, and G-Code to work from anywhere across Cloud & LAN.
    """
    printer_id = cmd.get("printer", "p1")
    action = cmd.get("action", "").lower()
    gcode = cmd.get("gcode", "").strip()

    # Locate printer configuration
    target_p = None
    for p in PRINTERS:
        if p["id"] == printer_id:
            target_p = p
            break
    if not target_p and PRINTERS:
        target_p = PRINTERS[0]

    if not target_p:
        logger.warning(f"Command dropped: Unknown printer ID '{printer_id}'")
        return False

    ip = target_p["ip"]
    port = target_p["port"]
    p_name = target_p["name"]

    logger.info(f">> [COMMAND RECEIVED] Target: {p_name} ({ip}:{port}) | Action: {action.upper()} | GCode: {gcode}")

    endpoints = []

    if action == "estop":
        # Emergency Stop (M112) - execute immediately
        endpoints = [
            f"http://{ip}:{port}/printer/emergency_stop",
            f"http://{ip}:{port}/printer/gcode/script?script=M112"
        ]
    elif action == "pause":
        endpoints = [
            f"http://{ip}:{port}/printer/print/pause",
            f"http://{ip}:{port}/printer/gcode/script?script=PAUSE"
        ]
    elif action == "resume":
        endpoints = [
            f"http://{ip}:{port}/printer/print/resume",
            f"http://{ip}:{port}/printer/gcode/script?script=RESUME"
        ]
    elif action == "cancel":
        endpoints = [
            f"http://{ip}:{port}/printer/print/cancel",
            f"http://{ip}:{port}/printer/gcode/script?script=CANCEL_PRINT"
        ]
    elif action == "temperature":
        params = cmd.get("params", {})
        temp_type = params.get("type") or params.get("target") or "ext"
        temp_val = float(params.get("temp", 0))
        gc = f"M140 S{temp_val}" if temp_type in ("bed", "heater_bed") else f"M104 S{temp_val}"
        endpoints = [
            f"http://{ip}:{port}/printer/gcode/script?script={quote(gc)}"
        ]
    elif action == "motors_off":
        endpoints = [
            f"http://{ip}:{port}/printer/gcode/script?script=M84"
        ]
    elif action == "gcode" and gcode:
        endpoints = [
            f"http://{ip}:{port}/printer/gcode/script?script={quote(gcode)}"
        ]

    success = False
    for url in endpoints:
        try:
            req = urllib.request.Request(
                url,
                data=b"",
                headers={"User-Agent": "Nexus3D-Bridge/2.0"},
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=1.8) as resp:
                if resp.status in (200, 204):
                    logger.info(f"[OK] [COMMAND SUCCESS] {action.upper()} executed on {p_name}")
                    success = True
                    break
        except Exception as e:
            logger.warning(f"[FAIL] [COMMAND TRY] {url}: {e}")

    return success

# ─── Push Telemetry to Cloud with Adaptive Timing ───

def push_to_pantheon(payload):
    """
    POSTs telemetry and snapshots to Pantheon ingestion API.
    Returns: (success: bool, message: str, commands: list, upload_duration: float)
    """
    data_bytes = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        PANTHEON_URL,
        data=data_bytes,
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json, text/plain, */*",
            "Authorization": f"Bearer {API_TOKEN}",
            "X-API-TOKEN": API_TOKEN,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Nexus3D-Bridge/2.0",
            "Connection": "keep-alive"
        },
        method="POST"
    )

    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=6.0) as resp:
            resp_body = resp.read().decode("utf-8", errors="ignore")
            duration = time.time() - t0
            if resp.status == 200:
                commands = []
                try:
                    parsed = json.loads(resp_body)
                    if isinstance(parsed, dict) and "commands" in parsed and isinstance(parsed["commands"], list):
                        commands = parsed["commands"]
                except Exception:
                    pass
                return True, resp_body, commands, duration
            return False, f"HTTP {resp.status}: {resp_body[:100]}", [], duration
    except urllib.error.HTTPError as e:
        duration = time.time() - t0
        err_body = ""
        try:
            err_body = e.read(256).decode("utf-8", errors="ignore")
        except Exception:
            pass
        return False, f"HTTPError {e.code}: {err_body[:100]}", [], duration
    except (urllib.error.URLError, TimeoutError, socket.timeout, Exception) as e:
        duration = time.time() - t0
        return False, str(e), [], duration

# ─── Parallel Local Harvest ───

def harvest_all_telemetry_parallel():
    """Queries all active printers concurrently to eliminate sequential latency."""
    enabled_printers = [p for p in PRINTERS if p.get("enabled", True)]
    results = []
    with ThreadPoolExecutor(max_workers=min(len(enabled_printers) or 1, 4)) as pool:
        future_map = {pool.submit(query_moonraker, p): p for p in enabled_printers}
        for fut in future_map:
            p = future_map[fut]
            try:
                tel = fut.result()
                if tel:
                    results.append(tel)
                else:
                    results.append({
                        "id": p["id"],
                        "name": p["name"],
                        "ip": p["ip"],
                        "online": False,
                        "state": "offline"
                    })
            except Exception:
                results.append({
                    "id": p["id"],
                    "name": p["name"],
                    "ip": p["ip"],
                    "online": False,
                    "state": "offline"
                })

    # Sort to preserve deterministic order (p1 first, p2 second)
    results.sort(key=lambda x: x.get("id", ""))
    return results

# ─── Main Polling Loop with Low-Bandwidth Resilience ───

def run_bridge():
    logger.info("======================================================")
    logger.info("  NEXUS 3D — Local Bridge Daemon v2.1 (Low-Bandwidth Engine)")
    logger.info(f"  Target Cloud: {PANTHEON_URL}")
    for p in PRINTERS:
        logger.info(f"  Monitoring Printer: {p['name']} ({p['ip']}:{p['port']})")
    logger.info("======================================================")

    last_snapshot_time = 0.0
    adaptive_snap_interval = SNAPSHOT_INTERVAL
    consecutive_upload_failures = 0

    while True:
        try:
            loop_start = time.time()
            telemetry_list = harvest_all_telemetry_parallel()
            snapshots_dict = {}

            # Low-bandwidth optimization:
            # If upload latency is high or failed, dynamically throttle snapshot frequency
            # so lightweight telemetry packets (1 KB) are never starved or delayed.
            capture_snapshot_now = (
                consecutive_upload_failures == 0 and 
                (loop_start - last_snapshot_time) >= adaptive_snap_interval
            )

            if capture_snapshot_now:
                # Capture snapshots in parallel
                enabled = [p for p in PRINTERS if p.get("enabled", True)]
                with ThreadPoolExecutor(max_workers=min(len(enabled) or 1, 4)) as pool:
                    snap_futures = {pool.submit(capture_webcam_snapshot, p): p["id"] for p in enabled}
                    for sf in snap_futures:
                        pid = snap_futures[sf]
                        try:
                            jpg = sf.result()
                            if jpg and len(jpg) > 500:
                                snapshots_dict[pid] = base64.b64encode(jpg).decode("ascii")
                        except Exception:
                            pass

                if snapshots_dict:
                    last_snapshot_time = loop_start

            # Push to Pantheon
            if telemetry_list:
                payload = {
                    "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                    "printers": telemetry_list
                }
                if snapshots_dict:
                    payload["snapshots"] = snapshots_dict

                success, msg, commands, upload_sec = push_to_pantheon(payload)

                if success:
                    consecutive_upload_failures = 0
                    p1_info = telemetry_list[0] if telemetry_list else {}
                    status_str = f"state={p1_info.get('state')} progress={p1_info.get('progress')}%"
                    snap_str = f"+ snap({len(snapshots_dict)})" if snapshots_dict else ""
                    logger.info(f"Pushed telemetry to Pantheon: {status_str} {snap_str} ({upload_sec:.2f}s)")

                    # Adaptive Snapshot Timing:
                    # If uplink took > 1.2s, throttle back snapshots to keep telemetry responsive
                    if upload_sec > 1.4:
                        adaptive_snap_interval = min(8.0, adaptive_snap_interval + 1.0)
                        logger.info(f"Slow uplink detected ({upload_sec:.2f}s). Throttling camera snapshots to every {adaptive_snap_interval:.1f}s")
                    elif upload_sec < 0.6:
                        adaptive_snap_interval = max(SNAPSHOT_INTERVAL, adaptive_snap_interval - 0.5)

                    # Execute any queued commands immediately
                    if commands:
                        logger.info(f">> [COMMANDS] Received {len(commands)} remote command(s) from Cloud Dashboard!")
                        for cmd in commands:
                            try:
                                execute_printer_command(cmd)
                            except Exception as cmd_err:
                                logger.error(f"Error executing command: {cmd_err}")

                else:
                    consecutive_upload_failures += 1
                    logger.warning(f"Failed to push telemetry to Pantheon: {msg} (Failures: {consecutive_upload_failures})")
                    # If failing, back off snapshot interval to give network breathing room
                    adaptive_snap_interval = min(10.0, adaptive_snap_interval + 2.0)
                    time.sleep(1.0)

            # Sleep remaining time
            elapsed = time.time() - loop_start
            sleep_time = max(0.4, POLL_INTERVAL - elapsed)
            time.sleep(sleep_time)

        except Exception as e:
            logger.error(f"Unexpected error in bridge loop: {e}")
            time.sleep(2.0)

if __name__ == "__main__":
    # 1. CLI Commands for manual toggle
    if "--enable-autostart" in sys.argv or "--install-autostart" in sys.argv:
        print("[*] Configuring NEXUS 3D Bridge Daemon to auto-run on Windows startup...")
        if ensure_autostart(True):
            print("[OK] Auto-run on Windows startup has been successfully enabled!")
        else:
            print("[ERROR] Could not configure auto-run.")
        sys.exit(0)

    if "--disable-autostart" in sys.argv or "--uninstall-autostart" in sys.argv:
        print("[*] Disabling NEXUS 3D Bridge Daemon Windows auto-run...")
        ensure_autostart(False)
        print("[OK] Auto-run on Windows startup has been removed.")
        sys.exit(0)

    # 2. Single-Instance Protection: prevent duplicate background processes
    if not acquire_single_instance_lock():
        logger.info("Another instance of NEXUS 3D Bridge Daemon is already running. Exiting cleanly.")
        sys.exit(0)

    # 3. Automatically ensure auto-start registration on every launch (self-enrolling)
    auto_start_on_boot = os.environ.get("AUTO_START_ON_BOOT", "true").lower() == "true"
    if auto_start_on_boot:
        ensure_autostart(True)

    while True:
        try:
            run_bridge()
        except KeyboardInterrupt:
            logger.info("Bridge daemon stopped by user.")
            sys.exit(0)
        except Exception as e:
            logger.error(f"Bridge daemon error: {e}. Resuming in 3 seconds...")
            time.sleep(3.0)

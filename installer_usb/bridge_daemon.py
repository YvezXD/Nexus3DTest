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
import logging
import urllib.request
import urllib.error
from urllib.parse import urlparse
from datetime import datetime

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

POLL_INTERVAL = float(os.environ.get("POLL_INTERVAL_SECONDS", "2.0"))
SNAPSHOT_INTERVAL = float(os.environ.get("SNAPSHOT_INTERVAL_SECONDS", "2.0"))
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
if os.environ.get("PRINTER_2_ENABLED", "false").lower() == "true":
    PRINTERS.append({
        "id": "p2",
        "name": os.environ.get("PRINTER_2_NAME", "Printer 02 (CoreXY)"),
        "ip": os.environ.get("PRINTER_2_IP", "192.168.1.36"),
        "port": int(os.environ.get("PRINTER_2_PORT", "7125")),
        "cam_stream": os.environ.get("PRINTER_2_CAM_STREAM", "http://192.168.1.36:8080/?action=stream"),
        "cam_snapshot": os.environ.get("PRINTER_2_CAM_SNAPSHOT", "http://192.168.1.36:8080/?action=snapshot"),
        "enabled": True,
    })

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
    )
    query_path = f"/printer/objects/query?{objects}"

    raw_data = None
    last_err = None

    for base in endpoints:
        url = base + query_path
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Nexus3D-Bridge/2.0", "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=2.5) as resp:
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

    # Chamber temperature (QIDI Q2 / Klipper heated chamber)
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

    return None

# ─── Push Telemetry to Cloud ───

def push_to_pantheon(payload):
    """POST telemetry payload and base64 snapshots to Pantheon ingestion API."""
    data_bytes = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        PANTHEON_URL,
        data=data_bytes,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {API_TOKEN}",
            "X-API-TOKEN": API_TOKEN,
            "User-Agent": "curl/8.4.0"
        },
        method="POST"
    )

    try:
        with urllib.request.urlopen(req, timeout=5.0) as resp:
            resp_body = resp.read().decode("utf-8")
            if resp.status == 200:
                return True, resp_body
            return False, f"HTTP {resp.status}: {resp_body}"
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="ignore")
        return False, f"HTTPError {e.code}: {err_body}"
    except Exception as e:
        return False, str(e)

# ─── Main Polling Loop ───

def run_bridge():
    logger.info("======================================================")
    logger.info("  NEXUS 3D — Local Bridge Daemon v2.0")
    logger.info(f"  Target Cloud: {PANTHEON_URL}")
    for p in PRINTERS:
        logger.info(f"  Monitoring Printer: {p['name']} ({p['ip']}:{p['port']})")
    logger.info("======================================================")

    last_snapshot_time = 0.0

    while True:
        loop_start = time.time()
        telemetry_list = []
        snapshots_dict = {}

        capture_snapshot_now = (loop_start - last_snapshot_time) >= SNAPSHOT_INTERVAL

        for p in PRINTERS:
            if not p.get("enabled", True):
                continue

            # 1. Harvest telemetry
            tel = query_moonraker(p)
            if tel:
                telemetry_list.append(tel)
            else:
                telemetry_list.append({
                    "id": p["id"],
                    "name": p["name"],
                    "ip": p["ip"],
                    "online": False,
                    "state": "offline"
                })

            # 2. Capture snapshot if due
            if capture_snapshot_now:
                jpeg_bytes = capture_webcam_snapshot(p)
                if jpeg_bytes:
                    b64_str = base64.b64encode(jpeg_bytes).decode("ascii")
                    snapshots_dict[p["id"]] = b64_str

        if capture_snapshot_now and snapshots_dict:
            last_snapshot_time = loop_start

        # 3. Push to Pantheon
        if telemetry_list:
            payload = {
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "printers": telemetry_list
            }
            if snapshots_dict:
                payload["snapshots"] = snapshots_dict

            success, msg = push_to_pantheon(payload)
            if success:
                p1_info = telemetry_list[0]
                status_str = f"state={p1_info.get('state')} progress={p1_info.get('progress')}%"
                snap_str = f"+ snap({len(snapshots_dict)})" if snapshots_dict else ""
                logger.info(f"Pushed telemetry to Pantheon: {status_str} {snap_str}")
            else:
                logger.warning(f"Failed to push telemetry to Pantheon: {msg}")

        # Sleep remaining time
        elapsed = time.time() - loop_start
        sleep_time = max(0.5, POLL_INTERVAL - elapsed)
        time.sleep(sleep_time)

if __name__ == "__main__":
    try:
        run_bridge()
    except KeyboardInterrupt:
        logger.info("Bridge daemon stopped by user.")
        sys.exit(0)

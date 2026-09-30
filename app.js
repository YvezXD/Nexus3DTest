/**
 * NEXUS 3D - Multi-Printer Telemetry & Monitoring System
 * Client-Side Application Logic (Optimized for Pantheon WebOps & Local LAN Direct Link)
 */

// Application State
const STATE = {
  activePrinterId: 'p1', // 'p1' or 'p2'
  viewMode: 'focus',     // 'focus' or 'dual'
  simMode: false,
  selectedStep: 10,
  pollTimer: null,
  pollInterval: 2000,
  latency: 18,
  connectionMode: 'cloud', // 'cloud' (default) or 'lan'
  isLocalLAN: false,
  targetEstopPrinterId: 'p1',

  camMode: 'auto', // 'auto', 'stream', 'snapshot'
  camSnapshotInterval: null,

  // Fleet Configs
  printers: {
    p1: {
      id: 'p1',
      name: 'QIDI Q2 (192.168.1.124)',
      ip: '192.168.1.124',
      port: 7125,
      type: 'moonraker',
      remoteUrl: '',
      camStreamUrl: 'http://192.168.1.124/webcam/?action=stream',
      camSnapshotUrl: 'http://192.168.1.124/webcam/?action=snapshot',
      online: true,
      state: 'ready',
      filename: 'None (Standby)',
      currentLayer: 0,
      totalLayer: 0,
      progress: 0.0,
      elapsedSeconds: 0,
      totalDurationSeconds: 0,
      filamentUsedMm: 0.0,
      extruder: { actual: 0.0, target: 0.0, power: 0.0 },
      bed: { actual: 0.0, target: 0.0, power: 0.0 },
      chamber: { actual: 0.0 },
      toolhead: { x: 0.0, y: 0.0, z: 0.0, maxVel: 600, maxAccel: 10000, fan: 0, speedFactor: 100 }
    },
    p2: {
      id: 'p2',
      name: 'FLASHFORGE AD5X',
      ip: '192.168.1.36',
      port: 7125,
      type: 'moonraker',
      remoteUrl: '',
      camStreamUrl: 'http://192.168.1.36:8080/?action=stream',
      camSnapshotUrl: 'http://192.168.1.36:8080/?action=snapshot',
      online: false,
      state: 'offline',
      filename: 'None (Standby)',
      currentLayer: 0,
      totalLayer: 0,
      progress: 0.0,
      elapsedSeconds: 0,
      totalDurationSeconds: 0,
      filamentUsedMm: 0.0,
      extruder: { actual: 0.0, target: 0.0, power: 0.0 },
      bed: { actual: 0.0, target: 0.0, power: 0.0 },
      chamber: { actual: 0.0 },
      toolhead: { x: 0.0, y: 0.0, z: 0.0, maxVel: 500, maxAccel: 8000, fan: 0, speedFactor: 100 }
    }
  }
};

// Initialize on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  try {
    localStorage.removeItem('nexus_print_p1');
    localStorage.removeItem('nexus_print_p2');
  } catch (e) {}
  initTheme();
  loadStoredConfig();
  detectHostingEnvironment();
  initEventListeners();
  initCanvases();
  startTelemetryPolling();
  updateCameraFeed(true);
  renderAll();
});

/* ==================== THEME & ENVIRONMENT ==================== */

function initTheme() {
  const savedTheme = localStorage.getItem('nexus_theme') || 'light';
  applyTheme(savedTheme);

  document.getElementById('themeToggleBtn')?.addEventListener('click', () => {
    const isLight = document.body.classList.contains('light-theme');
    applyTheme(isLight ? 'dark' : 'light');
  });
}

function applyTheme(theme) {
  const isLight = theme === 'light';
  document.body.classList.remove('dark-theme', 'light-theme');
  document.body.classList.add(isLight ? 'light-theme' : 'dark-theme');
  localStorage.setItem('nexus_theme', theme);

  const label = document.getElementById('themeBtnLabel');
  if (label) label.textContent = isLight ? 'Dark Mode' : 'Light Mode';

  const icon = document.getElementById('themeIcon');
  if (icon) {
    if (isLight) {
      icon.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>';
    } else {
      icon.innerHTML = '<circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>';
    }
  }
}

function setConnectionMode(mode, save = true) {
  const isCloud = mode !== 'lan';
  STATE.connectionMode = isCloud ? 'cloud' : 'lan';
  STATE.isLocalLAN = !isCloud;

  const btnCloud = document.getElementById('btnModeCloud');
  const btnLan = document.getElementById('btnModeLan');
  const badgeEl = document.getElementById('connModeInfoBadge');
  const textEl = document.getElementById('connModeInfoText');
  const dotEl = document.getElementById('connModeDot');

  if (btnCloud && btnLan) {
    btnCloud.classList.toggle('active', isCloud);
    btnLan.classList.toggle('active', !isCloud);
  }

  if (badgeEl) {
    badgeEl.textContent = isCloud ? 'Cloud Mode (Default) Active' : 'LAN Mode Active';
  }
  if (textEl) {
    textEl.textContent = isCloud
      ? 'Telemetry is routed securely through the Pantheon Cloud Ingestion endpoint & local bridge daemon. Works anywhere with zero network or CORS restrictions.'
      : `Connecting directly to local 3D printer IP endpoints over your local home network (http://${STATE.printers.p1.ip}:${STATE.printers.p1.port}). Requires devices to be on the same local subnet.`;
  }
  if (dotEl) {
    dotEl.className = isCloud ? 'status-indicator-dot online' : 'status-indicator-dot local';
  }

  if (save) {
    localStorage.setItem('nexus_connection_mode', STATE.connectionMode);
    logTerminal(`Connection Mode set to: ${STATE.connectionMode.toUpperCase()} MODE`, 'info');
  }

  updateNetworkBadge(true, isCloud ? 'Cloud Bridge: Synced' : `LAN Direct Link (${STATE.printers.p1.ip})`);
}

function detectHostingEnvironment() {
  const savedMode = localStorage.getItem('nexus_connection_mode') || 'cloud';
  setConnectionMode(savedMode, false);

  if (STATE.connectionMode === 'cloud') {
    STATE.isLocalLAN = false;
    logTerminal('Initialized in Cloud Mode (Default). Pantheon Cloud Telemetry active.', 'info');
  } else {
    STATE.isLocalLAN = true;
    logTerminal('Initialized in Direct LAN Mode. Probing local printer IPs.', 'info');
    probeLocalLan();
  }
}

async function probeLocalLan() {
  if (window.location.protocol === 'https:') return;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 900);
    const p1 = STATE.printers.p1;
    await fetch(`http://${p1.ip}:${p1.port}/printer/info`, { mode: 'no-cors', signal: controller.signal });
    clearTimeout(timeoutId);
    STATE.isLocalLAN = true;
  } catch (e) {
    STATE.isLocalLAN = false;
    STATE.camMode = 'snapshot';
    updateCameraFeed(true);
  }
}

function loadStoredConfig() {
  try {
    const saved = localStorage.getItem('nexus_3d_config');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.printers) {
        STATE.printers.p1.name = parsed.printers.p1.name || STATE.printers.p1.name;
        STATE.printers.p1.ip = parsed.printers.p1.ip || STATE.printers.p1.ip;
        STATE.printers.p1.port = parsed.printers.p1.port || STATE.printers.p1.port;
        STATE.printers.p1.remoteUrl = parsed.printers.p1.remoteUrl || '';
        STATE.printers.p1.camStreamUrl = parsed.printers.p1.camStreamUrl || STATE.printers.p1.camStreamUrl;
        STATE.printers.p1.camSnapshotUrl = parsed.printers.p1.camSnapshotUrl || STATE.printers.p1.camSnapshotUrl;

        if (!parsed.printers.p2.name || parsed.printers.p2.name.includes('CoreXY')) {
          STATE.printers.p2.name = 'FLASHFORGE AD5X';
        } else {
          STATE.printers.p2.name = parsed.printers.p2.name;
        }
        STATE.printers.p2.ip = parsed.printers.p2.ip || STATE.printers.p2.ip;
        STATE.printers.p2.port = parsed.printers.p2.port || STATE.printers.p2.port;
        STATE.printers.p2.remoteUrl = parsed.printers.p2.remoteUrl || '';
        STATE.printers.p2.camStreamUrl = parsed.printers.p2.camStreamUrl || STATE.printers.p2.camStreamUrl;
        STATE.printers.p2.camSnapshotUrl = parsed.printers.p2.camSnapshotUrl || STATE.printers.p2.camSnapshotUrl;
      }
      if (parsed.pollInterval) STATE.pollInterval = parsed.pollInterval;
      if (parsed.connectionMode) STATE.connectionMode = parsed.connectionMode;
      if (parsed.camMode) STATE.camMode = parsed.camMode;
      if (parsed.simMode !== undefined) {
        STATE.simMode = parsed.simMode;
        const toggle = document.getElementById('simModeToggle');
        if (toggle) toggle.checked = STATE.simMode;
      }
    }
  } catch (e) {
    console.error('Failed to parse saved settings', e);
  }
}

function saveConfigToStorage() {
  try {
    const payload = {
      printers: {
        p1: {
          name: STATE.printers.p1.name,
          ip: STATE.printers.p1.ip,
          port: STATE.printers.p1.port,
          remoteUrl: STATE.printers.p1.remoteUrl,
          camStreamUrl: STATE.printers.p1.camStreamUrl,
          camSnapshotUrl: STATE.printers.p1.camSnapshotUrl
        },
        p2: {
          name: STATE.printers.p2.name,
          ip: STATE.printers.p2.ip,
          port: STATE.printers.p2.port,
          remoteUrl: STATE.printers.p2.remoteUrl,
          camStreamUrl: STATE.printers.p2.camStreamUrl,
          camSnapshotUrl: STATE.printers.p2.camSnapshotUrl
        }
      },
      pollInterval: STATE.pollInterval,
      simMode: STATE.simMode,
      connectionMode: STATE.connectionMode,
      camMode: STATE.camMode
    };
    localStorage.setItem('nexus_3d_config', JSON.stringify(payload));
  } catch (e) {
    console.error('Error saving config', e);
  }
}

/* ==================== TELEMETRY POLLING ==================== */

function startTelemetryPolling() {
  if (STATE.pollTimer) clearInterval(STATE.pollTimer);
  
  // Initial immediate poll
  pollPrinters();

  STATE.pollTimer = setInterval(() => {
    pollPrinters();
  }, STATE.pollInterval);
}

/* ==================== DUAL-ENGINE TELEMETRY POLLING ==================== */

function clearPrintCache(printerId, notifyServer = false) {
  const p = STATE.printers[printerId];
  if (!p) return;
  p.state = 'ready';
  p.filename = 'None (Standby)';
  p.currentLayer = 0;
  p.totalLayer = 0;
  p.progress = 0.0;
  p.elapsedSeconds = 0;
  p.totalDurationSeconds = 0;
  p.filamentUsedMm = 0.0;
  try {
    localStorage.removeItem(`nexus_print_${printerId}`);
  } catch(e) {}

  if (notifyServer) {
    try {
      fetch('index.php?route=api&action=clear_cache', { method: 'POST' }).catch(() => {});
    } catch (e) {}
  }
}

async function pollPrinters() {
  const start = performance.now();

  if (STATE.simMode) {
    simulateTelemetry();
    STATE.latency = Math.floor(8 + Math.random() * 8);
    updateLatency(STATE.latency);
    renderAll();
    return;
  }

  let synced = false;

  if (STATE.connectionMode === 'lan') {
    // Mode: Direct LAN Link
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1200);
      const p1 = STATE.printers.p1;
      const lanQuery = `http://${p1.ip}:${p1.port}/printer/objects/query?print_stats&virtual_sdcard&heater_bed&extruder&toolhead&display_status&heater_generic%20chamber&temperature_sensor%20Chamber_Thermal_Protection_Sensor&fan&gcode_move&fan_generic%20cooling_fan&fan_generic%20part_fan`;
      const resp = await fetch(lanQuery, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (resp.ok) {
        const data = await resp.json();
        if (data && data.result && data.result.status) {
          applyMoonrakerStatus('p1', data.result.status);
          synced = true;
          STATE.isLocalLAN = true;
          updateNetworkBadge(true, `LAN Direct Link (${p1.ip})`);
        }
      }
    } catch (lanErr) {
      synced = false;
    }
  } else {
    // Mode: Cloud Ingestion (Default) — Query Pantheon Cloud Ingestion endpoint
    try {
      const resp = await fetch('index.php?route=api&action=latest', {
        headers: { 'Accept': 'application/json' },
        cache: 'no-store'
      });

      if (resp.ok) {
        const data = await resp.json();
        if (data.status === 'ok' && data.printers && data.printers.p1) {
          handleBridgeTelemetry(data.printers);
          synced = true;
          updateNetworkBadge(true, 'Cloud Bridge: Synced');
        }
      }
    } catch (cloudErr) {
      console.warn('Pantheon cloud poll error:', cloudErr);
    }

    // Secondary fallback to LAN only if locally hosted (not on HTTPS)
    if (!synced && window.location.protocol !== 'https:') {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1200);
        const p1 = STATE.printers.p1;
        const lanQuery = `http://${p1.ip}:${p1.port}/printer/objects/query?print_stats&virtual_sdcard&heater_bed&extruder&toolhead&display_status&heater_generic%20chamber&temperature_sensor%20Chamber_Thermal_Protection_Sensor&fan&gcode_move&fan_generic%20cooling_fan&fan_generic%20part_fan`;
        const resp = await fetch(lanQuery, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (resp.ok) {
          const data = await resp.json();
          if (data && data.result && data.result.status) {
            applyMoonrakerStatus('p1', data.result.status);
            synced = true;
            updateNetworkBadge(true, `LAN Fallback (${p1.ip})`);
          }
        }
      } catch (lanErr) {
        synced = false;
      }
    }
  }

  if (!synced) {
    const modeName = STATE.connectionMode === 'lan' ? 'LAN direct link' : 'Pantheon cloud bridge';
    showBridgeOffline(`Bridge Offline: No telemetry from ${modeName}.`);
  }

  STATE.latency = Math.max(12, Math.floor(performance.now() - start));
  updateLatency(STATE.latency);
  renderAll();
}

function applyMoonrakerStatus(id, status) {
  const p = STATE.printers[id];
  if (!p) return;
  p.online = true;

  if (status.print_stats) {
    const ps = status.print_stats;
    const st = (ps.state || 'ready').toLowerCase();
    p.state = st;

    if (st !== 'printing' && st !== 'paused') {
      // Print is complete, cancelled, or standby: CLEAR ALL METRICS!
      clearPrintCache(id, false);
    } else {
      p.filename = ps.filename || 'Unknown Print';
      p.filamentUsedMm = parseFloat((ps.filament_used || 0).toFixed(1));
      const dur = ps.print_duration || ps.total_duration || 0;
      p.elapsedSeconds = Math.round(dur);

      if (ps.info) {
        p.currentLayer = parseInt(ps.info.current_layer || 0, 10);
        p.totalLayer = parseInt(ps.info.total_layer || 0, 10);
      }

      // Sync progress & remaining time matching Fluidd exactly
      let prog = 0.0;
      if (status.virtual_sdcard && status.virtual_sdcard.progress !== undefined && status.virtual_sdcard.progress > 0) {
        prog = status.virtual_sdcard.progress;
      } else if (status.display_status && status.display_status.progress !== undefined && status.display_status.progress > 0) {
        prog = status.display_status.progress;
      } else if (p.totalLayer > 0) {
        prog = p.currentLayer / p.totalLayer;
      }

      p.progress = parseFloat((prog * 100).toFixed(1));
      if (prog > 0 && dur > 0) {
        p.totalDurationSeconds = Math.round(dur / prog);
      }
    }
  }

  if (status.extruder) {
    p.extruder.actual = parseFloat(status.extruder.temperature.toFixed(1));
    p.extruder.target = parseFloat(status.extruder.target.toFixed(1));
    p.extruder.power = status.extruder.power || 0;
  }
  if (status.heater_bed) {
    p.bed.actual = parseFloat(status.heater_bed.temperature.toFixed(1));
    p.bed.target = parseFloat(status.heater_bed.target.toFixed(1));
    p.bed.power = status.heater_bed.power || 0;
  }
  // Chamber temperature
  if (status['heater_generic chamber']) {
    p.chamber.actual = parseFloat(status['heater_generic chamber'].temperature.toFixed(1));
  } else if (status['temperature_sensor Chamber_Thermal_Protection_Sensor']) {
    p.chamber.actual = parseFloat(status['temperature_sensor Chamber_Thermal_Protection_Sensor'].temperature.toFixed(1));
  } else if (status.chamber) {
    p.chamber.actual = parseFloat(status.chamber.temperature.toFixed(1));
  }
  if (status.toolhead) {
    p.toolhead.x = parseFloat(status.toolhead.position[0].toFixed(1));
    p.toolhead.y = parseFloat(status.toolhead.position[1].toFixed(1));
    p.toolhead.z = parseFloat(status.toolhead.position[2].toFixed(2));
    p.toolhead.maxVel = status.toolhead.max_velocity || 600;
    p.toolhead.maxAccel = status.toolhead.max_accel || 10000;
  }

  // Part Cooling Fan Speed & Speed Factor
  let fanSpeed = 0.0;
  if (status.fan && status.fan.speed !== undefined) {
    fanSpeed = status.fan.speed;
  } else if (status['fan_generic cooling_fan'] && status['fan_generic cooling_fan'].speed !== undefined) {
    fanSpeed = status['fan_generic cooling_fan'].speed;
  } else if (status['fan_generic part_fan'] && status['fan_generic part_fan'].speed !== undefined) {
    fanSpeed = status['fan_generic part_fan'].speed;
  }
  p.toolhead.fan = Math.round(fanSpeed * 100);

  if (status.gcode_move && status.gcode_move.speed_factor !== undefined) {
    p.toolhead.speedFactor = Math.round(status.gcode_move.speed_factor * 100);
  }

  // Dismiss offline alert
  const banner = document.getElementById('bridgeBanner');
  if (banner) banner.style.display = 'none';
}

function handleBridgeTelemetry(bridgePrinters) {
  const p1Data = bridgePrinters.p1;
  const banner = document.getElementById('bridgeBanner');

  if (!p1Data) {
    showBridgeOffline('Bridge Offline: No telemetry from QIDI Q2 (192.168.1.124).');
    return;
  }

  const age = p1Data._age !== undefined ? p1Data._age : 0;
  if (age > 20) {
    showBridgeOffline(`Bridge Stale: Last telemetry was ${age}s ago.`);
  } else {
    if (banner) banner.style.display = 'none';
    updateNetworkBadge(true, `Cloud Bridge: Online (${age}s)`);
  }

  const p1 = STATE.printers.p1;
  p1.online = p1Data.online !== false;
  const st = (p1Data.state || 'ready').toLowerCase();
  p1.state = st;

  if (st !== 'printing' && st !== 'paused') {
    clearPrintCache('p1', false);
  } else {
    p1.filename = p1Data.filename || 'Unknown Print';
    p1.currentLayer = p1Data.currentLayer || 0;
    p1.totalLayer = p1Data.totalLayer || 0;
    p1.progress = p1Data.progress !== undefined ? p1Data.progress : 0;
    p1.elapsedSeconds = p1Data.elapsedSeconds || 0;
    p1.totalDurationSeconds = p1Data.totalDurationSeconds || 0;
    p1.filamentUsedMm = p1Data.filamentUsedMm || 0;
  }

  if (p1Data.extruder) {
    p1.extruder.actual = p1Data.extruder.actual ?? p1.extruder.actual;
    p1.extruder.target = p1Data.extruder.target ?? p1.extruder.target;
    p1.extruder.power = p1Data.extruder.power ?? p1.extruder.power;
  }
  if (p1Data.bed) {
    p1.bed.actual = p1Data.bed.actual ?? p1.bed.actual;
    p1.bed.target = p1Data.bed.target ?? p1.bed.target;
    p1.bed.power = p1Data.bed.power ?? p1.bed.power;
  }
  if (p1Data.chamber) {
    p1.chamber.actual = p1Data.chamber.actual ?? p1.chamber.actual;
  }
  if (p1Data.toolhead) {
    Object.assign(p1.toolhead, p1Data.toolhead);
  }

  if (bridgePrinters.p2) {
    const p2Data = bridgePrinters.p2;
    const p2 = STATE.printers.p2;
    p2.online = p2Data.online !== false;
    const st2 = (p2Data.state || 'ready').toLowerCase();
    p2.state = st2;

    if (st2 !== 'printing' && st2 !== 'paused') {
      clearPrintCache('p2', false);
    } else {
      p2.filename = p2Data.filename || 'None (Standby)';
      p2.currentLayer = p2Data.currentLayer || 0;
      p2.totalLayer = p2Data.totalLayer || 0;
      p2.progress = p2Data.progress !== undefined ? p2Data.progress : 0;
      p2.elapsedSeconds = p2Data.elapsedSeconds || 0;
      p2.totalDurationSeconds = p2Data.totalDurationSeconds || 0;
      p2.filamentUsedMm = p2Data.filamentUsedMm || 0;
    }

    if (p2Data.extruder) Object.assign(p2.extruder, p2Data.extruder);
    if (p2Data.bed) Object.assign(p2.bed, p2Data.bed);
    if (p2Data.toolhead) Object.assign(p2.toolhead, p2Data.toolhead);
  }

  // If off-network, dynamically load the active printer's snapshot URL
  const activeData = bridgePrinters[STATE.activePrinterId];
  if (!STATE.isLocalLAN && activeData && activeData.snapshot_url) {
    loadSingleCloudSnapshot(activeData.snapshot_url);
  } else if (!STATE.isLocalLAN && (!activeData || !activeData.online)) {
    const img = document.getElementById('cameraStreamImg');
    if (img) {
      img.src = STATE.activePrinterId === 'p1' ? 'assets/NewPrinterIcon.jpeg' : 'assets/KK3.webp';
    }
  }
}

function updateNetworkBadge(isOnline, labelText) {
  const networkPulse = document.getElementById('networkPulse');
  const networkLabel = document.getElementById('networkLabel');
  if (networkPulse) {
    networkPulse.className = isOnline ? 'badge-dot pulse-cyan' : 'badge-dot pulse-red';
  }
  if (networkLabel) {
    networkLabel.textContent = labelText;
  }
}

function showBridgeOffline(msg) {
  const banner = document.getElementById('bridgeBanner');
  const bannerText = document.getElementById('bridgeBannerText');
  const networkPulse = document.getElementById('networkPulse');
  const networkLabel = document.getElementById('networkLabel');

  if (banner) banner.style.display = 'block';
  if (bannerText) bannerText.innerHTML = `<strong>${msg}</strong> Ensure the bridge daemon is running on your LAN desktop.`;
  if (networkPulse) networkPulse.className = 'badge-dot pulse-red';
  if (networkLabel) networkLabel.textContent = 'Bridge: Offline';
}

/* ==================== SIMULATION TELEMETRY GENERATOR ==================== */

let simTick = 0;
function simulateTelemetry(isHardwareFallback = false) {
  simTick++;
  const p1 = STATE.printers.p1;

  if (p1.state === 'printing') {
    p1.elapsedSeconds += (STATE.pollInterval / 1000);
    
    // Simulate layer advancement periodically
    if (simTick % 8 === 0 && p1.currentLayer < p1.totalLayer) {
      p1.currentLayer++;
      p1.progress = parseFloat(((p1.currentLayer / p1.totalLayer) * 100).toFixed(1));
      p1.filamentUsedMm += 18.5;
    }

    // Natural thermal fluctuations around targets
    p1.extruder.actual = parseFloat((p1.extruder.target + (Math.sin(simTick * 0.3) * 0.4)).toFixed(1));
    p1.bed.actual = parseFloat((p1.bed.target + (Math.cos(simTick * 0.2) * 0.2)).toFixed(1));
    p1.extruder.power = Math.max(0.1, Math.min(1.0, 0.40 + Math.sin(simTick * 0.1) * 0.08));
    p1.bed.power = Math.max(0.1, Math.min(1.0, 0.33 + Math.cos(simTick * 0.1) * 0.05));

    // Toolhead moving dynamically inside live part perimeter
    const centerX = 50;
    const centerY = 175;
    const radius = 25;
    p1.toolhead.x = parseFloat((centerX + Math.cos(simTick * 0.6) * radius).toFixed(1));
    p1.toolhead.y = parseFloat((centerY + Math.sin(simTick * 0.6) * radius).toFixed(1));
    p1.toolhead.z = parseFloat((24.0 + (Math.sin(simTick * 0.05) * 0.1)).toFixed(2));

    p1.toolhead.fan = 100;
    p1.toolhead.speedFactor = 100;

    // Chamber temp during print
    p1.chamber.actual = parseFloat((42.0 + (Math.sin(simTick * 0.05) * 0.6)).toFixed(1));
  } else {
    p1.chamber.actual = 28.0;
    p1.toolhead.fan = 0;
    p1.toolhead.speedFactor = 100;
  }

  if (STATE.printers.p2.online) {
    simulatePrinter2();
  }
}

function simulatePrinter2() {
  const p2 = STATE.printers.p2;
  p2.extruder.actual = parseFloat((24 + Math.sin(simTick * 0.1) * 0.3).toFixed(1));
  p2.bed.actual = parseFloat((23.8 + Math.cos(simTick * 0.1) * 0.2).toFixed(1));
  p2.toolhead.fan = p2.state === 'printing' ? 100 : 0;
  p2.toolhead.speedFactor = 100;
}

/* ==================== RENDERING / UI UPDATES ==================== */

function renderAll() {
  renderNavBadges();
  renderTabs();
  renderDualFleet();
  renderFocusView();
  renderBedVisualizer();
}

/* ==================== HYBRID CAMERA CONTROLLER ==================== */

let camSnapshotPoller = null;

function updateCameraFeed(forceReload = false) {
  const p = STATE.printers[STATE.activePrinterId];
  if (!p) return;

  const hudName = document.getElementById('hudCamName');
  if (hudName) {
    hudName.textContent = STATE.activePrinterId === 'p1' 
      ? `CAM 1: QIDI HD (${p.ip})` 
      : `CAM 2: Fleet Slot 2`;
  }

  const img = document.getElementById('cameraStreamImg');
  const fpsBadge = document.getElementById('cameraFpsBadge');
  const standbyOverlay = document.getElementById('cameraStandbyOverlay');
  if (!img) return;

  const stockImg = STATE.activePrinterId === 'p1' ? 'assets/NewPrinterIcon.jpeg' : 'assets/KK3.webp';

  if (STATE.simMode) {
    if (camSnapshotPoller) { clearInterval(camSnapshotPoller); camSnapshotPoller = null; }
    img.src = stockImg;
    if (fpsBadge) fpsBadge.textContent = 'DEMO';
    if (standbyOverlay) standbyOverlay.style.display = 'none';
    return;
  }

  if (!p.online) {
    if (camSnapshotPoller) { clearInterval(camSnapshotPoller); camSnapshotPoller = null; }
    img.src = stockImg;
    if (fpsBadge) fpsBadge.textContent = 'STANDBY';
    if (standbyOverlay) standbyOverlay.style.display = 'none';
    return;
  }

  // If user selected explicit snapshot mode OR we are confirmed off-LAN:
  if (STATE.camMode === 'snapshot' || !STATE.isLocalLAN) {
    switchToCloudSnapshotMode();
  } else {
    switchToLanStreamMode(forceReload);
  }
}

function switchToLanStreamMode(forceReload = false) {
  const p = STATE.printers[STATE.activePrinterId];
  const img = document.getElementById('cameraStreamImg');
  const fpsBadge = document.getElementById('cameraFpsBadge');
  const snapLabel = document.getElementById('snapModeLabel');
  const standbyOverlay = document.getElementById('cameraStandbyOverlay');
  if (!img || !p) return;

  if (camSnapshotPoller) {
    clearInterval(camSnapshotPoller);
    camSnapshotPoller = null;
  }

  if (snapLabel) snapLabel.textContent = 'Stream (LAN)';

  const streamUrl = p.camStreamUrl || `http://${p.ip}/webcam/?action=stream`;

  img.onload = () => {
    if (fpsBadge) fpsBadge.textContent = 'LAN STREAM';
    if (standbyOverlay) standbyOverlay.style.display = 'none';
  };

  img.onerror = () => {
    console.warn('LAN camera stream blocked or unreachable. Falling back to Cloud Snapshot (HTTPS).');
    STATE.camMode = 'snapshot';
    switchToCloudSnapshotMode();
  };

  if (forceReload || !img.src.includes('action=stream')) {
    img.src = streamUrl;
  }
}

let isSnapshotLoading = false;

function switchToCloudSnapshotMode() {
  const p = STATE.printers[STATE.activePrinterId];
  const img = document.getElementById('cameraStreamImg');
  const snapLabel = document.getElementById('snapModeLabel');
  if (snapLabel) snapLabel.textContent = 'Snapshot (Cloud)';

  if (img) {
    img.onerror = null;
    img.onload = null;
  }

  loadSingleCloudSnapshot();

  if (!camSnapshotPoller) {
    // 1100ms polling for low cloud camera latency
    camSnapshotPoller = setInterval(() => {
      loadSingleCloudSnapshot();
    }, 1100);
  }
}

function loadSingleCloudSnapshot(customUrl = null) {
  const img = document.getElementById('cameraStreamImg');
  const fpsBadge = document.getElementById('cameraFpsBadge');
  const standbyOverlay = document.getElementById('cameraStandbyOverlay');
  if (!img) return;

  const stockImg = STATE.activePrinterId === 'p1' ? 'assets/NewPrinterIcon.jpeg' : 'assets/KK3.webp';
  const p = STATE.printers[STATE.activePrinterId];
  if (!p || !p.online) {
    img.src = stockImg;
    if (fpsBadge) fpsBadge.textContent = 'STANDBY';
    if (standbyOverlay) standbyOverlay.style.display = 'none';
    return;
  }

  if (isSnapshotLoading) return;
  isSnapshotLoading = true;

  const snapshotUrl = customUrl || `index.php?route=api&action=snapshot&printer=${STATE.activePrinterId}&t=${Date.now()}`;
  const preloader = new Image();
  preloader.onload = () => {
    isSnapshotLoading = false;
    img.src = snapshotUrl;
    if (fpsBadge) fpsBadge.textContent = 'CLOUD LIVE';
    if (standbyOverlay) standbyOverlay.style.display = 'none';
  };
  preloader.onerror = () => {
    isSnapshotLoading = false;
    img.src = stockImg;
    if (fpsBadge) fpsBadge.textContent = 'STANDBY';
  };
  preloader.src = snapshotUrl;
}

// Global safety alias
function loadCloudSnapshot(printerObj, snapshotUrl) {
  loadSingleCloudSnapshot(snapshotUrl);
}

function updateLatency(ms) {
  const el = document.getElementById('latencyValue');
  if (el) el.textContent = `${ms} ms`;
}

function renderNavBadges() {
  const networkPulse = document.getElementById('networkPulse');
  const networkLabel = document.getElementById('networkLabel');
  
  if (STATE.simMode) {
    if (networkPulse) networkPulse.className = 'badge-dot pulse-purple';
    if (networkLabel) networkLabel.textContent = 'Mode: Simulation Telemetry';
  } else {
    if (networkPulse) networkPulse.className = 'badge-dot pulse-cyan';
    if (networkLabel) networkLabel.textContent = 'LAN: Direct Link (192.168.1.x)';
  }
}

function renderTabs() {
  const p1 = STATE.printers.p1;
  const p2 = STATE.printers.p2;

  // P1 Tab
  const p1Tab = document.getElementById('tabPrinter1');
  const p1Dot = document.getElementById('p1TabDot');
  const p1Name = document.getElementById('p1TabName');
  const p1Pill = document.getElementById('p1StatePill');
  const p1Prev = document.getElementById('p1StatPreview');

  if (p1Name) p1Name.textContent = p1.name;
  if (p1Pill) {
    p1Pill.textContent = p1.state.toUpperCase();
    p1Pill.className = `tab-state-pill pill-${p1.state}`;
  }
  if (p1Dot) {
    p1Dot.className = `tab-indicator status-${p1.state === 'printing' ? 'printing' : (p1.online ? 'standby' : 'offline')}`;
  }
  if (p1Prev) {
    p1Prev.textContent = `${p1.extruder.actual}°C / ${p1.bed.actual}°C`;
  }
  if (p1Tab) {
    p1Tab.classList.toggle('active', STATE.activePrinterId === 'p1');
    p1Tab.setAttribute('aria-selected', STATE.activePrinterId === 'p1');
  }

  // P2 Tab
  const p2Tab = document.getElementById('tabPrinter2');
  const p2Dot = document.getElementById('p2TabDot');
  const p2Name = document.getElementById('p2TabName');
  const p2Pill = document.getElementById('p2StatePill');
  const p2Prev = document.getElementById('p2StatPreview');

  if (p2Name) p2Name.textContent = p2.name;
  if (p2Pill) {
    p2Pill.textContent = p2.online ? p2.state.toUpperCase() : 'OFFLINE / STANDBY';
    p2Pill.className = `tab-state-pill pill-${p2.online ? p2.state : 'offline'}`;
  }
  if (p2Dot) {
    p2Dot.className = `tab-indicator status-${p2.online ? (p2.state === 'printing' ? 'printing' : 'standby') : 'offline'}`;
  }
  if (p2Prev) {
    p2Prev.textContent = p2.online 
      ? `Standby • ${p2.extruder.actual}°C / ${p2.bed.actual}°C` 
      : 'Unreachable (192.168.1.36)';
  }
  if (p2Tab) {
    p2Tab.classList.toggle('active', STATE.activePrinterId === 'p2');
    p2Tab.setAttribute('aria-selected', STATE.activePrinterId === 'p2');
  }
}

function renderDualFleet() {
  const p1 = STATE.printers.p1;
  const p2 = STATE.printers.p2;

  // Fleet Card 1
  const fc1Percent = document.getElementById('fc1Percent');
  const fc1File = document.getElementById('fc1File');
  const fc1Chamber = document.getElementById('fc1Chamber');
  const fc1Ext = document.getElementById('fc1Extruder');
  const fc1Bed = document.getElementById('fc1Bed');
  const fc1Remain = document.getElementById('fc1Remain');
  const fc1Img = document.querySelector('#fleetCard1 .fleet-thumb-img');

  if (fc1Img && !fc1Img.src.includes('NewPrinterIcon')) {
    fc1Img.src = 'assets/NewPrinterIcon.jpeg';
  }
  if (fc1Percent) fc1Percent.textContent = `${p1.progress}%`;
  if (fc1File) fc1File.textContent = p1.filename;
  if (fc1Chamber) fc1Chamber.textContent = (p1.chamber && p1.chamber.actual > 0) ? `${p1.chamber.actual.toFixed(1)}°C` : '--';
  if (fc1Ext) fc1Ext.textContent = `${p1.extruder.actual}°C / ${p1.extruder.target}°C`;
  if (fc1Bed) fc1Bed.textContent = `${p1.bed.actual}°C / ${p1.bed.target}°C`;
  if (fc1Remain) fc1Remain.textContent = formatDuration(Math.max(0, p1.totalDurationSeconds - p1.elapsedSeconds));

  // Fleet Card 2
  const fc2Dot = document.getElementById('fc2Dot');
  const fc2Badge = document.getElementById('fc2Badge');
  const fc2StateText = document.getElementById('fc2StateText');
  const fc2Ext = document.getElementById('fc2Extruder');
  const fc2Bed = document.getElementById('fc2Bed');
  const fc2Diag = document.getElementById('fc2Diag');
  const fc2Img = document.getElementById('fc2Img');
  const fc2Overlay = document.getElementById('fc2Overlay');

  if (fc2Img && !fc2Img.src.includes('KK3.webp')) {
    fc2Img.src = 'assets/KK3.webp';
  }

  if (p2.online) {
    if (fc2Dot) fc2Dot.className = 'status-indicator-dot online';
    if (fc2Badge) {
      fc2Badge.className = 'badge-status-glow active';
      fc2Badge.textContent = 'ONLINE / READY';
    }
    if (fc2StateText) fc2StateText.textContent = 'Ready (Idle)';
    if (fc2Ext) fc2Ext.textContent = `${p2.extruder.actual}°C / ${p2.extruder.target}°C`;
    if (fc2Bed) fc2Bed.textContent = `${p2.bed.actual}°C / ${p2.bed.target}°C`;
    if (fc2Diag) fc2Diag.textContent = 'Moonraker Connected';
    if (fc2Img) fc2Img.classList.remove('grayscale');
    if (fc2Overlay) fc2Overlay.style.display = 'none';
  } else {
    if (fc2Dot) fc2Dot.className = 'status-indicator-dot offline';
    if (fc2Badge) {
      fc2Badge.className = 'badge-status-glow standby';
      fc2Badge.textContent = 'OFFLINE / STANDBY';
    }
    if (fc2StateText) fc2StateText.textContent = 'Disconnected';
    if (fc2Ext) fc2Ext.textContent = '--°C';
    if (fc2Bed) fc2Bed.textContent = '--°C';
    if (fc2Diag) fc2Diag.textContent = 'No response on 192.168.1.36:7125';
    if (fc2Img) fc2Img.classList.add('grayscale');
    if (fc2Overlay) fc2Overlay.style.display = 'flex';
  }
}

function renderFocusView() {
  const p = STATE.printers[STATE.activePrinterId];
  if (!p) return;

  // Hero Card
  const heroThumb = document.getElementById('heroThumb');
  if (heroThumb) {
    const targetThumb = STATE.activePrinterId === 'p1' ? 'assets/NewPrinterIcon.jpeg' : 'assets/KK3.webp';
    if (!heroThumb.src.includes(targetThumb)) {
      heroThumb.src = targetThumb;
    }
  }
  const heroLiveTag = document.getElementById('heroLiveTag');
  const heroFilename = document.getElementById('heroFilename');
  const heroStateBadge = document.getElementById('heroStateBadge');
  const heroPercent = document.getElementById('heroPercent');
  const heroProgressBar = document.getElementById('heroProgressBar');
  const heroElapsed = document.getElementById('heroElapsed');
  const heroRemaining = document.getElementById('heroRemaining');
  const heroFilament = document.getElementById('heroFilament');
  const heroTotalTime = document.getElementById('heroTotalTime');

  if (heroFilename) heroFilename.textContent = p.filename;
  if (heroStateBadge) {
    heroStateBadge.textContent = p.online ? p.state.toUpperCase() : 'OFFLINE';
    heroStateBadge.className = `badge-state-hero state-${p.online ? p.state : 'standby'}`;
  }
  if (heroPercent) heroPercent.textContent = `${p.progress}%`;
  if (heroProgressBar) {
    heroProgressBar.style.width = `${Math.min(100, Math.max(0, p.progress))}%`;
    if (p.online && p.state === 'printing') {
      heroProgressBar.classList.add('animating');
    } else {
      heroProgressBar.classList.remove('animating');
    }
  }
  if (heroElapsed) heroElapsed.textContent = formatDuration(p.elapsedSeconds);
  if (heroRemaining) heroRemaining.textContent = formatDuration(Math.max(0, p.totalDurationSeconds - p.elapsedSeconds));
  if (heroFilament) heroFilament.textContent = `${(p.filamentUsedMm / 1000).toFixed(2)} m`;
  if (heroTotalTime) heroTotalTime.textContent = formatDuration(p.totalDurationSeconds);

  // Buttons visibility
  const btnPause = document.getElementById('btnJobPause');
  const btnResume = document.getElementById('btnJobResume');
  if (btnPause && btnResume) {
    if (p.state === 'paused') {
      btnPause.style.display = 'none';
      btnResume.style.display = 'flex';
    } else {
      btnPause.style.display = 'flex';
      btnResume.style.display = 'none';
    }
  }

  // Extruder Gauge
  const extTempAct = document.getElementById('extTempActual');
  const extTempTar = document.getElementById('extTempTarget');
  const extPower = document.getElementById('extPowerTag');
  const extMaxTag = document.getElementById('extMaxTag');
  const extCircle = document.getElementById('extGaugeCircle');

  const maxExtTemp = STATE.activePrinterId === 'p1' ? 370 : 280;
  if (extMaxTag) extMaxTag.textContent = `MAX: ${maxExtTemp}°C`;

  if (extTempAct) extTempAct.textContent = p.extruder.actual;
  if (extTempTar) extTempTar.textContent = p.extruder.target;
  if (extPower) extPower.textContent = `PWR: ${Math.round(p.extruder.power * 100)}%`;
  if (extCircle) {
    // Circle circumference is 2 * PI * 58 = ~364.4
    // Scale 0 - maxExtTemp deg C
    const ratio = Math.min(1, Math.max(0, p.extruder.actual / maxExtTemp));
    extCircle.style.strokeDashoffset = 364.4 - (ratio * 364.4);
  }

  // Bed Gauge
  const bedTempAct = document.getElementById('bedTempActual');
  const bedTempTar = document.getElementById('bedTempTarget');
  const bedPower = document.getElementById('bedPowerTag');
  const bedCircle = document.getElementById('bedGaugeCircle');

  if (bedTempAct) bedTempAct.textContent = p.bed.actual;
  if (bedTempTar) bedTempTar.textContent = p.bed.target;
  if (bedPower) bedPower.textContent = `PWR: ${Math.round(p.bed.power * 100)}%`;
  if (bedCircle) {
    // Scale 0 - 120 deg C
    const ratio = Math.min(1, Math.max(0, p.bed.actual / 120));
    bedCircle.style.strokeDashoffset = 364.4 - (ratio * 364.4);
  }

  // Kinematics
  const coordX = document.getElementById('coordX');
  const coordY = document.getElementById('coordY');
  const coordZ = document.getElementById('coordZ');
  const valMaxVel = document.getElementById('valMaxVel');
  const valMaxAccel = document.getElementById('valMaxAccel');

  if (coordX) coordX.textContent = p.toolhead.x;
  if (coordY) coordY.textContent = p.toolhead.y;
  if (coordZ) coordZ.textContent = p.toolhead.z;
  if (valMaxVel) valMaxVel.textContent = `${p.toolhead.maxVel} mm/s`;
  if (valMaxAccel) valMaxAccel.textContent = `${p.toolhead.maxAccel.toLocaleString()} mm/s²`;

  // Chamber Temperature
  const chamberTempVal = document.getElementById('chamberTempVal');
  if (chamberTempVal) {
    if (p.chamber && typeof p.chamber.actual === 'number' && p.chamber.actual > 0) {
      chamberTempVal.textContent = p.chamber.actual.toFixed(1);
    } else {
      chamberTempVal.textContent = '--';
    }
  }

  // Non-interactable Speeds (Speed Factor)
  const speedFactorVal = document.getElementById('speedFactorVal');
  const speedFactorBar = document.getElementById('speedFactorBar');
  const spd = (p.toolhead && typeof p.toolhead.speedFactor === 'number') ? p.toolhead.speedFactor : 100;
  if (speedFactorVal) speedFactorVal.textContent = `${spd}%`;
  if (speedFactorBar) {
    const pct = Math.min(100, Math.max(0, ((spd - 50) / 150) * 100));
    speedFactorBar.style.width = `${pct}%`;
  }

  // Stream preview HUD
  const hudTimestamp = document.getElementById('hudTimestamp');
  if (hudTimestamp) {
    const now = new Date();
    hudTimestamp.textContent = now.toISOString().replace('T', ' ').substring(0, 19);
  }
}

function formatDuration(totalSec) {
  if (isNaN(totalSec) || totalSec <= 0) return '00:00:00';
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = Math.floor(totalSec % 60);
  return `${padZero(hrs)}:${padZero(mins)}:${padZero(secs)}`;
}

function padZero(num) {
  return num < 10 ? `0${num}` : `${num}`;
}

/* ==================== 2D BED VISUALIZER ==================== */

let bedCtx = null;

function initCanvases() {
  const bedCanvas = document.getElementById('bedCanvas');
  if (bedCanvas) {
    bedCanvas.width = 400 * 2;
    bedCanvas.height = 350 * 2;
    bedCtx = bedCanvas.getContext('2d');
    bedCtx.scale(2, 2);
  }
}

function renderBedVisualizer() {
  if (!bedCtx) return;
  const canvas = bedCtx.canvas;
  const width = canvas.width / 2;
  const height = canvas.height / 2;

  bedCtx.clearRect(0, 0, width, height);

  // Bed Dimensions: 275mm x 295mm
  const bedW = 275;
  const bedH = 295;
  const scale = Math.min((width - 40) / bedW, (height - 40) / bedH);

  const drawW = bedW * scale;
  const drawH = bedH * scale;
  const startX = (width - drawW) / 2;
  const startY = (height - drawH) / 2;

  // Draw PEI Sheet Bed
  bedCtx.fillStyle = '#0f172a';
  bedCtx.strokeStyle = '#334155';
  bedCtx.lineWidth = 2;
  bedCtx.beginPath();
  if (typeof bedCtx.roundRect === 'function') {
    bedCtx.roundRect(startX, startY, drawW, drawH, 8);
  } else {
    bedCtx.rect(startX, startY, drawW, drawH);
  }
  bedCtx.fill();
  bedCtx.stroke();

  // Grid lines on bed (every 50mm)
  bedCtx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
  bedCtx.lineWidth = 1;
  for (let x = 50; x < bedW; x += 50) {
    const gx = startX + (x * scale);
    bedCtx.beginPath();
    bedCtx.moveTo(gx, startY);
    bedCtx.lineTo(gx, startY + drawH);
    bedCtx.stroke();
  }
  for (let y = 50; y < bedH; y += 50) {
    const gy = startY + drawH - (y * scale);
    bedCtx.beginPath();
    bedCtx.moveTo(startX, gy);
    bedCtx.lineTo(startX + drawW, gy);
    bedCtx.stroke();
  }

  // Draw Printed Part Boundary
  const partCenterX = 113 * scale;
  const partCenterY = drawH - (112 * scale);
  const partW = 90 * scale;
  const partH = 90 * scale;

  bedCtx.fillStyle = 'rgba(0, 242, 254, 0.12)';
  bedCtx.strokeStyle = 'rgba(0, 242, 254, 0.6)';
  bedCtx.lineWidth = 1.5;
  bedCtx.beginPath();
  if (typeof bedCtx.roundRect === 'function') {
    bedCtx.roundRect(startX + partCenterX - (partW/2), startY + partCenterY - (partH/2), partW, partH, 6);
  } else {
    bedCtx.rect(startX + partCenterX - (partW/2), startY + partCenterY - (partH/2), partW, partH);
  }
  bedCtx.fill();
  bedCtx.stroke();

  // Draw Toolhead Nozzle Indicator
  const p = STATE.printers[STATE.activePrinterId];
  if (p && p.toolhead) {
    const toolX = startX + (p.toolhead.x * scale);
    const toolY = startY + drawH - (p.toolhead.y * scale);

    // Nozzle halo
    bedCtx.fillStyle = 'rgba(239, 68, 68, 0.25)';
    bedCtx.beginPath();
    bedCtx.arc(toolX, toolY, 12, 0, Math.PI * 2);
    bedCtx.fill();

    // Nozzle center
    bedCtx.fillStyle = '#ef4444';
    bedCtx.beginPath();
    bedCtx.arc(toolX, toolY, 4, 0, Math.PI * 2);
    bedCtx.fill();

    // Crosshairs
    bedCtx.strokeStyle = 'rgba(239, 68, 68, 0.7)';
    bedCtx.lineWidth = 1;
    bedCtx.beginPath();
    bedCtx.moveTo(toolX - 8, toolY);
    bedCtx.lineTo(toolX + 8, toolY);
    bedCtx.moveTo(toolX, toolY - 8);
    bedCtx.lineTo(toolX, toolY + 8);
    bedCtx.stroke();
  }
}

/* ==================== USER ACTIONS & EVENT LISTENERS ==================== */

function initEventListeners() {
  // Tab switching
  document.getElementById('tabPrinter1')?.addEventListener('click', () => switchPrinter('p1'));
  document.getElementById('tabPrinter2')?.addEventListener('click', () => switchPrinter('p2'));

  // Dual fleet card selection
  document.querySelectorAll('.select-printer-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const target = e.target.getAttribute('data-target');
      switchPrinter(target);
      setViewMode('focus');
    });
  });

  // Add Printer Button in tabs bar opens config modal
  document.getElementById('btnAddPrinterTab')?.addEventListener('click', openConfigModal);
  document.getElementById('btnFleetAddPrinter')?.addEventListener('click', openConfigModal);
  document.getElementById('btnOpenFleetConfig')?.addEventListener('click', openConfigModal);

  // Tunnel modal
  document.getElementById('openTunnelHelpBtn')?.addEventListener('click', () => {
    const input = document.getElementById('quickTunnelInput');
    if (input) input.value = STATE.printers.p1.remoteUrl || '';
    document.getElementById('tunnelModal').style.display = 'flex';
  });
  document.getElementById('closeTunnelModal')?.addEventListener('click', () => {
    document.getElementById('tunnelModal').style.display = 'none';
  });
  document.getElementById('btnCloseTunnelModal')?.addEventListener('click', () => {
    document.getElementById('tunnelModal').style.display = 'none';
  });
  document.getElementById('btnSaveQuickTunnel')?.addEventListener('click', () => {
    const input = document.getElementById('quickTunnelInput');
    const val = input.value.trim();
    STATE.printers.p1.remoteUrl = val;
    saveConfigToStorage();
    document.getElementById('tunnelModal').style.display = 'none';
    logTerminal(`Remote tunnel URL set to: ${val || '(direct LAN)'}`, 'success');
    pollPrinters();
    updateCameraFeed(true);
  });

  // View mode switcher
  document.getElementById('viewFocusBtn')?.addEventListener('click', () => setViewMode('focus'));
  document.getElementById('viewDualBtn')?.addEventListener('click', () => setViewMode('dual'));
  document.getElementById('globalRefreshBtn')?.addEventListener('click', () => pollPrinters());

  // Sim Mode Toggle
  document.getElementById('simModeToggle')?.addEventListener('change', (e) => {
    STATE.simMode = e.target.checked;
    saveConfigToStorage();
    logTerminal(`Simulation Mode ${STATE.simMode ? 'ENABLED' : 'DISABLED'}`, 'info');
    pollPrinters();
  });

  // Banner Sim Button
  document.getElementById('bannerSimBtn')?.addEventListener('click', () => {
    STATE.simMode = true;
    const toggle = document.getElementById('simModeToggle');
    if (toggle) toggle.checked = true;
    saveConfigToStorage();
    logTerminal('Simulation mode activated from alert banner.', 'info');
    pollPrinters();
  });

  // Banner Guide Button & Close
  document.getElementById('bannerQuickGuideBtn')?.addEventListener('click', openGuideModal);
  document.getElementById('bannerCloseBtn')?.addEventListener('click', () => {
    const b = document.getElementById('bridgeBanner') || document.getElementById('networkBanner');
    if (b) b.style.display = 'none';
  });

  // Modals
  document.getElementById('openGuideBtn')?.addEventListener('click', openGuideModal);
  document.getElementById('closeGuideModal')?.addEventListener('click', closeGuideModal);
  document.getElementById('guideUnderstoodBtn')?.addEventListener('click', closeGuideModal);

  document.getElementById('openConfigBtn')?.addEventListener('click', () => openConfigModal('siteOptionsPanel'));
  document.getElementById('closeConfigModal')?.addEventListener('click', closeConfigModal);
  document.getElementById('btnSaveConfig')?.addEventListener('click', saveConfigForm);
  document.getElementById('btnResetConfig')?.addEventListener('click', resetConfigForm);

  // Settings Tab Navigation (Separated Site Options and Printer Configs)
  document.getElementById('tabBtnSiteOptions')?.addEventListener('click', () => switchSettingsTab('siteOptionsPanel'));
  document.getElementById('tabBtnP1Config')?.addEventListener('click', () => switchSettingsTab('p1ConfigPanel'));
  document.getElementById('tabBtnP2Config')?.addEventListener('click', () => switchSettingsTab('p2ConfigPanel'));

  // Connection Mode Switch (Cloud Mode Default vs LAN Mode)
  document.getElementById('btnModeCloud')?.addEventListener('click', () => {
    setConnectionMode('cloud', true);
    startTelemetryPolling();
    updateCameraFeed(true);
  });
  document.getElementById('btnModeLan')?.addEventListener('click', () => {
    setConnectionMode('lan', true);
    startTelemetryPolling();
    updateCameraFeed(true);
  });

  // Emergency Stop Modals (Separated P1 and P2)
  document.getElementById('estopBtnP1')?.addEventListener('click', () => openEstopModal('p1'));
  document.getElementById('estopBtnP2')?.addEventListener('click', () => openEstopModal('p2'));
  // Dedicated Emergency Stop Buttons below Cancel Button
  document.getElementById('jobEstopP1')?.addEventListener('click', () => openEstopModal('p1'));
  document.getElementById('jobEstopP2')?.addEventListener('click', () => openEstopModal('p2'));

  document.querySelectorAll('.estop-card-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const target = e.currentTarget.getAttribute('data-target') || 'p1';
      openEstopModal(target);
    });
  });
  document.getElementById('closeEstopModal')?.addEventListener('click', closeEstopModal);
  document.getElementById('btnCancelEstop')?.addEventListener('click', closeEstopModal);
  document.getElementById('btnConfirmEstop')?.addEventListener('click', triggerEmergencyStop);

  // Job Controls
  document.getElementById('btnJobPause')?.addEventListener('click', () => sendJobAction('pause'));
  document.getElementById('btnJobResume')?.addEventListener('click', () => sendJobAction('resume'));
  document.getElementById('btnJobCancel')?.addEventListener('click', () => {
    if (confirm('Are you sure you want to cancel the active print job?')) {
      sendJobAction('cancel');
    }
  });

  // Camera / 2D Bed tabs
  document.getElementById('tabStreamLive')?.addEventListener('click', () => {
    document.getElementById('tabStreamLive').classList.add('active');
    document.getElementById('tabBedVisualizer').classList.remove('active');
    document.getElementById('streamWrapper').style.display = 'block';
    document.getElementById('bedVisualizerWrapper').style.display = 'none';
  });
  document.getElementById('tabBedVisualizer')?.addEventListener('click', () => {
    document.getElementById('tabBedVisualizer').classList.add('active');
    document.getElementById('tabStreamLive').classList.remove('active');
    document.getElementById('streamWrapper').style.display = 'none';
    document.getElementById('bedVisualizerWrapper').style.display = 'flex';
    renderBedVisualizer();
  });

  // Camera Actions
  const openPopoutCam = () => {
    const p = STATE.printers[STATE.activePrinterId];
    let target = p.camStreamUrl || `http://${p.ip}/webcam/?action=stream`;
    if (!STATE.isLocalLAN) {
      target = `index.php?route=api&action=snapshot&printer=${STATE.activePrinterId}&t=${Date.now()}`;
    }
    window.open(target, '3DPrinterCamera', 'width=700,height=530,resizable=yes,scrollbars=no');
    logTerminal(`Opened camera popout window for ${p.name}`, 'info');
  };

  document.getElementById('btnPopoutCam')?.addEventListener('click', openPopoutCam);
  document.getElementById('btnBlockedPopout')?.addEventListener('click', openPopoutCam);
  document.getElementById('btnGuideOpenPopout')?.addEventListener('click', () => {
    openPopoutCam();
    document.getElementById('chromeGuideModal').style.display = 'none';
  });

  // Toggle Snapshot / Stream Mode
  const toggleSnap = () => {
    STATE.camMode = (STATE.camMode === 'stream') ? 'snapshot' : 'stream';
    logTerminal(`Camera mode switched to ${STATE.camMode === 'stream' ? 'LAN STREAM' : 'CLOUD SNAPSHOT'}`, 'info');
    updateCameraFeed(true);
  };
  document.getElementById('btnToggleSnapMode')?.addEventListener('click', toggleSnap);
  document.getElementById('btnBlockedSnapshot')?.addEventListener('click', () => {
    STATE.camMode = 'snapshot';
    updateCameraFeed(true);
  });

  // Mixed content Chrome / Edge guide modal
  const openChromeGuide = () => {
    const p = STATE.printers[STATE.activePrinterId];
    const guideUrlEl = document.getElementById('guidePrinterCamUrl');
    if (guideUrlEl) guideUrlEl.textContent = p.camStreamUrl || 'http://192.168.1.124/...';
    document.getElementById('chromeGuideModal').style.display = 'flex';
  };
  document.getElementById('btnBlockedGuide')?.addEventListener('click', openChromeGuide);
  document.getElementById('closeChromeGuideModal')?.addEventListener('click', () => {
    document.getElementById('chromeGuideModal').style.display = 'none';
  });
  document.getElementById('btnCloseChromeGuide')?.addEventListener('click', () => {
    document.getElementById('chromeGuideModal').style.display = 'none';
  });

  document.getElementById('btnSnapCam')?.addEventListener('click', () => {
    const img = document.getElementById('cameraStreamImg');
    const p = STATE.printers[STATE.activePrinterId];
    if (!img || !p) return;
    if (STATE.isLocalLAN && p.camSnapshotUrl) {
      const snapUrl = p.camSnapshotUrl.includes('?') ? `${p.camSnapshotUrl}&t=${Date.now()}` : `${p.camSnapshotUrl}?t=${Date.now()}`;
      img.src = snapUrl;
      logTerminal(`Captured fresh LAN snapshot from ${p.name}.`, 'info');
    } else {
      loadSingleCloudSnapshot();
      logTerminal(`Captured fresh Cloud snapshot from ${p.name}.`, 'info');
    }
  });

  document.getElementById('btnFullCam')?.addEventListener('click', () => {
    const el = document.getElementById('cameraPanel');
    if (!document.fullscreenElement) {
      el.requestFullscreen?.().catch(err => console.log(err));
    } else {
      document.exitFullscreen?.();
    }
  });

  // Heating Presets
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const type = e.target.getAttribute('data-type');
      const temp = parseFloat(e.target.getAttribute('data-temp'));
      setTemperature(type, temp);
    });
  });

  // Terminal Form
  document.getElementById('terminalForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('terminalInput');
    const cmd = input.value.trim();
    if (cmd) {
      sendGcode(cmd);
      input.value = '';
    }
  });

  document.getElementById('btnClearTerminal')?.addEventListener('click', () => {
    const out = document.getElementById('terminalOutput');
    if (out) out.innerHTML = '';
  });

  // Terminal Macro Buttons
  document.querySelectorAll('.macro-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const cmd = e.target.getAttribute('data-cmd');
      sendGcode(cmd);
    });
  });

  // Printer 2 Specific actions
  document.getElementById('fc2PingBtn')?.addEventListener('click', pingPrinter2);
  document.getElementById('fc2SimToggle')?.addEventListener('click', () => {
    STATE.printers.p2.online = !STATE.printers.p2.online;
    logTerminal(`Printer 02 Simulation ${STATE.printers.p2.online ? 'Online' : 'Offline'}`, 'info');
    renderAll();
  });
}

function switchPrinter(printerId) {
  STATE.activePrinterId = printerId;
  const p = STATE.printers[printerId];
  logTerminal(`Switched active focus to ${p.name}`, 'info');

  const img = document.getElementById('cameraStreamImg');
  if (img) {
    img.src = printerId === 'p1' ? 'assets/NewPrinterIcon.jpeg' : 'assets/KK3.webp';
  }

  updateCameraFeed(true);
  renderAll();
}

function setViewMode(mode) {
  STATE.viewMode = mode;
  const dualCont = document.getElementById('dualFleetContainer');
  const focusCont = document.getElementById('focusContainer');
  const btnFocus = document.getElementById('viewFocusBtn');
  const btnDual = document.getElementById('viewDualBtn');

  if (mode === 'dual') {
    if (dualCont) dualCont.style.display = 'grid';
    if (focusCont) focusCont.style.display = 'none';
    btnDual.classList.add('active');
    btnFocus.classList.remove('active');
  } else {
    if (dualCont) dualCont.style.display = 'none';
    if (focusCont) focusCont.style.display = 'block';
    btnFocus.classList.add('active');
    btnDual.classList.remove('active');
  }
}

/* ==================== HARDWARE / G-CODE DISPATCH ==================== */

async function sendGcode(cmd, targetPrinterId = null) {
  logTerminal(cmd, 'echo');
  const targetKey = targetPrinterId || STATE.activePrinterId;
  const p = STATE.printers[targetKey];
  if (!p) return;

  if (STATE.simMode || !p.online) {
    handleSimulatedGcodeResponse(cmd, p);
    return;
  }

  // Attempt Moonraker REST API call
  const baseUrl = p.remoteUrl || `http://${p.ip}:${p.port}`;
  try {
    const resp = await fetch(`${baseUrl}/printer/gcode/script?script=${encodeURIComponent(cmd)}`, {
      method: 'POST'
    });
    if (resp.ok) {
      logTerminal(`// ${cmd} acknowledged by ${p.name}`, 'success');
    } else {
      logTerminal(`Error executing ${cmd}: HTTP ${resp.status}`, 'error');
    }
  } catch (err) {
    logTerminal(`Network / CORS block on ${cmd}: Falling back to local execution.`, 'warning');
    handleSimulatedGcodeResponse(cmd, p);
  }
}

function handleSimulatedGcodeResponse(cmd, p) {
  const upper = cmd.trim().toUpperCase();
  if (upper === 'M105') {
    logTerminal(`ok B:${p.bed.actual} /${p.bed.target} T0:${p.extruder.actual} /${p.extruder.target}`, 'info');
  } else if (upper === 'M114') {
    logTerminal(`X:${p.toolhead.x} Y:${p.toolhead.y} Z:${p.toolhead.z} E:${p.filamentUsedMm}`, 'info');
  } else if (upper.startsWith('G28')) {
    logTerminal('Homing complete. Toolhead reference re-aligned.', 'success');
  } else if (upper === 'M84') {
    logTerminal('Stepper motors disabled.', 'info');
  } else {
    logTerminal(`ok // Simulated executed: ${cmd}`, 'success');
  }
}

function jogAxis(axis, distance) {
  const p = STATE.printers[STATE.activePrinterId];
  const gcode = `G91\nG1 ${axis}${distance} F6000\nG90`;
  sendGcode(gcode);

  // Update local coords
  if (axis === 'X') p.toolhead.x = parseFloat((p.toolhead.x + distance).toFixed(1));
  if (axis === 'Y') p.toolhead.y = parseFloat((p.toolhead.y + distance).toFixed(1));
  if (axis === 'Z') p.toolhead.z = parseFloat(Math.max(0, p.toolhead.z + distance).toFixed(2));
  renderFocusView();
  renderBedVisualizer();
}

function setTemperature(type, temp) {
  const p = STATE.printers[STATE.activePrinterId];
  if (type === 'ext') {
    const maxAllowed = STATE.activePrinterId === 'p1' ? 370 : 280;
    const safeTemp = Math.max(0, Math.min(maxAllowed, temp));
    p.extruder.target = safeTemp;
    sendGcode(`M104 S${safeTemp}`);
    logTerminal(`Set Extruder Target to ${safeTemp}°C (Max: ${maxAllowed}°C)`, 'info');
  } else if (type === 'bed') {
    const maxBed = 120;
    const safeBed = Math.max(0, Math.min(maxBed, temp));
    p.bed.target = safeBed;
    sendGcode(`M140 S${safeBed}`);
    logTerminal(`Set Bed Target to ${safeBed}°C`, 'info');
  }
  renderFocusView();
}

async function sendJobAction(action) {
  const p = STATE.printers[STATE.activePrinterId];
  logTerminal(`Print Job Action: ${action.toUpperCase()}`, 'warning');

  if (action === 'pause') {
    p.state = 'paused';
    sendGcode('PAUSE');
  } else if (action === 'resume') {
    p.state = 'printing';
    sendGcode('RESUME');
  } else if (action === 'cancel') {
    p.state = 'ready';
    p.progress = 0;
    sendGcode('CANCEL_PRINT');
    clearPrintCache(STATE.activePrinterId);
  }
  renderAll();
}

// Emergency Stop triggers are handled below per target machine

async function pingPrinter2() {
  logTerminal('Pinging 192.168.1.36:7125...', 'info');
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);
    const resp = await fetch(`http://${STATE.printers.p2.ip}:${STATE.printers.p2.port}/printer/info`, {
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (resp.ok) {
      STATE.printers.p2.online = true;
      logTerminal('Printer 02 reachable and online!', 'success');
    }
  } catch (e) {
    logTerminal('Ping 192.168.1.36 failed: Host unreachable or blocked by CORS.', 'error');
  }
  renderAll();
}

/* ==================== TERMINAL LOGGING ==================== */

function logTerminal(message, type = 'info') {
  const term = document.getElementById('terminalOutput');
  if (!term) return;

  const line = document.createElement('div');
  line.className = `term-line ${type}`;

  const now = new Date();
  const timeStr = `[${padZero(now.getHours())}:${padZero(now.getMinutes())}:${padZero(now.getSeconds())}]`;

  line.innerHTML = `<span class="term-time">${timeStr}</span> ${escapeHtml(message)}`;
  term.appendChild(line);
  term.scrollTop = term.scrollHeight;
}

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* ==================== MODAL MANAGEMENT ==================== */

function openGuideModal() {
  const m = document.getElementById('guideModal');
  if (m) m.style.display = 'flex';
}
function closeGuideModal() {
  const m = document.getElementById('guideModal');
  if (m) m.style.display = 'none';
}

function switchSettingsTab(tabId) {
  const tabs = [
    { btn: 'tabBtnSiteOptions', panel: 'siteOptionsPanel' },
    { btn: 'tabBtnP1Config', panel: 'p1ConfigPanel' },
    { btn: 'tabBtnP2Config', panel: 'p2ConfigPanel' }
  ];
  tabs.forEach(t => {
    const b = document.getElementById(t.btn);
    const p = document.getElementById(t.panel);
    const isActive = (t.panel === tabId || t.btn === tabId);
    if (b) {
      b.classList.toggle('active', isActive);
      b.setAttribute('aria-selected', isActive ? 'true' : 'false');
    }
    if (p) {
      p.style.display = isActive ? 'flex' : 'none';
      p.classList.toggle('active', isActive);
    }
  });
}

function openConfigModal(initialTab = 'siteOptionsPanel') {
  const m = document.getElementById('configModal');
  if (!m) return;
  m.style.display = 'flex';

  switchSettingsTab(initialTab);
  setConnectionMode(STATE.connectionMode || 'cloud', false);

  if (document.getElementById('cfgP1Name')) document.getElementById('cfgP1Name').value = STATE.printers.p1.name;
  if (document.getElementById('cfgP1Ip')) document.getElementById('cfgP1Ip').value = STATE.printers.p1.ip;
  if (document.getElementById('cfgP1Port')) document.getElementById('cfgP1Port').value = STATE.printers.p1.port;
  if (document.getElementById('cfgP1Remote')) document.getElementById('cfgP1Remote').value = STATE.printers.p1.remoteUrl;
  if (document.getElementById('cfgP1CamStream')) document.getElementById('cfgP1CamStream').value = STATE.printers.p1.camStreamUrl;
  if (document.getElementById('cfgP1CamSnapshot')) document.getElementById('cfgP1CamSnapshot').value = STATE.printers.p1.camSnapshotUrl;

  if (document.getElementById('cfgP2Name')) document.getElementById('cfgP2Name').value = STATE.printers.p2.name;
  if (document.getElementById('cfgP2Ip')) document.getElementById('cfgP2Ip').value = STATE.printers.p2.ip;
  if (document.getElementById('cfgP2Port')) document.getElementById('cfgP2Port').value = STATE.printers.p2.port;
  if (document.getElementById('cfgP2Remote')) document.getElementById('cfgP2Remote').value = STATE.printers.p2.remoteUrl;
  if (document.getElementById('cfgP2CamStream')) document.getElementById('cfgP2CamStream').value = STATE.printers.p2.camStreamUrl;
  if (document.getElementById('cfgP2CamSnapshot')) document.getElementById('cfgP2CamSnapshot').value = STATE.printers.p2.camSnapshotUrl;

  if (document.getElementById('cfgPollInterval')) document.getElementById('cfgPollInterval').value = STATE.pollInterval;
  if (document.getElementById('cfgCamMode')) document.getElementById('cfgCamMode').value = STATE.camMode || 'stream';
}
function closeConfigModal() {
  const m = document.getElementById('configModal');
  if (m) m.style.display = 'none';
}

function saveConfigForm() {
  STATE.printers.p1.name = document.getElementById('cfgP1Name').value.trim() || STATE.printers.p1.name;
  STATE.printers.p1.ip = document.getElementById('cfgP1Ip').value.trim() || STATE.printers.p1.ip;
  STATE.printers.p1.port = parseInt(document.getElementById('cfgP1Port').value, 10) || 7125;
  STATE.printers.p1.remoteUrl = document.getElementById('cfgP1Remote').value.trim();
  STATE.printers.p1.camStreamUrl = document.getElementById('cfgP1CamStream').value.trim() || STATE.printers.p1.camStreamUrl;
  STATE.printers.p1.camSnapshotUrl = document.getElementById('cfgP1CamSnapshot').value.trim() || STATE.printers.p1.camSnapshotUrl;

  STATE.printers.p2.name = document.getElementById('cfgP2Name').value.trim() || STATE.printers.p2.name;
  STATE.printers.p2.ip = document.getElementById('cfgP2Ip').value.trim() || STATE.printers.p2.ip;
  STATE.printers.p2.port = parseInt(document.getElementById('cfgP2Port').value, 10) || 7125;
  STATE.printers.p2.remoteUrl = document.getElementById('cfgP2Remote').value.trim();
  STATE.printers.p2.camStreamUrl = document.getElementById('cfgP2CamStream').value.trim() || STATE.printers.p2.camStreamUrl;
  STATE.printers.p2.camSnapshotUrl = document.getElementById('cfgP2CamSnapshot').value.trim() || STATE.printers.p2.camSnapshotUrl;

  STATE.pollInterval = parseInt(document.getElementById('cfgPollInterval').value, 10) || 2000;
  if (document.getElementById('cfgCamMode')) {
    STATE.camMode = document.getElementById('cfgCamMode').value;
  }

  saveConfigToStorage();
  closeConfigModal();
  startTelemetryPolling();
  updateCameraFeed();
  renderAll();
  logTerminal('Configuration saved successfully.', 'success');
}

function resetConfigForm() {
  if (confirm('Reset printer settings to defaults?')) {
    localStorage.removeItem('nexus_3d_config');
    STATE.printers.p1.ip = '192.168.1.124';
    STATE.printers.p1.port = 7125;
    STATE.printers.p1.camStreamUrl = 'http://192.168.1.124/webcam/?action=stream';
    STATE.printers.p1.camSnapshotUrl = 'http://192.168.1.124/webcam/?action=snapshot';

    STATE.printers.p2.name = 'FLASHFORGE AD5X';
    STATE.printers.p2.ip = '192.168.1.36';
    STATE.printers.p2.port = 7125;
    STATE.printers.p2.camStreamUrl = 'http://192.168.1.36:8080/?action=stream';
    STATE.printers.p2.camSnapshotUrl = 'http://192.168.1.36:8080/?action=snapshot';

    closeConfigModal();
    updateCameraFeed();
    renderAll();
  }
}

let pendingEstopPrinterId = 'p1';

function openEstopModal(targetId = null) {
  const printerId = (typeof targetId === 'string' && targetId) ? targetId : STATE.activePrinterId;
  pendingEstopPrinterId = printerId;
  const p = STATE.printers[printerId];
  const pName = p ? p.name : (printerId === 'p1' ? 'Printer 1 (QIDI Q2)' : 'Printer 2 (FLASHFORGE AD5X)');

  const titleEl = document.getElementById('estopModalTitle');
  if (titleEl) {
    titleEl.textContent = `⚠️ EMERGENCY STOP ${printerId.toUpperCase()} (M112)`;
  }
  const nameEl = document.getElementById('estopTargetPrinterName');
  if (nameEl) {
    nameEl.textContent = pName;
  }

  const m = document.getElementById('estopModal');
  if (m) m.style.display = 'flex';
}

function closeEstopModal() {
  const m = document.getElementById('estopModal');
  if (m) m.style.display = 'none';
}

async function triggerEmergencyStop() {
  closeEstopModal();
  const targetId = pendingEstopPrinterId || STATE.activePrinterId || 'p1';
  const p = STATE.printers[targetId];
  const pName = p ? p.name : targetId.toUpperCase();

  logTerminal(`!!! EMERGENCY STOP M112 TRIGGERED FOR ${pName} !!!`, 'error');

  if (p) {
    p.extruder.target = 0;
    p.bed.target = 0;
    p.state = 'error';
  }

  try {
    if (p) {
      const baseUrl = p.remoteUrl || `http://${p.ip}:${p.port}`;
      fetch(`${baseUrl}/printer/emergency_stop`, { method: 'POST' }).catch(() => {});
      sendGcode('M112', targetId);
    }
  } catch (e) {}

  alert(`EMERGENCY STOP (M112) ACTIVATED on ${pName}:\nHeater power cut and steppers disabled.`);
  renderAll();
}

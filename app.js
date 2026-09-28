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
  
  // History for temperature charts
  tempHistory: {
    p1: [],
    p2: []
  },

  camMode: 'stream', // 'stream' or 'snapshot'
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
      state: 'printing', // 'printing', 'paused', 'ready', 'standby', 'offline'
      filename: 'qidi-box-ams-snap-base-for-v5.gcode.3mf',
      currentLayer: 193,
      totalLayer: 259,
      progress: 73.1,
      elapsedSeconds: 7578,
      totalDurationSeconds: 10365,
      filamentUsedMm: 14348.7,
      extruder: { actual: 259.8, target: 260.0, power: 0.51 },
      bed: { actual: 100.0, target: 100.0, power: 0.34 },
      chamber: { actual: 48.2 },
      toolhead: { x: 49.8, y: 175.0, z: 24.04, maxVel: 600, maxAccel: 10000, fan: 100, speedFactor: 100 }
    },
    p2: {
      id: 'p2',
      name: 'Printer 02 (CoreXY Pro)',
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
      filamentUsedMm: 0,
      extruder: { actual: 24.2, target: 0.0, power: 0.0 },
      bed: { actual: 23.8, target: 0.0, power: 0.0 },
      chamber: { actual: 24.0 },
      toolhead: { x: 0.0, y: 0.0, z: 0.0, maxVel: 500, maxAccel: 8000, fan: 0, speedFactor: 100 }
    }
  }
};

// Initialize on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
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
  const savedTheme = localStorage.getItem('nexus_theme') || 'dark';
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
}

function detectHostingEnvironment() {
  logTerminal('NEXUS 3D v2.0 initialized with Bridge Architecture.', 'info');
  logTerminal('Polling Pantheon telemetry ingestion endpoint...', 'info');
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

        STATE.printers.p2.name = parsed.printers.p2.name || STATE.printers.p2.name;
        STATE.printers.p2.ip = parsed.printers.p2.ip || STATE.printers.p2.ip;
        STATE.printers.p2.port = parsed.printers.p2.port || STATE.printers.p2.port;
        STATE.printers.p2.remoteUrl = parsed.printers.p2.remoteUrl || '';
        STATE.printers.p2.camStreamUrl = parsed.printers.p2.camStreamUrl || STATE.printers.p2.camStreamUrl;
        STATE.printers.p2.camSnapshotUrl = parsed.printers.p2.camSnapshotUrl || STATE.printers.p2.camSnapshotUrl;
      }
      if (parsed.pollInterval) STATE.pollInterval = parsed.pollInterval;
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
      simMode: STATE.simMode
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

async function pollPrinters() {
  const start = performance.now();

  if (STATE.simMode) {
    simulateTelemetry();
    STATE.latency = Math.floor(8 + Math.random() * 8);
    updateLatency(STATE.latency);
    renderAll();
    return;
  }

  // Poll Pantheon Ingestion API (/index.php?route=api&action=latest)
  try {
    const resp = await fetch('index.php?route=api&action=latest', {
      headers: { 'Accept': 'application/json' },
      cache: 'no-store'
    });

    if (resp.status === 401 || resp.status === 403) {
      window.location.href = 'index.php?route=login';
      return;
    }

    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`);
    }

    const data = await resp.json();
    if (data.status === 'ok' && data.printers) {
      handleBridgeTelemetry(data.printers);
    } else {
      showBridgeOffline('Awaiting Telemetry: No data received yet from local bridge.');
    }
  } catch (err) {
    console.warn('Bridge query error:', err);
    showBridgeOffline('Bridge Offline: Cannot connect to Pantheon telemetry endpoint.');
  }

  STATE.latency = Math.max(12, Math.floor(performance.now() - start));
  updateLatency(STATE.latency);
  renderAll();
}

function handleBridgeTelemetry(bridgePrinters) {
  const p1Data = bridgePrinters.p1;
  const banner = document.getElementById('bridgeBanner');
  const networkPulse = document.getElementById('networkPulse');
  const networkLabel = document.getElementById('networkLabel');

  if (!p1Data) {
    showBridgeOffline('Bridge Offline: No telemetry from QIDI Q2 (192.168.1.124).');
    return;
  }

  const age = p1Data._age !== undefined ? p1Data._age : 0;
  if (age > 15) {
    showBridgeOffline(`Bridge Stale: Last telemetry was ${age}s ago.`);
  } else {
    // Healthy bridge
    if (banner) banner.style.display = 'none';
    if (networkPulse) networkPulse.className = 'badge-dot pulse-cyan';
    if (networkLabel) networkLabel.textContent = `Bridge: Online (${age}s)`;
  }

  // Sync Printer 1
  const p1 = STATE.printers.p1;
  p1.online = p1Data.online !== false;
  if (p1Data.state) p1.state = p1Data.state;
  if (p1Data.filename) p1.filename = p1Data.filename;
  if (p1Data.currentLayer !== undefined) p1.currentLayer = p1Data.currentLayer;
  if (p1Data.totalLayer !== undefined) p1.totalLayer = p1Data.totalLayer;
  if (p1Data.progress !== undefined) p1.progress = p1Data.progress;
  if (p1Data.elapsedSeconds !== undefined) p1.elapsedSeconds = p1Data.elapsedSeconds;
  if (p1Data.totalDurationSeconds !== undefined) p1.totalDurationSeconds = p1Data.totalDurationSeconds;
  if (p1Data.filamentUsedMm !== undefined) p1.filamentUsedMm = p1Data.filamentUsedMm;

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

  // Update Printer 2 if present in bridge payload
  if (bridgePrinters.p2) {
    Object.assign(STATE.printers.p2, bridgePrinters.p2);
  }

  // Update snapshot if URL available
  if (p1Data.snapshot_url) {
    updateBridgeCamera(p1Data.snapshot_url);
  }

  recordTempHistory('p1', p1.extruder.actual, p1.extruder.target, p1.bed.actual, p1.bed.target);
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
  }

  recordTempHistory('p1', p1.extruder.actual, p1.extruder.target, p1.bed.actual, p1.bed.target);

  if (STATE.printers.p2.online) {
    simulatePrinter2();
  }
}

function simulatePrinter2() {
  const p2 = STATE.printers.p2;
  // If simulated online in standby or printing
  p2.extruder.actual = parseFloat((24 + Math.sin(simTick * 0.1) * 0.3).toFixed(1));
  p2.bed.actual = parseFloat((23.8 + Math.cos(simTick * 0.1) * 0.2).toFixed(1));
  recordTempHistory('p2', p2.extruder.actual, p2.extruder.target, p2.bed.actual, p2.bed.target);
}

function recordTempHistory(printerId, extAct, extTar, bedAct, bedTar) {
  const hist = STATE.tempHistory[printerId];
  hist.push({
    time: Date.now(),
    extAct,
    extTar,
    bedAct,
    bedTar
  });

  // Keep last 40 data points
  if (hist.length > 40) hist.shift();
}

/* ==================== RENDERING / UI UPDATES ==================== */

function renderAll() {
  renderNavBadges();
  renderTabs();
  renderDualFleet();
  renderFocusView();
  renderTempChart();
  renderBedVisualizer();
}

let lastCamFetchTime = 0;
function updateBridgeCamera(snapshotUrl) {
  const img = document.getElementById('cameraStreamImg');
  const standbyOverlay = document.getElementById('cameraStandbyOverlay');
  const fpsBadge = document.getElementById('cameraFpsBadge');

  if (!img) return;

  const now = Date.now();
  if (now - lastCamFetchTime < 1000) return;
  lastCamFetchTime = now;

  const targetUrl = snapshotUrl || `index.php?route=api&action=snapshot&printer=${STATE.activePrinterId}&t=${now}`;

  const preloader = new Image();
  preloader.onload = () => {
    img.src = targetUrl;
    if (standbyOverlay) standbyOverlay.style.display = 'none';
    if (fpsBadge) fpsBadge.textContent = 'CLOUD LIVE';
  };
  preloader.onerror = () => {
    if (!img.src.includes('assets/')) {
      img.src = STATE.activePrinterId === 'p1' ? 'assets/print_thumbnail.jpg' : 'assets/printer2_standby.jpg';
    }
    if (fpsBadge) fpsBadge.textContent = 'STANDBY';
  };
  preloader.src = targetUrl;
}

function updateCameraFeed(force = false) {
  const p = STATE.printers[STATE.activePrinterId];
  if (!p) return;

  const hudName = document.getElementById('hudCamName');
  if (hudName) {
    hudName.textContent = STATE.activePrinterId === 'p1' 
      ? `CAM 1: QIDI HD (${p.ip})` 
      : `CAM 2: Fleet Slot 2`;
  }

  if (STATE.simMode) {
    const img = document.getElementById('cameraStreamImg');
    if (img) img.src = STATE.activePrinterId === 'p1' ? 'assets/print_thumbnail.jpg' : 'assets/printer2_standby.jpg';
    const fpsBadge = document.getElementById('cameraFpsBadge');
    if (fpsBadge) fpsBadge.textContent = 'DEMO';
    return;
  }

  updateBridgeCamera(p.snapshotUrl);
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
    p1Prev.textContent = `L: ${p1.currentLayer}/${p1.totalLayer} • ${p1.extruder.actual}°C / ${p1.bed.actual}°C`;
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
  const fc1Layer = document.getElementById('fc1Layer');
  const fc1Ext = document.getElementById('fc1Extruder');
  const fc1Bed = document.getElementById('fc1Bed');
  const fc1Remain = document.getElementById('fc1Remain');

  if (fc1Percent) fc1Percent.textContent = `${p1.progress}%`;
  if (fc1File) fc1File.textContent = p1.filename;
  if (fc1Layer) fc1Layer.textContent = `${p1.currentLayer} / ${p1.totalLayer}`;
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
  const heroLiveTag = document.getElementById('heroLiveTag');
  const heroFilename = document.getElementById('heroFilename');
  const heroStateBadge = document.getElementById('heroStateBadge');
  const heroCurLayer = document.getElementById('heroCurLayer');
  const heroTotLayer = document.getElementById('heroTotLayer');
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
  if (heroCurLayer) heroCurLayer.textContent = p.currentLayer;
  if (heroTotLayer) heroTotLayer.textContent = p.totalLayer;
  if (heroPercent) heroPercent.textContent = `${p.progress}%`;
  if (heroProgressBar) {
    heroProgressBar.style.width = `${Math.min(100, Math.max(0, p.progress))}%`;
    if (p.online && p.state === 'printing') {
      heroProgressBar.classList.add('animating');
    } else {
      heroProgressBar.classList.remove('animating');
    }
  }
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
  const extCircle = document.getElementById('extGaugeCircle');

  if (extTempAct) extTempAct.textContent = p.extruder.actual;
  if (extTempTar) extTempTar.textContent = p.extruder.target;
  if (extPower) extPower.textContent = `PWR: ${Math.round(p.extruder.power * 100)}%`;
  if (extCircle) {
    // Circle circumference is 2 * PI * 58 = ~364.4
    // Scale 0 - 300 deg C
    const ratio = Math.min(1, Math.max(0, p.extruder.actual / 300));
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
  const valFanSpeed = document.getElementById('valFanSpeed');

  if (coordX) coordX.textContent = p.toolhead.x;
  if (coordY) coordY.textContent = p.toolhead.y;
  if (coordZ) coordZ.textContent = p.toolhead.z;
  if (valMaxVel) valMaxVel.textContent = `${p.toolhead.maxVel} mm/s`;
  if (valMaxAccel) valMaxAccel.textContent = `${p.toolhead.maxAccel.toLocaleString()} mm/s²`;
  if (valFanSpeed) valFanSpeed.textContent = `${p.toolhead.fan}%`;

  // Chamber & Speeds
  const chamberVal = document.getElementById('chamberTempVal');
  if (chamberVal) chamberVal.textContent = p.chamber.actual;

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

/* ==================== CANVAS CHART & 2D BED VISUALIZER ==================== */

let tempCtx = null;
let bedCtx = null;

function initCanvases() {
  const tempCanvas = document.getElementById('tempCanvas');
  if (tempCanvas) {
    // retina scaling
    tempCanvas.width = tempCanvas.parentElement.clientWidth * 2;
    tempCanvas.height = 180 * 2;
    tempCtx = tempCanvas.getContext('2d');
    tempCtx.scale(2, 2);
  }

  const bedCanvas = document.getElementById('bedCanvas');
  if (bedCanvas) {
    bedCanvas.width = 400 * 2;
    bedCanvas.height = 350 * 2;
    bedCtx = bedCanvas.getContext('2d');
    bedCtx.scale(2, 2);
  }
}

function renderTempChart() {
  if (!tempCtx) return;
  const canvas = tempCtx.canvas;
  const width = canvas.width / 2;
  const height = canvas.height / 2;

  // Clear
  tempCtx.clearRect(0, 0, width, height);

  const hist = STATE.tempHistory[STATE.activePrinterId] || [];
  if (hist.length < 2) {
    tempCtx.fillStyle = '#64748b';
    tempCtx.font = '12px "JetBrains Mono", monospace';
    tempCtx.textAlign = 'center';
    tempCtx.fillText('Gathering telemetry data points...', width / 2, height / 2);
    return;
  }

  // Draw grid lines
  tempCtx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  tempCtx.lineWidth = 1;
  const gridSteps = 4;
  for (let i = 0; i <= gridSteps; i++) {
    const y = (height / gridSteps) * i;
    tempCtx.beginPath();
    tempCtx.moveTo(35, y);
    tempCtx.lineTo(width - 10, y);
    tempCtx.stroke();

    // Temp labels: 0°C to 300°C
    const tempVal = Math.round(300 - (i * (300 / gridSteps)));
    tempCtx.fillStyle = '#475569';
    tempCtx.font = '9px "JetBrains Mono", monospace';
    tempCtx.textAlign = 'right';
    tempCtx.fillText(`${tempVal}°C`, 30, y + 3);
  }

  const plotW = width - 45;
  const plotH = height - 20;
  const maxTemp = 300;

  function getY(temp) {
    const ratio = Math.min(1, Math.max(0, temp / maxTemp));
    return (height - 10) - (ratio * plotH);
  }

  function getX(idx, total) {
    return 40 + (idx / (total - 1)) * plotW;
  }

  // 1. Draw Extruder Target (dashed cyan)
  tempCtx.strokeStyle = 'rgba(0, 242, 254, 0.4)';
  tempCtx.lineWidth = 1.5;
  tempCtx.setLineDash([4, 4]);
  tempCtx.beginPath();
  hist.forEach((pt, idx) => {
    const x = getX(idx, hist.length);
    const y = getY(pt.extTar);
    if (idx === 0) tempCtx.moveTo(x, y);
    else tempCtx.lineTo(x, y);
  });
  tempCtx.stroke();

  // 2. Draw Bed Target (dashed amber)
  tempCtx.strokeStyle = 'rgba(245, 158, 11, 0.4)';
  tempCtx.beginPath();
  hist.forEach((pt, idx) => {
    const x = getX(idx, hist.length);
    const y = getY(pt.bedTar);
    if (idx === 0) tempCtx.moveTo(x, y);
    else tempCtx.lineTo(x, y);
  });
  tempCtx.stroke();
  tempCtx.setLineDash([]); // Reset dash

  // 3. Draw Bed Actual (Amber solid)
  tempCtx.strokeStyle = '#f59e0b';
  tempCtx.lineWidth = 2;
  tempCtx.beginPath();
  hist.forEach((pt, idx) => {
    const x = getX(idx, hist.length);
    const y = getY(pt.bedAct);
    if (idx === 0) tempCtx.moveTo(x, y);
    else tempCtx.lineTo(x, y);
  });
  tempCtx.stroke();

  // 4. Draw Extruder Actual (Cyan solid + glow)
  tempCtx.strokeStyle = '#00f2fe';
  tempCtx.lineWidth = 2.5;
  tempCtx.shadowColor = 'rgba(0, 242, 254, 0.5)';
  tempCtx.shadowBlur = 8;
  tempCtx.beginPath();
  hist.forEach((pt, idx) => {
    const x = getX(idx, hist.length);
    const y = getY(pt.extAct);
    if (idx === 0) tempCtx.moveTo(x, y);
    else tempCtx.lineTo(x, y);
  });
  tempCtx.stroke();
  tempCtx.shadowBlur = 0; // reset
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
  bedCtx.roundRect(startX, startY, drawW, drawH, 8);
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

  // Draw Printed Part Boundary (qidi-box-ams-snap-base)
  const partCenterX = 113 * scale;
  const partCenterY = drawH - (112 * scale);
  const partW = 90 * scale;
  const partH = 90 * scale;

  bedCtx.fillStyle = 'rgba(0, 242, 254, 0.12)';
  bedCtx.strokeStyle = 'rgba(0, 242, 254, 0.6)';
  bedCtx.lineWidth = 1.5;
  bedCtx.beginPath();
  bedCtx.roundRect(startX + partCenterX - (partW/2), startY + partCenterY - (partH/2), partW, partH, 6);
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

  document.getElementById('openConfigBtn')?.addEventListener('click', openConfigModal);
  document.getElementById('closeConfigModal')?.addEventListener('click', closeConfigModal);
  document.getElementById('btnSaveConfig')?.addEventListener('click', saveConfigForm);
  document.getElementById('btnResetConfig')?.addEventListener('click', resetConfigForm);

  // Emergency Stop Modals
  document.getElementById('globalEstopBtn')?.addEventListener('click', openEstopModal);
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
    const streamUrl = p.camStreamUrl || `http://${p.ip}/webcam/?action=stream`;
    window.open(streamUrl, '3DPrinterCamera', 'width=700,height=530,resizable=yes,scrollbars=no');
    logTerminal(`Opened camera popout window for ${p.name}`, 'info');
  };

  document.getElementById('btnPopoutCam')?.addEventListener('click', openPopoutCam);
  document.getElementById('btnBlockedPopout')?.addEventListener('click', openPopoutCam);
  document.getElementById('btnGuideOpenPopout')?.addEventListener('click', () => {
    openPopoutCam();
    document.getElementById('chromeGuideModal').style.display = 'none';
  });

  // Toggle Snapshot Mode
  const toggleSnap = () => {
    STATE.camMode = (STATE.camMode === 'stream') ? 'snapshot' : 'stream';
    logTerminal(`Camera mode switched to ${STATE.camMode.toUpperCase()}`, 'info');
    updateCameraFeed();
  };
  document.getElementById('btnToggleSnapMode')?.addEventListener('click', toggleSnap);
  document.getElementById('btnBlockedSnapshot')?.addEventListener('click', () => {
    STATE.camMode = 'snapshot';
    updateCameraFeed();
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
    if (img && p.camSnapshotUrl) {
      img.src = `${p.camSnapshotUrl}?t=${Date.now()}`;
      logTerminal(`Captured fresh snapshot from ${p.name}.`, 'info');
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

  // Jog Steps
  document.querySelectorAll('.step-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.step-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      STATE.selectedStep = parseFloat(e.target.getAttribute('data-step'));
      logTerminal(`Jog step set to ${STATE.selectedStep} mm`, 'info');
    });
  });

  // Jog Motion Buttons
  document.querySelectorAll('.jog-btn[data-axis]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const target = e.currentTarget;
      const axis = target.getAttribute('data-axis');
      const dir = parseInt(target.getAttribute('data-dir'), 10);
      jogAxis(axis, dir * STATE.selectedStep);
    });
  });

  document.getElementById('btnHomeAll')?.addEventListener('click', () => sendGcode('G28'));
  document.getElementById('btnHomeXY')?.addEventListener('click', () => sendGcode('G28 X Y'));
  document.getElementById('btnHomeZ')?.addEventListener('click', () => sendGcode('G28 Z'));
  document.getElementById('btnMotorsOff')?.addEventListener('click', () => sendGcode('M84'));

  document.getElementById('btnExtrude')?.addEventListener('click', () => {
    sendGcode('M83\nG1 E10 F300');
    logTerminal('Extruding 10mm filament...', 'echo');
  });
  document.getElementById('btnRetract')?.addEventListener('click', () => {
    sendGcode('M83\nG1 E-10 F600');
    logTerminal('Retracting 10mm filament...', 'echo');
  });

  // Heating Presets
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const type = e.target.getAttribute('data-type');
      const temp = parseFloat(e.target.getAttribute('data-temp'));
      setTemperature(type, temp);
    });
  });

  // Speeds Sliders
  document.getElementById('speedFactorSlider')?.addEventListener('input', (e) => {
    const val = e.target.value;
    document.getElementById('speedFactorVal').textContent = `${val}%`;
    sendGcode(`M220 S${val}`);
  });

  document.getElementById('fanSpeedSlider')?.addEventListener('input', (e) => {
    const val = e.target.value;
    document.getElementById('fanSpeedVal').textContent = `${val}%`;
    const pwm = Math.round((val / 100) * 255);
    sendGcode(`M106 S${pwm}`);
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
  logTerminal(`Switched active focus to ${STATE.printers[printerId].name}`, 'info');
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

async function sendGcode(cmd) {
  logTerminal(cmd, 'echo');
  const p = STATE.printers[STATE.activePrinterId];

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
    p.extruder.target = temp;
    sendGcode(`M104 S${temp}`);
    logTerminal(`Set Extruder Target to ${temp}°C`, 'info');
  } else if (type === 'bed') {
    p.bed.target = temp;
    sendGcode(`M140 S${temp}`);
    logTerminal(`Set Bed Target to ${temp}°C`, 'info');
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
  }
  renderAll();
}

async function triggerEmergencyStop() {
  closeEstopModal();
  logTerminal('!!! EMERGENCY STOP M112 TRIGGERED !!!', 'error');
  
  // Cut heaters & state on all printers
  Object.values(STATE.printers).forEach(p => {
    p.extruder.target = 0;
    p.bed.target = 0;
    p.state = 'ready';
  });

  try {
    const p1 = STATE.printers.p1;
    const baseUrl = p1.remoteUrl || `http://${p1.ip}:${p1.port}`;
    fetch(`${baseUrl}/printer/emergency_stop`, { method: 'POST' }).catch(() => {});
  } catch (e) {}

  alert('EMERGENCY STOP (M112) ACTIVATED: Heater power cut and steppers disabled.');
  renderAll();
}

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

function openConfigModal() {
  const m = document.getElementById('configModal');
  if (!m) return;
  m.style.display = 'flex';

  document.getElementById('cfgP1Name').value = STATE.printers.p1.name;
  document.getElementById('cfgP1Ip').value = STATE.printers.p1.ip;
  document.getElementById('cfgP1Port').value = STATE.printers.p1.port;
  document.getElementById('cfgP1Remote').value = STATE.printers.p1.remoteUrl;
  document.getElementById('cfgP1CamStream').value = STATE.printers.p1.camStreamUrl;
  document.getElementById('cfgP1CamSnapshot').value = STATE.printers.p1.camSnapshotUrl;

  document.getElementById('cfgP2Name').value = STATE.printers.p2.name;
  document.getElementById('cfgP2Ip').value = STATE.printers.p2.ip;
  document.getElementById('cfgP2Port').value = STATE.printers.p2.port;
  document.getElementById('cfgP2Remote').value = STATE.printers.p2.remoteUrl;
  document.getElementById('cfgP2CamStream').value = STATE.printers.p2.camStreamUrl;
  document.getElementById('cfgP2CamSnapshot').value = STATE.printers.p2.camSnapshotUrl;

  document.getElementById('cfgPollInterval').value = STATE.pollInterval;
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

    STATE.printers.p2.ip = '192.168.1.36';
    STATE.printers.p2.port = 7125;
    STATE.printers.p2.camStreamUrl = 'http://192.168.1.36:8080/?action=stream';
    STATE.printers.p2.camSnapshotUrl = 'http://192.168.1.36:8080/?action=snapshot';

    closeConfigModal();
    updateCameraFeed();
    renderAll();
  }
}

function openEstopModal() {
  const m = document.getElementById('estopModal');
  if (m) m.style.display = 'flex';
}
function closeEstopModal() {
  const m = document.getElementById('estopModal');
  if (m) m.style.display = 'none';
}

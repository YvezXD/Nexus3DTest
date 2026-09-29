<?php
/**
 * NEXUS 3D — API Handler
 * Routes: push (bridge→cloud), latest (dashboard poll), snapshot (image serve), printers (CRUD)
 */
require_once __DIR__ . '/config.php';

function handleApiRequest() {
    $action = $_GET['action'] ?? '';
    switch ($action) {
        case 'push':        handlePush(); break;
        case 'latest':      handleLatest(); break;
        case 'snapshot':    handleSnapshot(); break;
        case 'printers':    handlePrinters(); break;
        case 'clear_cache': handleClearCache(); break;
        default:            jsonResp(['error' => 'Unknown action'], 400);
    }
}

/* ─── Helper: extract Bearer token from various header locations ─── */
function extractBearerToken() {
    // Standard header
    $h = $_SERVER['HTTP_AUTHORIZATION']
      ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION']
      ?? '';
    if ($h && stripos($h, 'Bearer ') === 0) {
        return substr($h, 7);
    }
    // Custom header fallback (useful behind some proxies)
    if (!empty($_SERVER['HTTP_X_API_TOKEN'])) {
        return $_SERVER['HTTP_X_API_TOKEN'];
    }
    // Query-string fallback (testing only)
    return $_GET['token'] ?? null;
}

/* ═══════════════════════════════════════════════════════════════════
   PUSH  –  Bridge daemon pushes telemetry + snapshots here
   Auth:  Bearer token (no session required)
   ═══════════════════════════════════════════════════════════════════ */
function handlePush() {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        jsonResp(['error' => 'POST required'], 405);
    }

    $token = extractBearerToken();
    if ($token !== NEXUS_API_TOKEN) {
        jsonResp(['error' => 'Unauthorized'], 401);
    }

    $body = json_decode(file_get_contents('php://input'), true);
    if (!$body || !isset($body['printers'])) {
        jsonResp(['error' => 'Invalid payload – missing printers array'], 400);
    }

    ensureNexusDirs();
    $telDir = nexusTelemetryDir();
    $received = 0;

    foreach ($body['printers'] as $printer) {
        $id = preg_replace('/[^a-zA-Z0-9_-]/', '', $printer['id'] ?? 'unknown');
        $printer['_bridge_ts'] = time();
        $printer['_bridge_iso'] = date('c');

        // Atomic write: tmp → rename
        $tmp   = "$telDir/{$id}.tmp";
        $final = "$telDir/{$id}.json";
        file_put_contents($tmp, json_encode($printer, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
        rename($tmp, $final);
        $received++;
    }

    // Base64-encoded JPEG snapshots
    if (isset($body['snapshots']) && is_array($body['snapshots'])) {
        foreach ($body['snapshots'] as $id => $b64) {
            $id = preg_replace('/[^a-zA-Z0-9_-]/', '', $id);
            $jpeg = base64_decode($b64, true);
            if ($jpeg !== false && strlen($jpeg) > 100) {
                $tmp   = "$telDir/{$id}_snap.tmp";
                $final = "$telDir/{$id}_snap.jpg";
                file_put_contents($tmp, $jpeg);
                rename($tmp, $final);
            }
        }
    }

    jsonResp(['status' => 'ok', 'received' => $received, 'ts' => date('c')]);
}

/* ═══════════════════════════════════════════════════════════════════
   LATEST  –  Dashboard JS polls this to get current telemetry
   Auth:  PHP session (logged-in user)
   ═══════════════════════════════════════════════════════════════════ */
function handleLatest() {
    ensureNexusDirs();
    $telDir = nexusTelemetryDir();
    $printers = [];

    foreach (glob("$telDir/*.json") as $f) {
        $base = basename($f, '.json');
        if ($base === 'manifest') continue;

        $data = json_decode(file_get_contents($f), true);
        if (!$data) continue;

        // Freshness indicator (seconds since last bridge push)
        $age = time() - ($data['_bridge_ts'] ?? 0);
        $data['_age'] = $age;

        // If stale (>60s), mark offline
        if ($age > 60) {
            $data['online'] = false;
            $data['state'] = 'offline';
        }

        // Clean stale print data if state is not actively printing or paused
        $st = strtolower($data['state'] ?? 'ready');
        if ($st !== 'printing' && $st !== 'paused') {
            $data['progress'] = 0.0;
            $data['currentLayer'] = 0;
            $data['totalLayer'] = 0;
            $data['filename'] = 'None (Standby)';
            $data['elapsedSeconds'] = 0;
            $data['totalDurationSeconds'] = 0;
            $data['filamentUsedMm'] = 0.0;
        }

        // Attach snapshot URL if file exists
        $snapFile = "$telDir/{$base}_snap.jpg";
        if (file_exists($snapFile)) {
            $data['snapshot_url'] = 'index.php?route=api&action=snapshot&printer='
                . urlencode($base) . '&t=' . filemtime($snapFile);
        }

        $printers[$base] = $data;
    }

    header('Access-Control-Allow-Origin: *');
    header('Cache-Control: no-cache, no-store, must-revalidate');
    jsonResp(['status' => 'ok', 'printers' => $printers, 'server_time' => date('c')]);
}

/* ═══════════════════════════════════════════════════════════════════
   SNAPSHOT  –  Serves the latest webcam JPEG for a printer
   Accessible to dashboard <img> tags without session block
   ═══════════════════════════════════════════════════════════════════ */
function handleSnapshot() {
    $id = preg_replace('/[^a-zA-Z0-9_-]/', '', $_GET['printer'] ?? '');
    if (!$id) { http_response_code(400); exit; }

    ensureNexusDirs();
    $file = nexusTelemetryDir() . "/{$id}_snap.jpg";

    if (!file_exists($file)) {
        http_response_code(404);
        header('Access-Control-Allow-Origin: *');
        echo 'No snapshot available';
        exit;
    }

    header('Access-Control-Allow-Origin: *');
    header('Content-Type: image/jpeg');
    header('Cache-Control: no-cache, no-store, must-revalidate');
    header('Content-Length: ' . filesize($file));
    readfile($file);
    exit;
}

/* ═══════════════════════════════════════════════════════════════════
   CLEAR_CACHE  –  Removes stale telemetry cache on print end/cancel
   ═══════════════════════════════════════════════════════════════════ */
function handleClearCache() {
    ensureNexusDirs();
    $telDir = nexusTelemetryDir();
    $cleared = 0;
    foreach (glob("$telDir/*.json") as $f) {
        if (basename($f) !== 'manifest.json') {
            $data = json_decode(file_get_contents($f), true);
            if ($data) {
                $data['state'] = 'ready';
                $data['filename'] = 'None (Standby)';
                $data['currentLayer'] = 0;
                $data['totalLayer'] = 0;
                $data['progress'] = 0.0;
                $data['elapsedSeconds'] = 0;
                $data['totalDurationSeconds'] = 0;
                $data['filamentUsedMm'] = 0.0;
                file_put_contents($f, json_encode($data));
                $cleared++;
            }
        }
    }
    header('Access-Control-Allow-Origin: *');
    jsonResp(['status' => 'ok', 'cleared' => $cleared, 'ts' => date('c')]);
}

/* ═══════════════════════════════════════════════════════════════════
   PRINTERS  –  Registered printer manifest CRUD
   Auth:  PHP session
   ═══════════════════════════════════════════════════════════════════ */
function handlePrinters() {
    requireSession();
    ensureNexusDirs();
    $manifest = nexusTelemetryDir() . '/manifest.json';

    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $data = file_exists($manifest) ? json_decode(file_get_contents($manifest), true) : [];
        jsonResp(['status' => 'ok', 'printers' => $data ?: []]);
    } elseif ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $body = json_decode(file_get_contents('php://input'), true);
        if (!$body || !isset($body['printers'])) {
            jsonResp(['error' => 'Invalid payload'], 400);
        }
        file_put_contents($manifest, json_encode($body['printers'], JSON_PRETTY_PRINT));
        jsonResp(['status' => 'ok', 'saved' => count($body['printers'])]);
    }
}

/* ─── Utilities ─── */
function requireSession() {
    if (session_status() === PHP_SESSION_NONE) {
        session_name('STYXKEY_nexus_session');
        session_start([
            'cookie_httponly' => true,
            'cookie_samesite' => 'Lax'
        ]);
    }
    if (!empty($_SESSION['nexus_authenticated'])) {
        return;
    }
    $token = extractBearerToken();
    if ($token && $token === NEXUS_API_TOKEN) {
        return;
    }
    jsonResp(['error' => 'Not authenticated'], 403);
}

function jsonResp($data, $code = 200) {
    http_response_code($code);
    header('Content-Type: application/json');
    header('Cache-Control: no-cache, no-store, must-revalidate');
    echo json_encode($data, JSON_UNESCAPED_SLASHES);
    exit;
}

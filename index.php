<?php
/**
 * NEXUS 3D — Multi-Printer Monitoring & Telemetry Hub
 * Main Router — Auth-gated dashboard, API dispatch, session management
 */

// ─── Anti-Cache & Pantheon Edge Invalidation Headers ───
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0, post-check=0, pre-check=0');
header('Pragma: no-cache');
header('Expires: Thu, 01 Jan 1970 00:00:00 GMT');
header('Surrogate-Control: no-store'); // Tells Pantheon Varnish edge never to cache this response
header('X-Accel-Expires: 0');

// Use STYXKEY_ prefix for Pantheon Varnish session persistence
session_name('STYXKEY_nexus_session');
session_start([
    'cookie_httponly' => true,
    'cookie_samesite' => 'Lax'
]);

$route = $_GET['route'] ?? '';

// ──────────────────────── API routes ────────────────────────
if ($route === 'api') {
    require_once __DIR__ . '/private/api.php';
    handleApiRequest();
    exit;
}

// ──────────────────────── Auth handler ────────────────────────
if ($route === 'auth') {
    require_once __DIR__ . '/private/auth.php';
    exit;
}

// ──────────────────────── Logout ────────────────────────
if ($route === 'logout') {
    $_SESSION = [];
    session_destroy();
    setcookie('STYXKEY_nexus_session', '', time() - 3600, '/');
    setcookie('NO_CACHE', '', time() - 3600, '/');
    header('Location: index.php?route=login');
    exit;
}

// ──────────────────────── Login page ────────────────────────
if ($route === 'login') {
    // If user is already authenticated, redirect straight to dashboard
    if (!empty($_SESSION['nexus_authenticated'])) {
        header('Location: index.php');
        exit;
    }
    header('Content-Type: text/html; charset=UTF-8');
    readfile(__DIR__ . '/login.html');
    exit;
}

// ──────────────────────── Public health check ────────────────────────
if (isset($_GET['api']) && $_GET['api'] === 'status') {
    header('Content-Type: application/json');
    echo json_encode([
        'status'    => 'online',
        'platform'  => 'Pantheon WebOps',
        'php'       => PHP_VERSION,
        'app'       => 'NEXUS 3D v2.0 (Bridge Architecture)',
        'timestamp' => date('c')
    ]);
    exit;
}

// ──────────────────────── Protected dashboard ────────────────────────
if (empty($_SESSION['nexus_authenticated'])) {
    header('Location: index.php?route=login');
    exit;
}

// Set NO_CACHE cookie for Pantheon Edge Cache
setcookie('NO_CACHE', '1', [
    'path' => '/',
    'httponly' => true,
    'samesite' => 'Lax'
]);

// Prefer protected dashboard in /private/ (blocked from direct web access by pantheon.yml)
$dashFile = __DIR__ . '/private/dashboard.html';
if (!file_exists($dashFile)) {
    $dashFile = __DIR__ . '/dashboard.html';
}

if (file_exists($dashFile)) {
    header('Content-Type: text/html; charset=UTF-8');
    readfile($dashFile);
} else {
    http_response_code(500);
    echo '<h1>NEXUS 3D</h1><p>Dashboard template not found.</p>';
}
exit;

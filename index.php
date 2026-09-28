<?php
/**
 * NEXUS 3D — Multi-Printer Monitoring & Telemetry Hub
 * Main Router — Auth-gated dashboard, API dispatch, session management
 */

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
    session_start();
    $_SESSION = [];
    session_destroy();
    header('Location: index.php?route=login');
    exit;
}

// ──────────────────────── Login page ────────────────────────
if ($route === 'login') {
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
session_start();
if (empty($_SESSION['nexus_authenticated'])) {
    header('Location: index.php?route=login');
    exit;
}

$dashFile = __DIR__ . '/dashboard.html';
if (file_exists($dashFile)) {
    header('Content-Type: text/html; charset=UTF-8');
    readfile($dashFile);
} else {
    http_response_code(500);
    echo '<h1>NEXUS 3D</h1><p>dashboard.html not found.</p>';
}
exit;

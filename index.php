<?php
/**
 * NEXUS 3D - Multi-Printer Monitoring & Telemetry Hub
 * Pantheon Web Hosting Deployment Wrapper
 */

// If requested via API status check
if (isset($_GET['api']) && $_GET['api'] === 'status') {
    header('Content-Type: application/json');
    echo json_encode([
        'status' => 'online',
        'platform' => 'Pantheon WebOps',
        'php_version' => PHP_VERSION,
        'app' => 'NEXUS 3D Printer Monitor',
        'configured_printers' => [
            ['name' => 'Printer 01 (QIDI Klipper)', 'ip' => '192.168.1.124', 'port' => 7125],
            ['name' => 'Printer 02 (CoreXY Pro)', 'ip' => '192.168.1.36', 'port' => 7125]
        ],
        'timestamp' => date('c')
    ]);
    exit;
}

// Serve the frontend application
$htmlFile = __DIR__ . '/index.html';
if (file_exists($htmlFile)) {
    header('Content-Type: text/html; charset=UTF-8');
    readfile($htmlFile);
    exit;
} else {
    http_response_code(500);
    echo "<h1>NEXUS 3D Monitoring System</h1><p>index.html not found in application root.</p>";
    exit;
}

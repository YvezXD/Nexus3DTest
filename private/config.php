<?php
/**
 * NEXUS 3D — Configuration
 * Credentials, API tokens, and file storage paths
 */

// ─── Shared API Token (must match bridge_daemon config.env) ───
define('NEXUS_API_TOKEN', 'nxs_a7f3b9e2d1c4056789abcdef01234567');

// ─── Dashboard Login Credentials ───
define('NEXUS_USER', 'admin');
define('NEXUS_DEFAULT_PASS', 'nexus3d');

// ─── Writable Files Directory ───
function nexusFilesDir() {
    // Pantheon's writable filesystem
    if (isset($_ENV['PANTHEON_ENVIRONMENT']) || isset($_SERVER['PANTHEON_ENVIRONMENT'])) {
        $base = rtrim($_SERVER['HOME'] ?? '/srv/bindings', '/') . '/files/nexus3d';
    } else {
        // Local development fallback
        $base = __DIR__ . '/../files/nexus3d';
    }
    return $base;
}

function nexusTelemetryDir() {
    return nexusFilesDir() . '/telemetry';
}

function ensureNexusDirs() {
    $dirs = [nexusFilesDir(), nexusTelemetryDir()];
    foreach ($dirs as $d) {
        if (!is_dir($d)) {
            mkdir($d, 0755, true);
        }
    }
}

/**
 * Returns the bcrypt password hash, generating and caching it on first run.
 */
function getPasswordHash() {
    ensureNexusDirs();
    $hashFile = nexusFilesDir() . '/auth_hash.dat';
    if (file_exists($hashFile)) {
        return trim(file_get_contents($hashFile));
    }
    $hash = password_hash(NEXUS_DEFAULT_PASS, PASSWORD_BCRYPT);
    file_put_contents($hashFile, $hash);
    return $hash;
}

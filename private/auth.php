<?php
/**
 * NEXUS 3D — Authentication Handler
 * POST: validates username + password, creates session
 */
require_once __DIR__ . '/config.php';

header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Surrogate-Control: no-store');

session_name('STYXKEY_nexus_session');
session_start([
    'cookie_httponly' => true,
    'cookie_samesite' => 'Lax'
]);

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Location: index.php?route=login');
    exit;
}

$username = trim($_POST['username'] ?? '');
$password = $_POST['password'] ?? '';

$validHash = getPasswordHash();

if ($username === NEXUS_USER && password_verify($password, $validHash)) {
    $_SESSION['nexus_authenticated'] = true;
    $_SESSION['nexus_user'] = $username;
    $_SESSION['nexus_login_time'] = time();

    // Set NO_CACHE cookie for Pantheon Edge / Varnish Cache
    setcookie('NO_CACHE', '1', [
        'path' => '/',
        'httponly' => true,
        'samesite' => 'Lax'
    ]);

    header('Location: index.php');
    exit;
}

// Authentication failed
header('Location: index.php?route=login&error=1');
exit;

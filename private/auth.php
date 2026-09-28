<?php
/**
 * NEXUS 3D — Authentication Handler
 * POST: validates username + password, creates session
 */
require_once __DIR__ . '/config.php';
session_start();

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
    header('Location: index.php');
    exit;
}

// Authentication failed
header('Location: index.php?route=login&error=1');
exit;

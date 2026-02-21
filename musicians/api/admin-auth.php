<?php
// api/admin-auth.php — Admin login
require_once __DIR__ . '/db.php';

$db = getDB();
$method = $_SERVER['REQUEST_METHOD'];

if ($method !== 'POST') jsonError('Method not allowed', 405);

$input = json_decode(file_get_contents('php://input'), true);
$username = trim($input['username'] ?? '');
$password = $input['password'] ?? '';

if (!$username || !$password) {
    jsonError('Username and password are required.');
}

$stmt = $db->prepare("SELECT id, username, password_hash, full_name, role FROM admin_users WHERE username = ? AND is_active = 1");
$stmt->execute([$username]);
$admin = $stmt->fetch();

if (!$admin || !password_verify($password, $admin['password_hash'])) {
    jsonError('Invalid username or password.', 401);
}

// Simple token (in production, use JWT or session)
$token = bin2hex(random_bytes(32));

jsonResponse([
    'success' => true,
    'admin' => [
        'id' => (int)$admin['id'],
        'username' => $admin['username'],
        'full_name' => $admin['full_name'],
        'role' => $admin['role']
    ],
    'token' => $token
]);

<?php
// api/setup-admin.php — Run ONCE to create your admin user, then DELETE this file!
require_once __DIR__ . '/db.php';

$db = getDB();

$username = 'admin';
$password = 'admin123'; // CHANGE THIS after setup!
$email = 'admin@yourmarket.com';
$fullName = 'Market Admin';

$hash = password_hash($password, PASSWORD_DEFAULT);

try {
    $stmt = $db->prepare("INSERT INTO admin_users (username, password_hash, email, full_name, role, is_active) VALUES (?, ?, ?, ?, 'super_admin', 1)");
    $stmt->execute([$username, $hash, $email, $fullName]);
    echo json_encode(['success' => true, 'message' => 'Admin user created! Username: admin, Password: admin123. DELETE this file now!']);
} catch (Exception $e) {
    // Might already exist
    if (strpos($e->getMessage(), 'Duplicate') !== false) {
        echo json_encode(['message' => 'Admin user already exists.']);
    } else {
        echo json_encode(['error' => $e->getMessage()]);
    }
}

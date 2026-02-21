<?php
// api/musicians.php — Register & list musicians
require_once __DIR__ . '/db.php';

$db = getDB();
$method = $_SERVER['REQUEST_METHOD'];

// GET — list all musicians
if ($method === 'GET') {
    $stmt = $db->query("SELECT id, name, email, phone, music_genre, description, website, headshot_path, logo_path, music_snippet_path, created_at FROM musicians ORDER BY name");
    jsonResponse($stmt->fetchAll());
}

// POST — register new musician
if ($method === 'POST') {
    $name = trim($_POST['name'] ?? '');
    $email = trim($_POST['email'] ?? '');
    $phone = trim($_POST['phone'] ?? '');
    $genre = trim($_POST['music_genre'] ?? '');
    $description = trim($_POST['description'] ?? '');
    $website = trim($_POST['website'] ?? '');

    if (!$name || !$email || !$phone || !$genre) {
        jsonError('Name, email, phone, and genre are required.');
    }

    // Check for duplicate email
    $check = $db->prepare("SELECT id FROM musicians WHERE email = ?");
    $check->execute([$email]);
    if ($check->fetch()) {
        jsonError('A musician with this email is already registered.');
    }

    // Handle file uploads
    $headshotPath = null;
    $logoPath = null;
    $snippetPath = null;
    $uploadBase = UPLOAD_DIR;
    $urlBase = UPLOAD_URL;
    $timestamp = time();

    if (!empty($_FILES['headshot']['tmp_name'])) {
        $ext = strtolower(pathinfo($_FILES['headshot']['name'], PATHINFO_EXTENSION));
        $allowed = ['jpg','jpeg','png','gif','webp'];
        if (!in_array($ext, $allowed)) jsonError('Headshot must be an image (jpg, png, gif, webp).');
        if ($_FILES['headshot']['size'] > 5 * 1024 * 1024) jsonError('Headshot must be under 5MB.');
        $filename = "headshot_{$timestamp}_" . bin2hex(random_bytes(4)) . ".{$ext}";
        move_uploaded_file($_FILES['headshot']['tmp_name'], $uploadBase . $filename);
        $headshotPath = $urlBase . $filename;
    }

    if (!empty($_FILES['logo']['tmp_name'])) {
        $ext = strtolower(pathinfo($_FILES['logo']['name'], PATHINFO_EXTENSION));
        $allowed = ['jpg','jpeg','png','gif','webp','svg'];
        if (!in_array($ext, $allowed)) jsonError('Logo must be an image.');
        if ($_FILES['logo']['size'] > 5 * 1024 * 1024) jsonError('Logo must be under 5MB.');
        $filename = "logo_{$timestamp}_" . bin2hex(random_bytes(4)) . ".{$ext}";
        move_uploaded_file($_FILES['logo']['tmp_name'], $uploadBase . $filename);
        $logoPath = $urlBase . $filename;
    }

    if (!empty($_FILES['music_snippet']['tmp_name'])) {
        $ext = strtolower(pathinfo($_FILES['music_snippet']['name'], PATHINFO_EXTENSION));
        $allowed = ['mp3','wav','ogg','m4a','aac','flac'];
        if (!in_array($ext, $allowed)) jsonError('Music snippet must be an audio file (mp3, wav, ogg, m4a).');
        if ($_FILES['music_snippet']['size'] > 15 * 1024 * 1024) jsonError('Music snippet must be under 15MB.');
        $filename = "music_{$timestamp}_" . bin2hex(random_bytes(4)) . ".{$ext}";
        move_uploaded_file($_FILES['music_snippet']['tmp_name'], $uploadBase . $filename);
        $snippetPath = $urlBase . $filename;
    }

    // Insert musician
    $stmt = $db->prepare("INSERT INTO musicians (name, email, phone, music_genre, description, website, headshot_path, logo_path, music_snippet_path) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
    $stmt->execute([$name, $email, $phone, $genre, $description ?: null, $website ?: null, $headshotPath, $logoPath, $snippetPath]);
    $musicianId = $db->lastInsertId();

    jsonResponse(['success' => true, 'musician_id' => (int)$musicianId], 201);
}

jsonError('Method not allowed', 405);

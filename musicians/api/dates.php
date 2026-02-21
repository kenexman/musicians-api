<?php
// api/dates.php — Get available performance dates with booking info
require_once __DIR__ . '/db.php';

$db = getDB();
$method = $_SERVER['REQUEST_METHOD'];

if ($method !== 'GET') jsonError('Method not allowed', 405);

$marketId = $_GET['market_id'] ?? 1;

// Get all active performance dates for this market with time slots and booking counts
$stmt = $db->prepare("
    SELECT 
        pd.id AS performance_date_id,
        pd.performance_date,
        pd.is_active,
        pd.notes AS date_notes,
        ts.id AS time_slot_id,
        ts.start_time,
        ts.end_time,
        ts.slot_order,
        b.id AS booking_id,
        b.musician_id,
        b.status AS booking_status,
        m.name AS musician_name,
        m.music_genre,
        m.headshot_path
    FROM performance_dates pd
    LEFT JOIN time_slots ts ON ts.performance_date_id = pd.id
    LEFT JOIN bookings b ON b.time_slot_id = ts.id AND b.status != 'cancelled'
    LEFT JOIN musicians m ON m.id = b.musician_id
    WHERE pd.market_id = ? AND pd.is_active = 1
    ORDER BY pd.performance_date ASC, ts.slot_order ASC
");
$stmt->execute([$marketId]);
$rows = $stmt->fetchAll();

// Also get waitlist info
$wStmt = $db->prepare("
    SELECT w.time_slot_id, w.musician_id, w.position, m.name AS musician_name
    FROM waitlist w
    JOIN musicians m ON m.id = w.musician_id
    JOIN time_slots ts ON ts.id = w.time_slot_id
    JOIN performance_dates pd ON pd.id = ts.performance_date_id
    WHERE pd.market_id = ?
    ORDER BY w.position ASC
");
$wStmt->execute([$marketId]);
$waitlistRows = $wStmt->fetchAll();

// Build waitlist map: time_slot_id => [...]
$waitlistMap = [];
foreach ($waitlistRows as $wr) {
    $waitlistMap[$wr['time_slot_id']][] = $wr;
}

// Group into structured response
$dates = [];
foreach ($rows as $row) {
    $dateKey = $row['performance_date'];
    if (!isset($dates[$dateKey])) {
        $dates[$dateKey] = [
            'performance_date_id' => $row['performance_date_id'],
            'date' => $row['performance_date'],
            'is_active' => (bool)$row['is_active'],
            'notes' => $row['date_notes'],
            'time_slots' => []
        ];
    }
    if ($row['time_slot_id']) {
        $tsId = $row['time_slot_id'];
        if (!isset($dates[$dateKey]['time_slots'][$tsId])) {
            $dates[$dateKey]['time_slots'][$tsId] = [
                'time_slot_id' => (int)$tsId,
                'start_time' => $row['start_time'],
                'end_time' => $row['end_time'],
                'slot_order' => (int)$row['slot_order'],
                'booking' => null,
                'waitlist' => $waitlistMap[$tsId] ?? []
            ];
        }
        if ($row['booking_id']) {
            $dates[$dateKey]['time_slots'][$tsId]['booking'] = [
                'booking_id' => (int)$row['booking_id'],
                'musician_id' => (int)$row['musician_id'],
                'musician_name' => $row['musician_name'],
                'genre' => $row['music_genre'],
                'headshot' => $row['headshot_path'],
                'status' => $row['booking_status']
            ];
        }
    }
}

// Convert to indexed arrays
$result = [];
foreach ($dates as $d) {
    $d['time_slots'] = array_values($d['time_slots']);
    $result[] = $d;
}

jsonResponse($result);

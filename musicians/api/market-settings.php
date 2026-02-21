<?php
// api/market-settings.php — Get/update market config + generate dates
require_once __DIR__ . '/db.php';

$db = getDB();
$method = $_SERVER['REQUEST_METHOD'];
$marketId = $_GET['market_id'] ?? $_POST['market_id'] ?? 1;

// GET — fetch market settings
if ($method === 'GET') {
    $stmt = $db->prepare("SELECT * FROM markets WHERE id = ?");
    $stmt->execute([$marketId]);
    $market = $stmt->fetch();
    if (!$market) jsonError('Market not found.', 404);

    // Get schedule days
    $days = $db->prepare("SELECT day_of_week FROM market_schedule_days WHERE market_id = ? ORDER BY day_of_week");
    $days->execute([$marketId]);
    $market['schedule_days'] = array_column($days->fetchAll(), 'day_of_week');

    // Get custom dates
    $custom = $db->prepare("SELECT id, custom_date, start_time, end_time, max_slots, notes FROM custom_market_dates WHERE market_id = ? ORDER BY custom_date");
    $custom->execute([$marketId]);
    $market['custom_dates'] = $custom->fetchAll();

    // Get excluded dates
    $excluded = $db->prepare("SELECT id, excluded_date, reason FROM excluded_market_dates WHERE market_id = ? ORDER BY excluded_date");
    $excluded->execute([$marketId]);
    $market['excluded_dates'] = $excluded->fetchAll();

    jsonResponse($market);
}

// PUT — update market settings
if ($method === 'PUT') {
    $input = json_decode(file_get_contents('php://input'), true);

    $db->beginTransaction();
    try {
        // Update main market fields
        $stmt = $db->prepare("
            UPDATE markets SET
                name = COALESCE(?, name),
                location = COALESCE(?, location),
                start_time = COALESCE(?, start_time),
                end_time = COALESCE(?, end_time),
                season_start_date = COALESCE(?, season_start_date),
                season_end_date = COALESCE(?, season_end_date),
                slots_per_day = COALESCE(?, slots_per_day),
                stipend_amount = COALESCE(?, stipend_amount),
                contact_email = COALESCE(?, contact_email),
                contact_phone = COALESCE(?, contact_phone)
            WHERE id = ?
        ");
        $stmt->execute([
            $input['name'] ?? null,
            $input['location'] ?? null,
            $input['start_time'] ?? null,
            $input['end_time'] ?? null,
            $input['season_start_date'] ?? null,
            $input['season_end_date'] ?? null,
            $input['slots_per_day'] ?? null,
            $input['stipend_amount'] ?? null,
            $input['contact_email'] ?? null,
            $input['contact_phone'] ?? null,
            $marketId
        ]);

        // Update schedule days if provided
        if (isset($input['schedule_days']) && is_array($input['schedule_days'])) {
            $db->prepare("DELETE FROM market_schedule_days WHERE market_id = ?")->execute([$marketId]);
            $ins = $db->prepare("INSERT INTO market_schedule_days (market_id, day_of_week) VALUES (?, ?)");
            foreach ($input['schedule_days'] as $day) {
                $ins->execute([$marketId, (int)$day]);
            }
        }

        $db->commit();
        jsonResponse(['success' => true]);
    } catch (Exception $e) {
        $db->rollBack();
        jsonError('Update failed: ' . $e->getMessage(), 500);
    }
}

// POST — special actions (generate dates, add custom/excluded dates)
if ($method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $action = $input['action'] ?? '';

    // Generate performance dates and time slots for the season
    if ($action === 'generate_dates') {
        $db->beginTransaction();
        try {
            // Get market config
            $stmt = $db->prepare("SELECT * FROM markets WHERE id = ?");
            $stmt->execute([$marketId]);
            $market = $stmt->fetch();
            if (!$market) jsonError('Market not found.', 404);

            $days = $db->prepare("SELECT day_of_week FROM market_schedule_days WHERE market_id = ?");
            $days->execute([$marketId]);
            $scheduleDays = array_column($days->fetchAll(), 'day_of_week');

            $excluded = $db->prepare("SELECT excluded_date FROM excluded_market_dates WHERE market_id = ?");
            $excluded->execute([$marketId]);
            $excludedDates = array_column($excluded->fetchAll(), 'excluded_date');

            $custom = $db->prepare("SELECT * FROM custom_market_dates WHERE market_id = ?");
            $custom->execute([$marketId]);
            $customDates = $custom->fetchAll();

            $startDate = $market['season_start_date'];
            $endDate = $market['season_end_date'];
            $slotsPerDay = (int)($market['slots_per_day'] ?? 2);

            if (!$startDate || !$endDate) jsonError('Season start/end dates must be set.');

            // Collect all dates to create
            $datesToCreate = [];
            $current = new DateTime($startDate);
            $end = new DateTime($endDate);

            while ($current <= $end) {
                $dow = (int)$current->format('w');
                $dateStr = $current->format('Y-m-d');
                if (in_array($dow, $scheduleDays) && !in_array($dateStr, $excludedDates)) {
                    $datesToCreate[$dateStr] = [
                        'start_time' => $market['start_time'],
                        'end_time' => $market['end_time'],
                        'slots' => $slotsPerDay
                    ];
                }
                $current->modify('+1 day');
            }

            // Add custom dates
            foreach ($customDates as $cd) {
                if (!in_array($cd['custom_date'], $excludedDates)) {
                    $datesToCreate[$cd['custom_date']] = [
                        'start_time' => $cd['start_time'] ?? $market['start_time'],
                        'end_time' => $cd['end_time'] ?? $market['end_time'],
                        'slots' => $cd['max_slots'] ?? $slotsPerDay
                    ];
                }
            }

            ksort($datesToCreate);

            // Get existing performance dates to avoid duplicates
            $existingStmt = $db->prepare("SELECT id, performance_date FROM performance_dates WHERE market_id = ?");
            $existingStmt->execute([$marketId]);
            $existingMap = [];
            foreach ($existingStmt->fetchAll() as $e) {
                $existingMap[$e['performance_date']] = $e['id'];
            }

            $created = 0;
            $skipped = 0;

            $insertDate = $db->prepare("INSERT INTO performance_dates (market_id, performance_date, is_active) VALUES (?, ?, 1)");
            $insertSlot = $db->prepare("INSERT INTO time_slots (performance_date_id, start_time, end_time, slot_order) VALUES (?, ?, ?, ?)");

            foreach ($datesToCreate as $dateStr => $info) {
                if (isset($existingMap[$dateStr])) {
                    // Date exists — check if it has the right number of slots
                    $pdId = $existingMap[$dateStr];
                    $slotCount = $db->prepare("SELECT COUNT(*) AS cnt FROM time_slots WHERE performance_date_id = ?");
                    $slotCount->execute([$pdId]);
                    $cnt = (int)$slotCount->fetch()['cnt'];

                    // Add missing slots if needed
                    if ($cnt < $info['slots']) {
                        $totalMinutes = (strtotime($info['end_time']) - strtotime($info['start_time'])) / 60;
                        $slotDuration = floor($totalMinutes / $info['slots']);
                        for ($i = $cnt; $i < $info['slots']; $i++) {
                            $slotStart = date('H:i:s', strtotime($info['start_time']) + ($i * $slotDuration * 60));
                            $slotEnd = date('H:i:s', strtotime($info['start_time']) + (($i + 1) * $slotDuration * 60));
                            $insertSlot->execute([$pdId, $slotStart, $slotEnd, $i + 1]);
                        }
                    }
                    $skipped++;
                } else {
                    // Create new date + slots
                    $insertDate->execute([$marketId, $dateStr]);
                    $pdId = $db->lastInsertId();

                    $totalMinutes = (strtotime($info['end_time']) - strtotime($info['start_time'])) / 60;
                    $slotDuration = floor($totalMinutes / $info['slots']);

                    for ($i = 0; $i < $info['slots']; $i++) {
                        $slotStart = date('H:i:s', strtotime($info['start_time']) + ($i * $slotDuration * 60));
                        $slotEnd = date('H:i:s', strtotime($info['start_time']) + (($i + 1) * $slotDuration * 60));
                        $insertSlot->execute([$pdId, $slotStart, $slotEnd, $i + 1]);
                    }
                    $created++;
                }
            }

            $db->commit();
            jsonResponse([
                'success' => true,
                'dates_created' => $created,
                'dates_existing' => $skipped,
                'total_dates' => count($datesToCreate)
            ]);
        } catch (Exception $e) {
            $db->rollBack();
            jsonError('Generate failed: ' . $e->getMessage(), 500);
        }
    }

    // Add custom date
    if ($action === 'add_custom_date') {
        $date = $input['custom_date'] ?? null;
        if (!$date) jsonError('custom_date is required.');
        $stmt = $db->prepare("INSERT IGNORE INTO custom_market_dates (market_id, custom_date, start_time, end_time, max_slots, notes) VALUES (?, ?, ?, ?, ?, ?)");
        $stmt->execute([$marketId, $date, $input['start_time'] ?? null, $input['end_time'] ?? null, $input['max_slots'] ?? null, $input['notes'] ?? null]);
        jsonResponse(['success' => true, 'id' => (int)$db->lastInsertId()]);
    }

    // Remove custom date
    if ($action === 'remove_custom_date') {
        $id = $input['id'] ?? null;
        if (!$id) jsonError('id is required.');
        $db->prepare("DELETE FROM custom_market_dates WHERE id = ? AND market_id = ?")->execute([$id, $marketId]);
        jsonResponse(['success' => true]);
    }

    // Add excluded date
    if ($action === 'add_excluded_date') {
        $date = $input['excluded_date'] ?? null;
        if (!$date) jsonError('excluded_date is required.');
        $stmt = $db->prepare("INSERT IGNORE INTO excluded_market_dates (market_id, excluded_date, reason) VALUES (?, ?, ?)");
        $stmt->execute([$marketId, $date, $input['reason'] ?? null]);
        jsonResponse(['success' => true, 'id' => (int)$db->lastInsertId()]);
    }

    // Remove excluded date
    if ($action === 'remove_excluded_date') {
        $id = $input['id'] ?? null;
        if (!$id) jsonError('id is required.');
        $db->prepare("DELETE FROM excluded_market_dates WHERE id = ? AND market_id = ?")->execute([$id, $marketId]);
        jsonResponse(['success' => true]);
    }

    jsonError('Unknown action.');
}

jsonError('Method not allowed', 405);

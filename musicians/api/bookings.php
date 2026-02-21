<?php
// api/bookings.php — Create, list, cancel bookings + waitlist
require_once __DIR__ . '/db.php';

$db = getDB();
$method = $_SERVER['REQUEST_METHOD'];

// GET — list bookings (optionally filter by musician_id or date)
if ($method === 'GET') {
    $musicianId = $_GET['musician_id'] ?? null;
    $marketId = $_GET['market_id'] ?? 1;

    $sql = "
        SELECT 
            b.id, b.time_slot_id, b.musician_id, b.status, b.booking_date, b.notes,
            b.stipend_paid, b.stipend_paid_date,
            ts.start_time, ts.end_time,
            pd.performance_date,
            m.name AS musician_name, m.email, m.phone, m.music_genre,
            m.headshot_path, m.logo_path, m.music_snippet_path, m.website
        FROM bookings b
        JOIN time_slots ts ON ts.id = b.time_slot_id
        JOIN performance_dates pd ON pd.id = ts.performance_date_id
        JOIN musicians m ON m.id = b.musician_id
        WHERE pd.market_id = ?
    ";
    $params = [$marketId];

    if ($musicianId) {
        $sql .= " AND b.musician_id = ?";
        $params[] = $musicianId;
    }
    $sql .= " ORDER BY pd.performance_date ASC, ts.slot_order ASC";

    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    jsonResponse($stmt->fetchAll());
}

// POST — create booking(s) for a musician
if ($method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $musicianId = $input['musician_id'] ?? null;
    $timeSlotIds = $input['time_slot_ids'] ?? [];
    $joinWaitlist = $input['join_waitlist'] ?? false;

    if (!$musicianId || empty($timeSlotIds)) {
        jsonError('musician_id and time_slot_ids are required.');
    }

    // Verify musician exists
    $check = $db->prepare("SELECT id FROM musicians WHERE id = ?");
    $check->execute([$musicianId]);
    if (!$check->fetch()) jsonError('Musician not found.', 404);

    $results = [];
    $db->beginTransaction();

    try {
        foreach ($timeSlotIds as $tsId) {
            // Check if slot is already booked
            $existing = $db->prepare("SELECT id FROM bookings WHERE time_slot_id = ? AND status != 'cancelled'");
            $existing->execute([$tsId]);

            if ($existing->fetch()) {
                // Slot is taken
                if ($joinWaitlist) {
                    // Check if already on waitlist
                    $wCheck = $db->prepare("SELECT id FROM waitlist WHERE time_slot_id = ? AND musician_id = ?");
                    $wCheck->execute([$tsId, $musicianId]);
                    if (!$wCheck->fetch()) {
                        // Get next position
                        $posStmt = $db->prepare("SELECT COALESCE(MAX(position), 0) + 1 AS next_pos FROM waitlist WHERE time_slot_id = ?");
                        $posStmt->execute([$tsId]);
                        $nextPos = $posStmt->fetch()['next_pos'];

                        $ins = $db->prepare("INSERT INTO waitlist (time_slot_id, musician_id, position) VALUES (?, ?, ?)");
                        $ins->execute([$tsId, $musicianId, $nextPos]);
                        $results[] = ['time_slot_id' => (int)$tsId, 'status' => 'waitlisted', 'position' => (int)$nextPos];
                    } else {
                        $results[] = ['time_slot_id' => (int)$tsId, 'status' => 'already_waitlisted'];
                    }
                } else {
                    $results[] = ['time_slot_id' => (int)$tsId, 'status' => 'full'];
                }
            } else {
                // Slot is open — book it
                // Check musician doesn't already have a booking for this slot
                $dupCheck = $db->prepare("SELECT id FROM bookings WHERE time_slot_id = ? AND musician_id = ? AND status != 'cancelled'");
                $dupCheck->execute([$tsId, $musicianId]);
                if ($dupCheck->fetch()) {
                    $results[] = ['time_slot_id' => (int)$tsId, 'status' => 'already_booked'];
                    continue;
                }

                $ins = $db->prepare("INSERT INTO bookings (time_slot_id, musician_id, status, booking_date) VALUES (?, ?, 'confirmed', NOW())");
                $ins->execute([$tsId, $musicianId]);
                $results[] = ['time_slot_id' => (int)$tsId, 'status' => 'confirmed', 'booking_id' => (int)$db->lastInsertId()];
            }
        }
        $db->commit();
    } catch (Exception $e) {
        $db->rollBack();
        jsonError('Booking failed: ' . $e->getMessage(), 500);
    }

    jsonResponse(['success' => true, 'results' => $results], 201);
}

// DELETE — cancel a booking (promotes waitlist)
if ($method === 'DELETE') {
    $input = json_decode(file_get_contents('php://input'), true);
    $bookingId = $input['booking_id'] ?? null;

    if (!$bookingId) jsonError('booking_id is required.');

    $db->beginTransaction();
    try {
        // Get the booking
        $stmt = $db->prepare("SELECT id, time_slot_id, musician_id FROM bookings WHERE id = ? AND status = 'confirmed'");
        $stmt->execute([$bookingId]);
        $booking = $stmt->fetch();
        if (!$booking) jsonError('Booking not found or already cancelled.', 404);

        // Cancel it
        $cancel = $db->prepare("UPDATE bookings SET status = 'cancelled', cancelled_at = NOW(), cancellation_reason = ? WHERE id = ?");
        $cancel->execute([$input['reason'] ?? 'Admin cancelled', $bookingId]);

        $promoted = null;
        // Promote first person on waitlist
        $wStmt = $db->prepare("SELECT id, musician_id FROM waitlist WHERE time_slot_id = ? ORDER BY position ASC LIMIT 1");
        $wStmt->execute([$booking['time_slot_id']]);
        $nextInLine = $wStmt->fetch();

        if ($nextInLine) {
            // Create booking for them
            $ins = $db->prepare("INSERT INTO bookings (time_slot_id, musician_id, status, booking_date, notes) VALUES (?, ?, 'confirmed', NOW(), 'Promoted from waitlist')");
            $ins->execute([$booking['time_slot_id'], $nextInLine['musician_id']]);

            // Remove from waitlist
            $del = $db->prepare("DELETE FROM waitlist WHERE id = ?");
            $del->execute([$nextInLine['id']]);

            // Get musician info for email notification
            $mStmt = $db->prepare("SELECT name, email FROM musicians WHERE id = ?");
            $mStmt->execute([$nextInLine['musician_id']]);
            $promoted = $mStmt->fetch();
            $promoted['musician_id'] = $nextInLine['musician_id'];
        }

        $db->commit();
        jsonResponse([
            'success' => true,
            'cancelled_booking_id' => (int)$bookingId,
            'promoted_musician' => $promoted
        ]);
    } catch (Exception $e) {
        $db->rollBack();
        jsonError('Cancel failed: ' . $e->getMessage(), 500);
    }
}

jsonError('Method not allowed', 405);

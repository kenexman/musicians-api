// Enhanced Backend API Server with File Uploads and Flexible Scheduling
// server.js

const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const cors = require('cors');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads')); // Serve uploaded files

// Create uploads directory if it doesn't exist
const uploadsDir = './uploads';
['music', 'logos', 'headshots'].forEach(async (dir) => {
    try {
        await fs.mkdir(path.join(uploadsDir, dir), { recursive: true });
    } catch (err) {
        console.error(`Error creating directory ${dir}:`, err);
    }
});

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        let subdir = 'other';
        if (file.fieldname === 'music_sample') subdir = 'music';
        if (file.fieldname === 'logo') subdir = 'logos';
        if (file.fieldname === 'headshot') subdir = 'headshots';
        cb(null, path.join(uploadsDir, subdir));
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const fileFilter = (req, file, cb) => {
    if (file.fieldname === 'music_sample') {
        // Accept audio files
        if (file.mimetype.startsWith('audio/')) {
            cb(null, true);
        } else {
            cb(new Error('Only audio files are allowed for music samples!'), false);
        }
    } else if (file.fieldname === 'logo' || file.fieldname === 'headshot') {
        // Accept image files
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed!'), false);
        }
    } else {
        cb(null, true);
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    }
});

// Database connection pool
const pool = mysql.createPool({
    host: 'localhost', // or your MySQL host
    user: 'u760255612_musicians',
    password: 'ngna&wXrb%AuNKI7',
    database: 'u760255612_musicians',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Test database connection
pool.getConnection()
    .then(connection => {
        console.log('✅ Connected to MySQL database');
        connection.release();
    })
    .catch(err => {
        console.error('❌ Database connection failed:', err);
    });

// ==================== HELPER FUNCTIONS ====================

// Generate dates based on flexible market schedule
function generateMarketDates(year, market) {
    const dates = [];
    const daysOfWeek = JSON.parse(market.custom_days || '[6]'); // Default to Saturday
    
    let startMonth = 0;
    let endMonth = 11;
    
    if (!market.year_round) {
        const months = JSON.parse(market.custom_months || '[5,6,7,8,9,10]');
        startMonth = Math.min(...months) - 1;
        endMonth = Math.max(...months) - 1;
    }
    
    for (let month = startMonth; month <= endMonth; month++) {
        const date = new Date(year, month, 1);
        while (date.getMonth() === month) {
            if (daysOfWeek.includes(date.getDay())) {
                dates.push(new Date(date));
            }
            date.setDate(date.getDate() + 1);
        }
    }
    
    return dates;
}

// Send email notification
async function sendEmail(to, subject, message, type = 'other') {
    try {
        await pool.execute(
            'INSERT INTO email_log (recipient_email, subject, message, email_type, status) VALUES (?, ?, ?, ?, ?)',
            [to, subject, message, type, 'sent']
        );
        console.log(`📧 Email sent to ${to}: ${subject}`);
        return true;
    } catch (error) {
        console.error('Email send failed:', error);
        await pool.execute(
            'INSERT INTO email_log (recipient_email, subject, message, email_type, status, error_message) VALUES (?, ?, ?, ?, ?, ?)',
            [to, subject, message, type, 'failed', error.message]
        );
        return false;
    }
}

// ==================== FILE UPLOAD ENDPOINTS ====================

// Upload musician files (music sample, logo, headshot)
app.post('/api/musicians/:id/upload', upload.fields([
    { name: 'music_sample', maxCount: 1 },
    { name: 'logo', maxCount: 1 },
    { name: 'headshot', maxCount: 1 }
]), async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        
        const musicianId = req.params.id;
        const files = req.files;
        const uploadedFiles = [];
        
        // Check if musician exists
        const [musicians] = await connection.execute(
            'SELECT id FROM musicians WHERE id = ?',
            [musicianId]
        );
        
        if (musicians.length === 0) {
            return res.status(404).json({ success: false, error: 'Musician not found' });
        }
        
        // Process each uploaded file
        for (const [fieldname, fileArray] of Object.entries(files)) {
            if (fileArray && fileArray.length > 0) {
                const file = fileArray[0];
                const fileType = fieldname; // 'music_sample', 'logo', or 'headshot'
                const fileUrl = `/uploads/${file.filename}`;
                
                // Store file metadata in database
                await connection.execute(
                    'INSERT INTO file_uploads (musician_id, file_type, original_filename, stored_filename, file_path, file_size, mime_type) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [musicianId, fileType, file.originalname, file.filename, file.path, file.size, file.mimetype]
                );
                
                // Update musician record with file URL
                const columnMap = {
                    'music_sample': 'music_sample_url',
                    'logo': 'logo_url',
                    'headshot': 'headshot_url'
                };
                
                const filenameColumnMap = {
                    'music_sample': 'music_sample_filename',
                    'logo': 'logo_filename',
                    'headshot': 'headshot_filename'
                };
                
                await connection.execute(
                    `UPDATE musicians SET ${columnMap[fileType]} = ?, ${filenameColumnMap[fileType]} = ? WHERE id = ?`,
                    [fileUrl, file.filename, musicianId]
                );
                
                uploadedFiles.push({
                    type: fileType,
                    url: fileUrl,
                    filename: file.filename,
                    size: file.size
                });
            }
        }
        
        await connection.commit();
        res.json({ success: true, files: uploadedFiles });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ success: false, error: error.message });
    } finally {
        connection.release();
    }
});

// Get musician files
app.get('/api/musicians/:id/files', async (req, res) => {
    try {
        const [files] = await pool.execute(
            'SELECT * FROM file_uploads WHERE musician_id = ? ORDER BY uploaded_at DESC',
            [req.params.id]
        );
        res.json({ success: true, files });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Delete musician file
app.delete('/api/musicians/:id/files/:fileId', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        
        // Get file info
        const [files] = await connection.execute(
            'SELECT * FROM file_uploads WHERE id = ? AND musician_id = ?',
            [req.params.fileId, req.params.id]
        );
        
        if (files.length === 0) {
            return res.status(404).json({ success: false, error: 'File not found' });
        }
        
        const file = files[0];
        
        // Delete physical file
        try {
            await fs.unlink(file.file_path);
        } catch (err) {
            console.error('Error deleting file:', err);
        }
        
        // Delete from database
        await connection.execute(
            'DELETE FROM file_uploads WHERE id = ?',
            [req.params.fileId]
        );
        
        // Update musician record
        const columnMap = {
            'music_sample': 'music_sample_url',
            'logo': 'logo_url',
            'headshot': 'headshot_url'
        };
        
        await connection.execute(
            `UPDATE musicians SET ${columnMap[file.file_type]} = NULL WHERE id = ?`,
            [req.params.id]
        );
        
        await connection.commit();
        res.json({ success: true });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ success: false, error: error.message });
    } finally {
        connection.release();
    }
});

// ==================== MARKET SCHEDULE MANAGEMENT ====================

// Get market time slot templates
app.get('/api/markets/:id/time-slots', async (req, res) => {
    try {
        const [slots] = await pool.execute(
            'SELECT * FROM market_time_slots_template WHERE market_id = ? AND is_active = TRUE ORDER BY slot_order',
            [req.params.id]
        );
        res.json({ success: true, slots });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Create/update market time slot template
app.post('/api/markets/:id/time-slots', async (req, res) => {
    try {
        const { start_time, end_time, slot_name, slot_order } = req.body;
        
        const [result] = await pool.execute(
            'INSERT INTO market_time_slots_template (market_id, start_time, end_time, slot_name, slot_order) VALUES (?, ?, ?, ?, ?)',
            [req.params.id, start_time, end_time, slot_name, slot_order]
        );
        
        res.json({ success: true, slot_id: result.insertId });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update market time slot template
app.put('/api/markets/:id/time-slots/:slotId', async (req, res) => {
    try {
        const { start_time, end_time, slot_name, slot_order, is_active } = req.body;
        
        await pool.execute(
            'UPDATE market_time_slots_template SET start_time = ?, end_time = ?, slot_name = ?, slot_order = ?, is_active = ? WHERE id = ? AND market_id = ?',
            [start_time, end_time, slot_name, slot_order, is_active, req.params.slotId, req.params.id]
        );
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Delete market time slot template
app.delete('/api/markets/:id/time-slots/:slotId', async (req, res) => {
    try {
        await pool.execute(
            'DELETE FROM market_time_slots_template WHERE id = ? AND market_id = ?',
            [req.params.slotId, req.params.id]
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update market schedule settings
app.put('/api/markets/:id/schedule', async (req, res) => {
    try {
        const { custom_days, custom_months, year_round, season_start_month, season_end_month } = req.body;
        
        // Convert arrays to JSON strings
        const daysJson = JSON.stringify(custom_days);
        const monthsJson = custom_months ? JSON.stringify(custom_months) : null;
        
        await pool.execute(
            'UPDATE markets SET custom_days = ?, custom_months = ?, year_round = ?, season_start_month = ?, season_end_month = ? WHERE id = ?',
            [daysJson, monthsJson, year_round, season_start_month, season_end_month, req.params.id]
        );
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Initialize dates using flexible schedule
app.post('/api/markets/:id/initialize-season', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const marketId = req.params.id;
        const { year } = req.body;

        // Get market details with schedule
        const [markets] = await connection.execute(
            'SELECT * FROM markets WHERE id = ?',
            [marketId]
        );
        if (markets.length === 0) {
            throw new Error('Market not found');
        }
        const market = markets[0];

        // Get time slot templates
        const [templates] = await connection.execute(
            'SELECT * FROM market_time_slots_template WHERE market_id = ? AND is_active = TRUE ORDER BY slot_order',
            [marketId]
        );
        
        if (templates.length === 0) {
            throw new Error('No time slot templates defined for this market. Please add time slots first.');
        }

        // Generate dates based on market schedule
        const dates = generateMarketDates(year || new Date().getFullYear(), market);

        // Insert performance dates and slots
        for (const date of dates) {
            const dateStr = date.toISOString().split('T')[0];
            
            // Insert performance date
            const [dateResult] = await connection.execute(
                'INSERT IGNORE INTO performance_dates (market_id, performance_date) VALUES (?, ?)',
                [marketId, dateStr]
            );

            // Get the performance_date_id
            const [dateRows] = await connection.execute(
                'SELECT id FROM performance_dates WHERE market_id = ? AND performance_date = ?',
                [marketId, dateStr]
            );
            const performanceDateId = dateRows[0].id;

            // Insert time slots based on templates
            for (const template of templates) {
                await connection.execute(
                    'INSERT IGNORE INTO time_slots (performance_date_id, start_time, end_time, slot_order) VALUES (?, ?, ?, ?)',
                    [performanceDateId, template.start_time, template.end_time, template.slot_order]
                );
            }
        }

        await connection.commit();
        res.json({ 
            success: true, 
            message: `Initialized ${dates.length} dates with ${templates.length} time slots each`,
            dates_created: dates.length,
            slots_per_date: templates.length
        });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ success: false, error: error.message });
    } finally {
        connection.release();
    }
});

// ==================== EXISTING ENDPOINTS (with file URLs included) ====================

// Get all active markets
app.get('/api/markets', async (req, res) => {
    try {
        const [markets] = await pool.execute(
            'SELECT * FROM markets WHERE is_active = TRUE ORDER BY name'
        );
        res.json({ success: true, markets });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get market by ID
app.get('/api/markets/:id', async (req, res) => {
    try {
        const [markets] = await pool.execute(
            'SELECT * FROM markets WHERE id = ?',
            [req.params.id]
        );
        if (markets.length === 0) {
            return res.status(404).json({ success: false, error: 'Market not found' });
        }
        res.json({ success: true, market: markets[0] });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get all available dates and slots for a market (with musician files)
app.get('/api/markets/:id/schedule', async (req, res) => {
    try {
        const marketId = req.params.id;
        
        const [rows] = await pool.execute(`
            SELECT 
                pd.id as date_id,
                pd.performance_date,
                ts.id as slot_id,
                ts.start_time,
                ts.end_time,
                ts.slot_order,
                b.id as booking_id,
                b.status as booking_status,
                m.id as musician_id,
                m.name as musician_name,
                m.email as musician_email,
                m.music_genre,
                m.logo_url,
                m.headshot_url,
                m.music_sample_url,
                (SELECT COUNT(*) FROM waitlist w WHERE w.time_slot_id = ts.id) as waitlist_count
            FROM performance_dates pd
            LEFT JOIN time_slots ts ON pd.id = ts.performance_date_id
            LEFT JOIN bookings b ON ts.id = b.time_slot_id AND b.status = 'confirmed'
            LEFT JOIN musicians m ON b.musician_id = m.id
            WHERE pd.market_id = ? AND pd.is_active = TRUE
            ORDER BY pd.performance_date, ts.slot_order
        `, [marketId]);

        // Group by date
        const schedule = {};
        rows.forEach(row => {
            const dateKey = row.performance_date.toISOString().split('T')[0];
            if (!schedule[dateKey]) {
                schedule[dateKey] = {
                    date_id: row.date_id,
                    date: dateKey,
                    slots: []
                };
            }
            schedule[dateKey].slots.push({
                slot_id: row.slot_id,
                start_time: row.start_time,
                end_time: row.end_time,
                slot_order: row.slot_order,
                is_available: !row.booking_id,
                booking: row.booking_id ? {
                    booking_id: row.booking_id,
                    musician_id: row.musician_id,
                    musician_name: row.musician_name,
                    musician_email: row.musician_email,
                    music_genre: row.music_genre,
                    logo_url: row.logo_url,
                    headshot_url: row.headshot_url,
                    music_sample_url: row.music_sample_url,
                    status: row.booking_status
                } : null,
                waitlist_count: row.waitlist_count
            });
        });

        res.json({ success: true, schedule: Object.values(schedule) });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Register a new musician and book slots
app.post('/api/musicians/register', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const { name, email, phone, music_genre, description, selected_slots, join_waitlist } = req.body;

        // Check if musician already exists
        let [existingMusicians] = await connection.execute(
            'SELECT id FROM musicians WHERE email = ?',
            [email]
        );

        let musicianId;
        if (existingMusicians.length > 0) {
            musicianId = existingMusicians[0].id;
            // Update musician info
            await connection.execute(
                'UPDATE musicians SET name = ?, phone = ?, music_genre = ?, description = ? WHERE id = ?',
                [name, phone, music_genre, description, musicianId]
            );
        } else {
            // Insert new musician
            const [result] = await connection.execute(
                'INSERT INTO musicians (name, email, phone, music_genre, description) VALUES (?, ?, ?, ?, ?)',
                [name, email, phone, music_genre, description]
            );
            musicianId = result.insertId;
        }

        let bookedCount = 0;
        let waitlistCount = 0;
        const bookingDetails = [];

        // Process each selected slot
        for (const slotId of selected_slots) {
            // Check if slot is already booked
            const [existingBookings] = await connection.execute(
                'SELECT id FROM bookings WHERE time_slot_id = ? AND status = "confirmed"',
                [slotId]
            );

            if (existingBookings.length === 0) {
                // Book the slot
                await connection.execute(
                    'INSERT INTO bookings (time_slot_id, musician_id, status) VALUES (?, ?, "confirmed")',
                    [slotId, musicianId]
                );
                bookedCount++;

                // Get slot details for confirmation
                const [slotDetails] = await connection.execute(`
                    SELECT ts.start_time, ts.end_time, pd.performance_date, m.name as market_name
                    FROM time_slots ts
                    JOIN performance_dates pd ON ts.performance_date_id = pd.id
                    JOIN markets m ON pd.market_id = m.id
                    WHERE ts.id = ?
                `, [slotId]);
                
                bookingDetails.push({
                    date: slotDetails[0].performance_date,
                    time: `${slotDetails[0].start_time} - ${slotDetails[0].end_time}`,
                    market: slotDetails[0].market_name,
                    status: 'confirmed'
                });
            } else if (join_waitlist) {
                // Add to waitlist
                const [waitlistPos] = await connection.execute(
                    'SELECT COALESCE(MAX(position), 0) + 1 as next_position FROM waitlist WHERE time_slot_id = ?',
                    [slotId]
                );
                await connection.execute(
                    'INSERT INTO waitlist (time_slot_id, musician_id, position) VALUES (?, ?, ?)',
                    [slotId, musicianId, waitlistPos[0].next_position]
                );
                waitlistCount++;

                const [slotDetails] = await connection.execute(`
                    SELECT ts.start_time, ts.end_time, pd.performance_date, m.name as market_name
                    FROM time_slots ts
                    JOIN performance_dates pd ON ts.performance_date_id = pd.id
                    JOIN markets m ON pd.market_id = m.id
                    WHERE ts.id = ?
                `, [slotId]);
                
                bookingDetails.push({
                    date: slotDetails[0].performance_date,
                    time: `${slotDetails[0].start_time} - ${slotDetails[0].end_time}`,
                    market: slotDetails[0].market_name,
                    status: 'waitlist'
                });
            }
        }

        await connection.commit();

        // Send confirmation email
        const emailMessage = `
            Hi ${name},
            
            Thank you for registering to perform at the farmers market!
            
            Confirmed Performances: ${bookedCount}
            Waitlist Positions: ${waitlistCount}
            
            Booking Details:
            ${bookingDetails.map(b => `- ${b.date}: ${b.time} (${b.status})`).join('\n')}
            
            Don't forget to upload your music sample, logo, and headshot photo!
            
            Your stipend will be paid on the day of your performance.
            
            Best regards,
            Farmers Market Team
        `;
        await sendEmail(email, 'Performance Registration Confirmed', emailMessage, 'booking_confirmation');

        res.json({ 
            success: true, 
            musician_id: musicianId,
            booked_count: bookedCount,
            waitlist_count: waitlistCount,
            booking_details: bookingDetails
        });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ success: false, error: error.message });
    } finally {
        connection.release();
    }
});

// Get waitlist for a slot
app.get('/api/slots/:id/waitlist', async (req, res) => {
    try {
        const [waitlist] = await pool.execute(`
            SELECT w.*, m.name, m.email, m.phone, m.music_genre, m.logo_url, m.headshot_url
            FROM waitlist w
            JOIN musicians m ON w.musician_id = m.id
            WHERE w.time_slot_id = ?
            ORDER BY w.position
        `, [req.params.id]);

        res.json({ success: true, waitlist });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Cancel a booking (admin function)
app.post('/api/bookings/:id/cancel', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const bookingId = req.params.id;
        const { reason } = req.body;

        // Get booking details
        const [bookings] = await connection.execute(`
            SELECT b.*, ts.id as slot_id, m.name, m.email
            FROM bookings b
            JOIN time_slots ts ON b.time_slot_id = ts.id
            JOIN musicians m ON b.musician_id = m.id
            WHERE b.id = ?
        `, [bookingId]);

        if (bookings.length === 0) {
            throw new Error('Booking not found');
        }

        const booking = bookings[0];

        // Cancel the booking
        await connection.execute(
            'UPDATE bookings SET status = "cancelled", cancelled_at = NOW(), cancellation_reason = ? WHERE id = ?',
            [reason, bookingId]
        );

        // Send cancellation email
        await sendEmail(booking.email, 'Performance Cancelled', `Hi ${booking.name}, your performance has been cancelled. Reason: ${reason}`, 'cancellation');

        // Check waitlist
        const [waitlist] = await connection.execute(
            'SELECT w.*, m.name, m.email FROM waitlist w JOIN musicians m ON w.musician_id = m.id WHERE w.time_slot_id = ? ORDER BY w.position LIMIT 1',
            [booking.slot_id]
        );

        if (waitlist.length > 0) {
            const nextMusician = waitlist[0];
            
            // Promote from waitlist
            await connection.execute(
                'INSERT INTO bookings (time_slot_id, musician_id, status) VALUES (?, ?, "confirmed")',
                [booking.slot_id, nextMusician.musician_id]
            );

            // Remove from waitlist
            await connection.execute(
                'DELETE FROM waitlist WHERE id = ?',
                [nextMusician.id]
            );

            // Update waitlist positions
            await connection.execute(
                'UPDATE waitlist SET position = position - 1 WHERE time_slot_id = ? AND position > ?',
                [booking.slot_id, nextMusician.position]
            );

            // Send promotion email
            await sendEmail(nextMusician.email, 'You\'ve Been Moved Off the Waitlist!', `Hi ${nextMusician.name}, great news! A slot has opened up and you've been confirmed for the performance.`, 'waitlist_promotion');

            await connection.commit();
            res.json({ success: true, promoted_musician: nextMusician.name });
        } else {
            await connection.commit();
            res.json({ success: true, promoted_musician: null });
        }
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ success: false, error: error.message });
    } finally {
        connection.release();
    }
});

// Get all musicians (with file URLs)
app.get('/api/musicians', async (req, res) => {
    try {
        const [musicians] = await pool.execute(
            'SELECT * FROM musicians ORDER BY created_at DESC'
        );
        res.json({ success: true, musicians });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get all bookings with details (admin)
app.get('/api/admin/bookings', async (req, res) => {
    try {
        const { market_id, month, status } = req.query;
        
        let query = `
            SELECT 
                b.id as booking_id,
                b.status,
                b.stipend_paid,
                b.stipend_paid_date,
                b.booking_date,
                ts.start_time,
                ts.end_time,
                pd.performance_date,
                m.id as musician_id,
                m.name as musician_name,
                m.email,
                m.phone,
                m.music_genre,
                m.logo_url,
                m.headshot_url,
                m.music_sample_url,
                mk.id as market_id,
                mk.name as market_name,
                mk.stipend_amount,
                (SELECT COUNT(*) FROM waitlist w WHERE w.time_slot_id = ts.id) as waitlist_count
            FROM bookings b
            JOIN time_slots ts ON b.time_slot_id = ts.id
            JOIN performance_dates pd ON ts.performance_date_id = pd.id
            JOIN markets mk ON pd.market_id = mk.id
            JOIN musicians m ON b.musician_id = m.id
            WHERE 1=1
        `;
        
        const params = [];
        
        if (market_id) {
            query += ' AND mk.id = ?';
            params.push(market_id);
        }
        
        if (month) {
            query += ' AND MONTH(pd.performance_date) = ?';
            params.push(month);
        }
        
        if (status) {
            query += ' AND b.status = ?';
            params.push(status);
        }
        
        query += ' ORDER BY pd.performance_date, ts.start_time';
        
        const [bookings] = await pool.execute(query, params);
        res.json({ success: true, bookings });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get dashboard statistics
app.get('/api/admin/stats', async (req, res) => {
    try {
        const { market_id } = req.query;
        
        const marketFilter = market_id ? 'AND pd.market_id = ?' : '';
        const params = market_id ? [market_id] : [];
        
        const [totalSlots] = await pool.execute(`
            SELECT COUNT(*) as count 
            FROM time_slots ts
            JOIN performance_dates pd ON ts.performance_date_id = pd.id
            WHERE pd.is_active = TRUE ${marketFilter}
        `, params);
        
        const [bookedSlots] = await pool.execute(`
            SELECT COUNT(*) as count 
            FROM bookings b
            JOIN time_slots ts ON b.time_slot_id = ts.id
            JOIN performance_dates pd ON ts.performance_date_id = pd.id
            WHERE b.status = 'confirmed' ${marketFilter}
        `, params);
        
        const [totalMusicians] = await pool.execute(
            'SELECT COUNT(DISTINCT id) as count FROM musicians'
        );
        
        const [totalWaitlist] = await pool.execute(`
            SELECT COUNT(*) as count 
            FROM waitlist w
            JOIN time_slots ts ON w.time_slot_id = ts.id
            JOIN performance_dates pd ON ts.performance_date_id = pd.id
            WHERE 1=1 ${marketFilter}
        `, params);
        
        res.json({
            success: true,
            stats: {
                total_slots: totalSlots[0].count,
                booked_slots: bookedSlots[0].count,
                available_slots: totalSlots[0].count - bookedSlots[0].count,
                total_musicians: totalMusicians[0].count,
                total_waitlist: totalWaitlist[0].count
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Admin login with bcrypt password verification
app.post('/api/admin/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        const [users] = await pool.execute(
            'SELECT * FROM admin_users WHERE username = ? AND is_active = TRUE',
            [username]
        );
        
        if (users.length === 0) {
            return res.status(401).json({ success: false, error: 'Invalid credentials' });
        }
        
        const user = users[0];
        
        // Check if password hash starts with bcrypt format
        const isBcryptHash = user.password_hash.startsWith('$2b$') || user.password_hash.startsWith('$2a$');
        
        let isPasswordValid = false;
        
        if (isBcryptHash) {
            isPasswordValid = await bcrypt.compare(password, user.password_hash);
        } else {
            isPasswordValid = (password === user.password_hash);
            
            if (isPasswordValid) {
                console.log(`⚠️  Upgrading plain text password to bcrypt for user: ${username}`);
                const hashedPassword = await bcrypt.hash(password, 10);
                await pool.execute(
                    'UPDATE admin_users SET password_hash = ? WHERE id = ?',
                    [hashedPassword, user.id]
                );
            }
        }
        
        if (isPasswordValid) {
            res.json({ 
                success: true, 
                admin: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    role: user.role
                }
            });
        } else {
            res.status(401).json({ success: false, error: 'Invalid credentials' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Mark stipend as paid
app.post('/api/bookings/:id/mark-paid', async (req, res) => {
    try {
        await pool.execute(
            'UPDATE bookings SET stipend_paid = TRUE, stipend_paid_date = CURDATE() WHERE id = ?',
            [req.params.id]
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
    console.log(`🎵 Musicians Signup API running on port ${PORT}`);
    console.log(`📍 http://localhost:${PORT}`);
    console.log(`📁 Uploads directory: ${uploadsDir}`);
});

module.exports = app;

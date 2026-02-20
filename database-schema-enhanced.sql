-- Enhanced Database Schema with File Uploads and Flexible Scheduling
-- Database: u760255612_musicians

USE u760255612_musicians;

-- Add file storage columns to musicians table
ALTER TABLE musicians 
ADD COLUMN music_sample_url VARCHAR(500) AFTER description,
ADD COLUMN logo_url VARCHAR(500) AFTER music_sample_url,
ADD COLUMN headshot_url VARCHAR(500) AFTER logo_url,
ADD COLUMN music_sample_filename VARCHAR(255) AFTER headshot_url,
ADD COLUMN logo_filename VARCHAR(255) AFTER music_sample_filename,
ADD COLUMN headshot_filename VARCHAR(255) AFTER logo_filename;

-- Add custom schedule columns to markets table
ALTER TABLE markets
ADD COLUMN custom_days VARCHAR(50) AFTER day_of_week COMMENT 'JSON array of days: [0,1,2,3,4,5,6] for Sun-Sat',
ADD COLUMN year_round BOOLEAN DEFAULT FALSE AFTER season_end_month,
ADD COLUMN custom_months VARCHAR(50) AFTER year_round COMMENT 'JSON array of months if not year round: [1,2,3...12]';

-- Create custom time slots template table (for markets to define their own slots)
CREATE TABLE IF NOT EXISTS market_time_slots_template (
    id INT AUTO_INCREMENT PRIMARY KEY,
    market_id INT NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    slot_name VARCHAR(100),
    slot_order INT DEFAULT 1,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (market_id) REFERENCES markets(id) ON DELETE CASCADE
);

-- Create table for storing uploaded files metadata
CREATE TABLE IF NOT EXISTS file_uploads (
    id INT AUTO_INCREMENT PRIMARY KEY,
    musician_id INT NOT NULL,
    file_type ENUM('music_sample', 'logo', 'headshot') NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    stored_filename VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_size INT NOT NULL COMMENT 'Size in bytes',
    mime_type VARCHAR(100),
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (musician_id) REFERENCES musicians(id) ON DELETE CASCADE
);

-- Add indexes for file lookups
CREATE INDEX idx_file_uploads_musician ON file_uploads(musician_id);
CREATE INDEX idx_file_uploads_type ON file_uploads(file_type);

-- Sample data: Add custom time slots template for existing market
INSERT INTO market_time_slots_template (market_id, start_time, end_time, slot_name, slot_order)
SELECT id, '10:00:00', '12:00:00', 'Morning Performance', 1 FROM markets WHERE id = 1
ON DUPLICATE KEY UPDATE start_time=start_time;

INSERT INTO market_time_slots_template (market_id, start_time, end_time, slot_name, slot_order)
SELECT id, '11:00:00', '13:00:00', 'Midday Performance', 2 FROM markets WHERE id = 1
ON DUPLICATE KEY UPDATE start_time=start_time;

-- Update existing market to use flexible scheduling
UPDATE markets 
SET custom_days = '[6]', 
    custom_months = '[5,6,7,8,9,10]',
    year_round = FALSE
WHERE id = 1;

-- View to see market schedules easily
CREATE OR REPLACE VIEW market_schedule_view AS
SELECT 
    m.id as market_id,
    m.name as market_name,
    m.year_round,
    m.custom_days,
    m.custom_months,
    mts.id as template_slot_id,
    mts.start_time,
    mts.end_time,
    mts.slot_name,
    mts.slot_order
FROM markets m
LEFT JOIN market_time_slots_template mts ON m.id = mts.market_id
WHERE m.is_active = TRUE
ORDER BY m.id, mts.slot_order;

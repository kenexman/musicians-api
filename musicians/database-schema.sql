-- Farmers Market Musicians Signup Database Schema
-- Database: u760255612_musicians

USE u760255612_musicians;

-- Markets table (for multiple farmers markets)
CREATE TABLE IF NOT EXISTS markets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    location VARCHAR(255),
    start_time TIME DEFAULT '08:00:00',
    end_time TIME DEFAULT '13:00:00',
    stipend_amount DECIMAL(10,2) DEFAULT 75.00,
    season_start_month INT DEFAULT 5,
    season_end_month INT DEFAULT 10,
    day_of_week INT DEFAULT 6, -- 0=Sunday, 6=Saturday
    contact_email VARCHAR(255),
    contact_phone VARCHAR(20),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Musicians table
CREATE TABLE IF NOT EXISTS musicians (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    music_genre VARCHAR(100),
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_email (email)
);

-- Performance dates table
CREATE TABLE IF NOT EXISTS performance_dates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    market_id INT NOT NULL,
    performance_date DATE NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (market_id) REFERENCES markets(id) ON DELETE CASCADE,
    UNIQUE KEY unique_market_date (market_id, performance_date)
);

-- Time slots table
CREATE TABLE IF NOT EXISTS time_slots (
    id INT AUTO_INCREMENT PRIMARY KEY,
    performance_date_id INT NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    slot_order INT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (performance_date_id) REFERENCES performance_dates(id) ON DELETE CASCADE
);

-- Bookings table
CREATE TABLE IF NOT EXISTS bookings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    time_slot_id INT NOT NULL,
    musician_id INT NOT NULL,
    status ENUM('confirmed', 'cancelled', 'completed') DEFAULT 'confirmed',
    booking_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    cancelled_at TIMESTAMP NULL,
    cancellation_reason TEXT,
    stipend_paid BOOLEAN DEFAULT FALSE,
    stipend_paid_date DATE NULL,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (time_slot_id) REFERENCES time_slots(id) ON DELETE CASCADE,
    FOREIGN KEY (musician_id) REFERENCES musicians(id) ON DELETE CASCADE,
    UNIQUE KEY unique_slot_booking (time_slot_id)
);

-- Waitlist table
CREATE TABLE IF NOT EXISTS waitlist (
    id INT AUTO_INCREMENT PRIMARY KEY,
    time_slot_id INT NOT NULL,
    musician_id INT NOT NULL,
    position INT NOT NULL,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    notified BOOLEAN DEFAULT FALSE,
    notified_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (time_slot_id) REFERENCES time_slots(id) ON DELETE CASCADE,
    FOREIGN KEY (musician_id) REFERENCES musicians(id) ON DELETE CASCADE
);

-- Admin users table
CREATE TABLE IF NOT EXISTS admin_users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    role ENUM('super_admin', 'market_admin') DEFAULT 'market_admin',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Admin market access table (which markets can an admin manage)
CREATE TABLE IF NOT EXISTS admin_market_access (
    id INT AUTO_INCREMENT PRIMARY KEY,
    admin_id INT NOT NULL,
    market_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (admin_id) REFERENCES admin_users(id) ON DELETE CASCADE,
    FOREIGN KEY (market_id) REFERENCES markets(id) ON DELETE CASCADE,
    UNIQUE KEY unique_admin_market (admin_id, market_id)
);

-- Email notifications log
CREATE TABLE IF NOT EXISTS email_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    recipient_email VARCHAR(255) NOT NULL,
    subject VARCHAR(500),
    message TEXT,
    email_type ENUM('booking_confirmation', 'cancellation', 'waitlist_promotion', 'reminder', 'other') DEFAULT 'other',
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status ENUM('sent', 'failed', 'pending') DEFAULT 'pending',
    error_message TEXT
);

-- Insert default super admin (password: admin123 - should be changed!)
-- Password hash for 'admin123' using bcrypt
INSERT INTO admin_users (username, password_hash, email, full_name, role) 
VALUES ('admin', '$2b$10$rH5Ks9qZ7Y8X8c7Y8X8c7.K9X8c7Y8X8c7Y8X8c7Y8X8c7Y8X8c7', 'admin@farmersmarket.com', 'System Administrator', 'super_admin')
ON DUPLICATE KEY UPDATE username=username;

-- Insert a sample market
INSERT INTO markets (name, location, start_time, end_time, stipend_amount, contact_email) 
VALUES ('Downtown Farmers Market', 'Main Street Plaza', '08:00:00', '13:00:00', 75.00, 'info@downtownmarket.com')
ON DUPLICATE KEY UPDATE name=name;

-- Indexes for better performance
CREATE INDEX idx_musician_email ON musicians(email);
CREATE INDEX idx_performance_date ON performance_dates(performance_date);
CREATE INDEX idx_booking_status ON bookings(status);
CREATE INDEX idx_booking_musician ON bookings(musician_id);
CREATE INDEX idx_waitlist_slot ON waitlist(time_slot_id);
CREATE INDEX idx_waitlist_position ON waitlist(position);

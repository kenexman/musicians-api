// Database Initialization Script
// Run this after importing the schema to set up your first market and season

const mysql = require('mysql2/promise');

const config = {
    host: 'localhost', // Change this to your MySQL host
    user: 'u760255612_musicians',
    password: 'ngna&wXrb%AuNKI7',
    database: 'u760255612_musicians'
};

async function generateSaturdays(year, startMonth = 4, endMonth = 9) {
    const saturdays = [];
    for (let month = startMonth; month <= endMonth; month++) {
        const date = new Date(year, month, 1);
        while (date.getMonth() === month) {
            if (date.getDay() === 6) {
                saturdays.push(new Date(date));
            }
            date.setDate(date.getDate() + 1);
        }
    }
    return saturdays;
}

async function initializeDatabase() {
    let connection;
    
    try {
        console.log('🔌 Connecting to database...');
        connection = await mysql.createConnection(config);
        console.log('✅ Connected to database');

        // Check if market already exists
        const [markets] = await connection.execute('SELECT * FROM markets LIMIT 1');
        
        let marketId;
        if (markets.length === 0) {
            console.log('📍 Creating default market...');
            const [result] = await connection.execute(
                `INSERT INTO markets (name, location, start_time, end_time, stipend_amount, contact_email) 
                 VALUES (?, ?, ?, ?, ?, ?)`,
                ['Downtown Farmers Market', 'Main Street Plaza', '08:00:00', '13:00:00', 75.00, 'info@farmersmarket.com']
            );
            marketId = result.insertId;
            console.log(`✅ Market created with ID: ${marketId}`);
        } else {
            marketId = markets[0].id;
            console.log(`✅ Using existing market: ${markets[0].name} (ID: ${marketId})`);
        }

        // Check if dates are already initialized
        const [existingDates] = await connection.execute(
            'SELECT COUNT(*) as count FROM performance_dates WHERE market_id = ?',
            [marketId]
        );

        if (existingDates[0].count > 0) {
            console.log(`ℹ️  Season already initialized with ${existingDates[0].count} dates`);
            console.log('💡 To reinitialize, first delete existing dates:');
            console.log(`   DELETE FROM performance_dates WHERE market_id = ${marketId};`);
        } else {
            console.log('📅 Generating season dates...');
            const year = 2025;
            const saturdays = await generateSaturdays(year);
            console.log(`📅 Found ${saturdays.length} Saturdays from May to October ${year}`);

            console.log('💾 Creating performance dates and time slots...');
            let createdCount = 0;

            for (const date of saturdays) {
                const dateStr = date.toISOString().split('T')[0];
                
                // Insert performance date
                const [dateResult] = await connection.execute(
                    'INSERT INTO performance_dates (market_id, performance_date) VALUES (?, ?)',
                    [marketId, dateStr]
                );
                const performanceDateId = dateResult.insertId;

                // Insert two time slots
                await connection.execute(
                    'INSERT INTO time_slots (performance_date_id, start_time, end_time, slot_order) VALUES (?, ?, ?, ?)',
                    [performanceDateId, '10:00:00', '12:00:00', 1]
                );
                await connection.execute(
                    'INSERT INTO time_slots (performance_date_id, start_time, end_time, slot_order) VALUES (?, ?, ?, ?)',
                    [performanceDateId, '11:00:00', '13:00:00', 2]
                );

                createdCount++;
            }

            console.log(`✅ Created ${createdCount} dates with ${createdCount * 2} total time slots`);
        }

        // Verify admin user exists
        const [admins] = await connection.execute('SELECT * FROM admin_users WHERE username = ?', ['admin']);
        if (admins.length === 0) {
            console.log('👤 Creating default admin user...');
            await connection.execute(
                'INSERT INTO admin_users (username, password_hash, email, full_name, role) VALUES (?, ?, ?, ?, ?)',
                ['admin', 'admin123', 'admin@farmersmarket.com', 'System Administrator', 'super_admin']
            );
            console.log('✅ Admin user created (username: admin, password: admin123)');
        } else {
            console.log('✅ Admin user already exists');
        }

        console.log('\n🎉 Database initialization complete!');
        console.log('\n📝 Next steps:');
        console.log('1. Start the backend server: npm start');
        console.log('2. Open index.html in your browser');
        console.log('3. Test musician signup');
        console.log('4. Login to admin (username: admin, password: admin123)');
        console.log('\n⚠️  IMPORTANT: Change the default admin password in production!');

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error('\n🔧 Troubleshooting:');
        console.error('- Check if database schema has been imported');
        console.error('- Verify database credentials in this file');
        console.error('- Ensure MySQL server is running and accessible');
    } finally {
        if (connection) {
            await connection.end();
            console.log('\n🔌 Database connection closed');
        }
    }
}

// Run the initialization
initializeDatabase();

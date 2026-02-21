# Farmers Market Musicians Signup System - Setup Guide

## 🎵 Overview
Complete multi-market musician booking system with MySQL backend, REST API, and responsive frontend.

## 📋 Prerequisites
- Node.js (v14 or higher)
- MySQL (v5.7 or higher)
- Access to your MySQL database

## 🚀 Installation Steps

### Step 1: Database Setup

1. **Connect to your MySQL database:**
```bash
mysql -h your-host -u u760255612_musicians -p
# Enter password: ngna&wXrb%AuNKI7
```

2. **Run the database schema:**
```bash
mysql -h your-host -u u760255612_musicians -p u760255612_musicians < database-schema.sql
```

Or manually copy/paste the SQL from `database-schema.sql` into your MySQL client.

### Step 2: Backend Setup

1. **Install Node.js dependencies:**
```bash
npm install
```

2. **Configure database connection:**

Edit `server.js` (lines 20-27) if your MySQL host is different:
```javascript
const pool = mysql.createPool({
    host: 'your-mysql-host.com',  // Change this if needed
    user: 'u760255612_musicians',
    password: 'ngna&wXrb%AuNKI7',
    database: 'u760255612_musicians',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});
```

3. **Initialize the season (create dates and time slots):**

You can use the API endpoint or create a simple script:

```bash
# Using curl:
curl -X POST http://localhost:3000/api/markets/1/initialize-season \
  -H "Content-Type: application/json" \
  -d '{"year": 2025}'
```

Or access it via browser after starting the server.

### Step 3: Start the Backend Server

```bash
npm start
```

The API will be running at `http://localhost:3000`

### Step 4: Frontend Setup

1. **Update API URL in index.html:**

Edit line 396 in `index.html`:
```javascript
const API_URL = 'http://your-domain.com:3000/api';  // or keep as localhost for testing
```

2. **Deploy the frontend:**
- For local testing: Open `index.html` directly in browser
- For production: Upload `index.html` to your web hosting

**Important:** If hosting on a different domain than the API, make sure CORS is properly configured in `server.js`.

## 🗄️ Database Tables Created

The schema creates the following tables:
- **markets** - Store multiple market locations
- **musicians** - Musician profiles
- **performance_dates** - Available dates
- **time_slots** - Time slots for each date
- **bookings** - Confirmed performances
- **waitlist** - Waitlist management
- **admin_users** - Admin authentication
- **admin_market_access** - Admin permissions
- **email_log** - Email notification tracking

## 🔐 Default Admin Credentials

- **Username:** admin
- **Password:** admin123

**⚠️ IMPORTANT:** Change the default admin password in production!

To change password, update the admin_users table or add proper password hashing.

## 📊 API Endpoints

### Public Endpoints
- `GET /api/markets` - Get all markets
- `GET /api/markets/:id` - Get market details
- `GET /api/markets/:id/schedule` - Get available slots
- `POST /api/musicians/register` - Register musician and book slots

### Admin Endpoints
- `POST /api/admin/login` - Admin authentication
- `GET /api/admin/stats` - Dashboard statistics
- `GET /api/admin/bookings` - Get all bookings
- `POST /api/bookings/:id/cancel` - Cancel booking
- `POST /api/bookings/:id/mark-paid` - Mark stipend as paid
- `GET /api/musicians` - Get all musicians
- `POST /api/markets/:id/initialize-season` - Initialize dates for season

## 🎯 Adding New Markets

To add a new market:

```sql
INSERT INTO markets (name, location, start_time, end_time, stipend_amount, contact_email) 
VALUES ('West Side Market', '123 Market St', '08:00:00', '13:00:00', 100.00, 'info@westsidemarket.com');

-- Then initialize the season for the new market
-- Use the API endpoint: POST /api/markets/{new-market-id}/initialize-season
```

## 🔧 Customization

### Change Time Slots
Edit the time slots in the `initialize-season` endpoint in `server.js` (lines 142-151):
```javascript
// Currently: 10:00-12:00 and 11:00-13:00
await connection.execute(
    'INSERT IGNORE INTO time_slots (performance_date_id, start_time, end_time, slot_order) VALUES (?, ?, ?, ?)',
    [performanceDateId, '10:00:00', '12:00:00', 1]
);
```

### Change Days of Week
Edit the `generateSaturdays` function or modify the `day_of_week` column in the markets table:
- 0 = Sunday
- 1 = Monday
- ...
- 6 = Saturday

### Email Notifications
The system logs all email notifications. To actually send emails, integrate with:
- SendGrid
- AWS SES
- Mailgun
- Any SMTP service

Update the `sendEmail` function in `server.js` (lines 56-72).

## 🚀 Production Deployment

### Backend Deployment (Node.js)
1. Use a process manager like PM2:
```bash
npm install -g pm2
pm2 start server.js --name musicians-api
pm2 save
pm2 startup
```

2. Or use services like:
- Heroku
- DigitalOcean App Platform
- AWS Elastic Beanstalk
- Google Cloud Run

### Frontend Deployment
- Upload `index.html` to any web hosting service
- Update the API_URL to point to your production API
- Ensure CORS is configured correctly

### Database
- Your MySQL database is already hosted
- Make sure it's accessible from your backend server
- Consider setting up automated backups

## 🔒 Security Considerations

1. **Change default admin password**
2. **Implement proper password hashing** (bcrypt is included)
3. **Add JWT authentication** for admin sessions
4. **Use HTTPS** in production
5. **Implement rate limiting** to prevent abuse
6. **Sanitize all user inputs**
7. **Keep database credentials secure** (use environment variables)

## 🐛 Troubleshooting

### Database Connection Issues
- Verify MySQL host, username, and password
- Check if your IP is whitelisted in MySQL host settings
- Ensure MySQL port (usually 3306) is accessible

### CORS Errors
- Update CORS settings in server.js
- Make sure frontend URL is allowed

### Time Zone Issues
- All dates are stored in MySQL's default timezone
- Adjust if needed for your local timezone

## 📱 Features

### Musician Portal
- ✅ View available performance dates
- ✅ Select multiple time slots
- ✅ Join waitlist for booked slots
- ✅ Instant booking confirmation
- ✅ Email notifications

### Admin Dashboard
- ✅ View all bookings by market
- ✅ Filter by month and status
- ✅ Cancel bookings (auto-promotes waitlist)
- ✅ Track stipend payments
- ✅ View all registered musicians
- ✅ Dashboard statistics

### Multi-Market Support
- ✅ Manage multiple market locations
- ✅ Different stipends per market
- ✅ Custom schedules per market
- ✅ Independent booking systems

## 📞 Support

For issues or questions:
1. Check the troubleshooting section
2. Review the database schema
3. Examine the browser console for frontend errors
4. Check server logs for backend errors

## 📄 Files Included

1. **database-schema.sql** - Complete database structure
2. **server.js** - Backend API server
3. **index.html** - Frontend application
4. **package.json** - Node.js dependencies
5. **README.md** - This file

## 🎉 Quick Start Checklist

- [ ] Import database-schema.sql to MySQL
- [ ] Run `npm install`
- [ ] Update database host in server.js if needed
- [ ] Start backend: `npm start`
- [ ] Initialize season: `POST /api/markets/1/initialize-season`
- [ ] Update API_URL in index.html
- [ ] Open index.html in browser
- [ ] Test musician signup
- [ ] Test admin login (admin/admin123)
- [ ] Change default admin password

## 🎸 You're Ready to Rock!

Your farmers market musicians signup system is ready to go. Musicians can now book their performance slots, and admins can manage everything from one dashboard.

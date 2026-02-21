# 🎵 QUICK START GUIDE - Farmers Market Musicians Signup

## ⚡ Super Fast Setup (5 minutes)

### 1️⃣ Setup Database (2 minutes)

```bash
# Import the schema into your MySQL database
mysql -h your-host -u u760255612_musicians -p u760255612_musicians < database-schema.sql
# Password: ngna&wXrb%AuNKI7
```

### 2️⃣ Setup Backend (2 minutes)

```bash
# Install dependencies
npm install

# Initialize the database (creates dates and admin)
npm run init-db

# Start the server
npm start
```

Server will run at: http://localhost:3000

### 3️⃣ Test It (1 minute)

1. Open `index.html` in your browser
2. Try signing up as a musician
3. Click "Admin Dashboard" tab
4. Login with: username `admin`, password `admin123`

## 🌐 For Production

### Backend:
1. Update database host in `server.js` (line 21)
2. Deploy to your server/hosting
3. Use PM2 or similar to keep it running

### Frontend:
1. Edit `index.html` line 396: Change API_URL to your backend URL
2. Upload `index.html` to your web hosting

## 🎯 Key Files

- **database-schema.sql** - Import this into MySQL first
- **server.js** - Backend API (Node.js + Express)
- **index.html** - Frontend application
- **scripts/init-database.js** - Auto-setup script

## 🔐 Security Reminders

- ⚠️ Change default admin password (admin123)
- ⚠️ Use environment variables for production
- ⚠️ Enable HTTPS in production
- ⚠️ Keep database credentials secure

## 📞 Support

Read the full **README.md** for:
- Detailed setup instructions
- API documentation
- Troubleshooting guide
- Customization options
- Production deployment tips

## 🎸 Ready to Rock!

Your system supports:
✅ Multiple market locations
✅ Musician registration & booking
✅ Waitlist management
✅ Admin dashboard
✅ Email notifications (ready for integration)
✅ Stipend tracking

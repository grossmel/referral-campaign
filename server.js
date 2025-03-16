
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const shortid = require('shortid');
const axios = require('axios');
const path = require('path');
const app = express(); 
const port = 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public'))); // Serve frontend

// SQLite database
const db = new sqlite3.Database('referrals.db', (err) => {
  if (err) console.error(err);
  console.log('Connected to SQLite');
});

// SlickText API setup
const slickTextPublicKey = '77803572822b564ca62d54dd4451a3156d2255629ca58bf965a0a9edf9fee855b994'; // Replace with your Public Key
const slickTextBaseUrl = 'https://dev.slicktext.com/v1/brands/994/lists/contacts';
const slickTextListID = '2645'; // Replace with your List ID

// Create tables
db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone_number TEXT UNIQUE,
    referral_code TEXT UNIQUE,
    entries INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS referrals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    referrer_code TEXT,
    new_user_id INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);

// Signup endpoint
app.post('/signup', async (req, res) => {
  const { phone_number, ref } = req.body;

  if (!phone_number) {
    return res.status(400).json({ message: 'Phone number required' });
  }

  // Normalize phone number to E.164 format (e.g., +11234567890)
  const normalizedPhone = phone_number.startsWith('+1') ? phone_number : `+1${phone_number.replace(/\D/g, '')}`;

  // Check if user already exists
  db.get('SELECT * FROM users WHERE phone_number = ?', [normalizedPhone], async (err, existing) => {
    if (err) return res.status(500).json({ message: 'Database error' });
    if (existing) {
      return res.status(400).json({ message: 'Phone number already signed up' });
    }

    // Generate unique referral code
    const referralCode = shortid.generate(); // e.g., "USER123"

    // Insert new user with 1 entry
    db.run(
      'INSERT INTO users (phone_number, referral_code, entries) VALUES (?, ?, ?)',
      [normalizedPhone, referralCode, 1],
      async (err) => {
        if (err) return res.status(500).json({ message: 'Error signing up' });

        const newUserId = this.lastID;

        // Handle referral if provided
        if (ref) {
          db.get('SELECT * FROM users WHERE referral_code = ?', [ref], async (err, referrer) => {
            if (err) return;
            if (referrer) {
              // Give referrer an extra entry
              db.run('UPDATE users SET entries = entries + 1 WHERE referral_code = ?', [ref]);

              // Log the referral
              db.run('INSERT INTO referrals (referrer_code, new_user_id) VALUES (?, ?)', [ref, newUserId]);

              // Send SMS to referrer via SlickText
              try {
                await axios.post(
                  `${slickTextBaseUrl}/messages`,
                  {
                    "lists": [2645],
                    number: referrer.phone_number,
                    body: `A friend signed up with your link! You now have ${referrer.entries + 1} giveaway entries.`,
                  },
                  {
                    auth: {
                      username: slickTextPublicKey,
                      
                    },
                    headers: {
                      'Content-Type': 'application/json',
                    },
                  }
                );
              } catch (smsErr) {
                console.error('SlickText SMS failed:', smsErr.response ? smsErr.response.data : smsErr);
              }
            }
          });
        }

        // Send response with referral link
        res.json({
          message: 'Signed up successfully!',
          referralLink: `https://referral.gamifyHQ.com/signup?ref=${referralCode}`,
          entries: 1,
        });
      }
    );
  });
});

// Start the server
app.get('/signup', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// ===== MIDDLEWARE =====
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// ===== DATA FILE =====
const USERS_FILE = path.join(__dirname, 'data', 'users.json');

// Stelle sicher, dass der data-Ordner existiert
if (!fs.existsSync(path.join(__dirname, 'data'))) {
  fs.mkdirSync(path.join(__dirname, 'data'));
}

// Initialisiere users.json falls nicht vorhanden
if (!fs.existsSync(USERS_FILE)) {
  fs.writeFileSync(USERS_FILE, JSON.stringify([]));
}

// ===== HELPER FUNCTIONS =====
function getUsers() {
  try {
    const data = fs.readFileSync(USERS_FILE);
    const users = JSON.parse(data);
    // Stelle sicher, dass jeder User ein bio-Feld hat
    return users.map(u => ({
      ...u,
      bio: u.bio || ''
    }));
  } catch (err) {
    return [];
  }
}

function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function findUserByEmailOrUsername(users, identifier) {
  const lower = identifier.toLowerCase();
  return users.find(u => 
    (u.email && u.email.toLowerCase() === lower) ||
    (u.username && u.username.toLowerCase() === lower)
  );
}

function isUsernameTaken(users, username, excludeId = null) {
  const lower = username.toLowerCase();
  return users.some(u => 
    u.username.toLowerCase() === lower && u.id !== excludeId
  );
}

function isEmailTaken(users, email, excludeId = null) {
  if (!email) return false;
  const lower = email.toLowerCase();
  return users.some(u => 
    u.email && u.email.toLowerCase() === lower && u.id !== excludeId
  );
}

// ============================================================
// ===== AUTH ENDPOINTS =====
// ============================================================

// SIGN UP
app.post('/api/signup', (req, res) => {
  const { username, email, password } = req.body;
  
  if (!username || username.length < 2) {
    return res.status(400).json({ error: 'Username must be at least 2 characters' });
  }
  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  
  const users = getUsers();
  
  if (isUsernameTaken(users, username)) {
    return res.status(400).json({ error: 'Username already taken' });
  }
  
  if (email && isEmailTaken(users, email)) {
    return res.status(400).json({ error: 'Email already registered' });
  }
  
  const token = generateToken();
  const newUser = {
    id: Date.now().toString(),
    username,
    email: email || '',
    password,
    token,
    verified: !email,
    avatar: '',
    banner: '',
    background: '',
    bio: '',
    createdAt: new Date().toISOString()
  };
  
  users.push(newUser);
  saveUsers(users);
  
  if (email) {
    console.log(`\n📧 VERIFICATION EMAIL for ${email}`);
    console.log(`🔗 http://localhost:${PORT}/api/verify?token=${token}\n`);
  }
  
  res.json({
    success: true,
    user: {
      id: newUser.id,
      username: newUser.username,
      email: newUser.email,
      avatar: newUser.avatar,
      banner: newUser.banner,
      background: newUser.background,
      bio: newUser.bio,
      verified: newUser.verified
    },
    token: token
  });
});

// VERIFY EMAIL
app.get('/api/verify', (req, res) => {
  const { token } = req.query;
  if (!token) {
    return res.status(400).json({ error: 'Missing verification token' });
  }
  
  const users = getUsers();
  const user = users.find(u => u.token === token);
  if (!user) {
    return res.status(400).json({ error: 'Invalid verification token' });
  }
  
  user.verified = true;
  user.token = generateToken();
  saveUsers(users);
  
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Email Verified ✅</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: 'Inter', system-ui, sans-serif;
            background: #0b0e14;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 1.5rem;
          }
          .card {
            background: rgba(22, 28, 38, 0.9);
            backdrop-filter: blur(12px);
            border-radius: 48px;
            padding: 3rem 2.5rem;
            max-width: 500px;
            width: 100%;
            text-align: center;
            border: 1px solid rgba(255, 255, 255, 0.05);
            box-shadow: 0 30px 50px rgba(0, 0, 0, 0.7);
          }
          h1 { color: #2ecc71; font-size: 2.5rem; margin-bottom: 1rem; }
          .check { font-size: 4rem; color: #2ecc71; margin-bottom: 1rem; }
          p { color: #bcc6e0; font-size: 1.1rem; line-height: 1.6; margin-bottom: 2rem; }
          .btn {
            display: inline-block;
            background: #5865f2;
            color: white;
            text-decoration: none;
            padding: 14px 40px;
            border-radius: 60px;
            font-weight: 600;
            transition: 0.2s;
            box-shadow: 0 10px 24px -6px rgba(88, 101, 242, 0.3);
          }
          .btn:hover { background: #4752d4; transform: scale(0.98); }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="check">✅</div>
          <h1>Email Verified!</h1>
          <p>Your account is now verified. You can now sign in to VibeSphere.</p>
          <a href="/" class="btn">Go to VibeSphere</a>
        </div>
      </body>
    </html>
  `);
});

// SIGN IN
app.post('/api/signin', (req, res) => {
  const { identifier, password } = req.body;
  
  if (!identifier || !password) {
    return res.status(400).json({ error: 'Email/Username and password required' });
  }
  
  const users = getUsers();
  const user = findUserByEmailOrUsername(users, identifier);
  
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  
  if (user.password !== password) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  
  if (user.email && !user.verified) {
    return res.status(403).json({ 
      error: 'Email not verified. Check your inbox.',
      needsVerification: true
    });
  }
  
  user.token = generateToken();
  saveUsers(users);
  
  res.json({
    success: true,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      avatar: user.avatar || '',
      banner: user.banner || '',
      background: user.background || '',
      bio: user.bio || '',
      verified: user.verified
    },
    token: user.token
  });
});

// GET CURRENT USER (auto-login)
app.get('/api/me', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  const users = getUsers();
  const user = users.find(u => u.token === token);
  if (!user) {
    return res.status(401).json({ error: 'Invalid token' });
  }
  
  res.json({
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      avatar: user.avatar || '',
      banner: user.banner || '',
      background: user.background || '',
      bio: user.bio || '',
      verified: user.verified
    }
  });
});

// ============================================================
// ===== PROFILE ENDPOINTS =====
// ============================================================

// GET PUBLIC PROFILE
app.get('/api/profile/:identifier', (req, res) => {
  const { identifier } = req.params;
  const users = getUsers();
  
  const user = users.find(u => 
    u.username.toLowerCase() === identifier.toLowerCase() || u.id === identifier
  );
  
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  res.json({
    id: user.id,
    username: user.username,
    avatar: user.avatar || '',
    banner: user.banner || '',
    background: user.background || '',
    bio: user.bio || '',
    createdAt: user.createdAt,
    email: user.email || ''
  });
});

// UPDATE PROFILE (username CANNOT be changed)
app.put('/api/profile', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  const users = getUsers();
  const userIndex = users.findIndex(u => u.token === token);
  if (userIndex === -1) {
    return res.status(401).json({ error: 'Invalid token' });
  }
  
  const { avatar, banner, background, bio } = req.body;
  const user = users[userIndex];
  
  if (avatar !== undefined) user.avatar = avatar;
  if (banner !== undefined) user.banner = banner;
  if (background !== undefined) user.background = background;
  if (bio !== undefined) user.bio = bio;
  
  saveUsers(users);
  
  res.json({
    success: true,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      avatar: user.avatar || '',
      banner: user.banner || '',
      background: user.background || '',
      bio: user.bio || '',
      verified: user.verified
    }
  });
});

// DELETE ACCOUNT
app.delete('/api/delete-account', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  let users = getUsers();
  const userIndex = users.findIndex(u => u.token === token);
  if (userIndex === -1) {
    return res.status(401).json({ error: 'Invalid token' });
  }
  
  const deletedUser = users[userIndex];
  users.splice(userIndex, 1);
  saveUsers(users);
  
  console.log(`🗑️ Account deleted: ${deletedUser.username}`);
  
  res.json({ 
    success: true, 
    message: 'Account deleted successfully'
  });
});

// ============================================================
// ===== NEU: GET ALL USERS (für Leaderboard) =====
// ============================================================
app.get('/api/users', (req, res) => {
  const users = getUsers();
  // Sicherheitshalber keine Passwörter oder Tokens senden
  res.json(users.map(u => ({
    id: u.id,
    username: u.username,
    avatar: u.avatar || '',
    banner: u.banner || '',
    bio: u.bio || '',
    createdAt: u.createdAt,
    email: u.email || ''
  })));
});

// ============================================================
// ===== SERVE FRONTEND =====
// ============================================================

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/profile/:identifier', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'profile.html'));
});

// ============================================================
// ===== START SERVER =====
// ============================================================

app.listen(PORT, () => {
  console.log(`\n🚀 VibeSphere server running at http://localhost:${PORT}`);
  console.log(`📁 Data stored in: ${USERS_FILE}`);
  console.log(`\n🔒 Usernames are permanent and cannot be changed`);
  console.log(`📊 /api/users endpoint available for leaderboard\n`);
});
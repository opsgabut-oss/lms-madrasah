const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure uploads folder exists
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Template Engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middlewares
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadsDir));

// Session Setup
app.use(
  session({
    secret: 'oemah-sinau-lms-secure-key-2026',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 } // 1 day
  })
);

const db = require('./database/db');

// Global view variables
app.use((req, res, next) => {
  if (req.session && req.session.user) {
    try {
      const userSchoolId = req.session.user.school_id;
      let school = userSchoolId ? db.prepare('SELECT id, name, logo FROM schools WHERE id = ?').get(userSchoolId) : null;
      if (!school) {
        school = db.prepare('SELECT id, name, logo FROM schools ORDER BY id DESC LIMIT 1').get();
      }
      if (school) {
        req.session.user.school_id = school.id;
        req.session.user.school_name = school.name;
        req.session.user.school_logo = school.logo;
      }
    } catch (e) {}
  }
  res.locals.currentUser = req.session.user || null;
  next();
});

// Routes
const authRoutes = require('./routes/auth');
const guruRoutes = require('./routes/guru');
const siswaRoutes = require('./routes/siswa');

app.use('/auth', authRoutes);
app.use('/guru', guruRoutes);
app.use('/siswa', siswaRoutes);

// Root Redirect
app.get('/', (req, res) => {
  if (req.session && req.session.user) {
    if (req.session.user.role === 'guru') {
      return res.redirect('/guru/dashboard');
    } else {
      return res.redirect('/siswa/dashboard');
    }
  }
  res.redirect('/auth/login');
});

// 404 Handler
app.use((req, res) => {
  res.status(404).send(`
    <!DOCTYPE html>
    <html lang="id">
    <head>
      <meta charset="UTF-8">
      <title>404 Halaman Tidak Ditemukan | Oemah Sinau LMS</title>
      <script src="https://cdn.tailwindcss.com"></script>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;700;900&display=swap" rel="stylesheet">
    </head>
    <body class="bg-slate-50 min-h-screen flex items-center justify-center font-sans p-6 text-center">
      <div class="max-w-md bg-white p-8 rounded-3xl shadow-xl border border-slate-200">
        <div class="text-6xl font-black text-emerald-500 mb-2">404</div>
        <h2 class="text-xl font-bold text-slate-800">Halaman Tidak Ditemukan</h2>
        <p class="text-slate-500 text-xs mt-2">Halaman yang Anda tuju mungkin telah dipindahkan atau tautan salah.</p>
        <a href="/" class="mt-6 inline-block px-6 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-all">
          Kembali ke Beranda
        </a>
      </div>
    </body>
    </html>
  `);
});

// Start Server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`====================================================`);
  console.log(`🚀 Oemah Sinau LMS berhasil berjalan di port ${PORT}`);
  console.log(`🔗 Akses di Browser: http://localhost:${PORT} atau http://127.0.0.1:${PORT}`);
  console.log(`====================================================`);
});

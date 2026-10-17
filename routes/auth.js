const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../database/db');
const { redirectIfAuthenticated } = require('../middleware/auth');

// GET /auth/login
router.get('/login', redirectIfAuthenticated, (req, res) => {
  const error = req.session.flashError || null;
  const success = req.session.flashSuccess || null;
  req.session.flashError = null;
  req.session.flashSuccess = null;
  const school = db.prepare('SELECT name, logo FROM schools ORDER BY id DESC LIMIT 1').get() || null;
  res.render('auth/login', { error, success, school });
});

// POST /auth/attemptLogin
router.post('/attemptLogin', redirectIfAuthenticated, (req, res) => {
  const { login_id, password } = req.body;

  if (!login_id || !password) {
    req.session.flashError = 'Silakan isi identitas dan kata sandi Anda.';
    return res.redirect('/auth/login');
  }

  const user = db.prepare(`
    SELECT users.*, schools.name AS school_name 
    FROM users 
    LEFT JOIN schools ON users.school_id = schools.id
    WHERE users.identity_number = ? OR users.email = ?
  `).get(login_id.trim(), login_id.trim().toLowerCase());

  if (!user) {
    req.session.flashError = 'Identitas atau kata sandi tidak sesuai. Silakan periksa kembali.';
    return res.redirect('/auth/login');
  }

  const isMatch = bcrypt.compareSync(password, user.password);
  if (!isMatch) {
    req.session.flashError = 'Identitas atau kata sandi tidak sesuai. Silakan periksa kembali.';
    return res.redirect('/auth/login');
  }

  // Set session
  req.session.user = {
    id: user.id,
    name: user.name,
    identity_number: user.identity_number,
    email: user.email,
    role: user.role,
    school_id: user.school_id,
    school_name: user.school_name || 'Sekolah Terdaftar'
  };

  if (user.role === 'guru') {
    return res.redirect('/guru/dashboard');
  } else if (user.role === 'siswa') {
    return res.redirect('/siswa/dashboard');
  } else {
    return res.redirect('/guru/dashboard');
  }
});

// GET /auth/register
router.get('/register', redirectIfAuthenticated, (req, res) => {
  const schools = db.prepare('SELECT * FROM schools ORDER BY name ASC').all();
  const school = db.prepare('SELECT name, logo FROM schools ORDER BY id DESC LIMIT 1').get() || null;
  const error = req.session.flashError || null;
  const success = req.session.flashSuccess || null;
  req.session.flashError = null;
  req.session.flashSuccess = null;
  res.render('auth/register', { schools, school, error, success });
});

// POST /auth/attemptRegister
router.post('/attemptRegister', redirectIfAuthenticated, (req, res) => {
  const { name, identity_number, email, password, school_id, new_school_name } = req.body;

  if (!name || !identity_number || !email || !password) {
    req.session.flashError = 'Mohon lengkapi seluruh kolom isian yang diwajibkan.';
    return res.redirect('/auth/register');
  }

  // Cek apakah identity_number atau email sudah digunakan
  const existing = db.prepare('SELECT id FROM users WHERE identity_number = ? OR email = ?').get(identity_number.trim(), email.trim().toLowerCase());
  if (existing) {
    req.session.flashError = 'NIP/NUPTK atau Email sudah terdaftar dalam sistem.';
    return res.redirect('/auth/register');
  }

  let finalSchoolId = null;
  if (school_id === 'other') {
    if (!new_school_name || !new_school_name.trim()) {
      req.session.flashError = 'Silakan masukkan nama sekolah baru Anda.';
      return res.redirect('/auth/register');
    }
    const insertSchool = db.prepare('INSERT OR IGNORE INTO schools (name) VALUES (?)');
    insertSchool.run(new_school_name.trim());
    const schoolRow = db.prepare('SELECT id FROM schools WHERE name = ?').get(new_school_name.trim());
    finalSchoolId = schoolRow.id;
  } else if (school_id) {
    finalSchoolId = parseInt(school_id, 10);
  }

  const passwordHash = bcrypt.hashSync(password, 10);

  db.prepare(`
    INSERT INTO users (school_id, name, identity_number, email, password, role)
    VALUES (?, ?, ?, ?, ?, 'guru')
  `).run(finalSchoolId, name.trim(), identity_number.trim(), email.trim().toLowerCase(), passwordHash);

  req.session.flashSuccess = 'Pendaftaran akun Guru berhasil! Silakan masuk menggunakan akun baru Anda.';
  return res.redirect('/auth/login');
});

// GET /auth/forgot-password
router.get('/forgot-password', (req, res) => {
  const error = req.session.flashError || null;
  const success = req.session.flashSuccess || null;
  req.session.flashError = null;
  req.session.flashSuccess = null;
  res.render('auth/forgot-password', { error, success });
});

// POST /auth/attemptForgotPassword
router.post('/attemptForgotPassword', (req, res) => {
  const { email } = req.body;
  req.session.flashSuccess = `Tautan instruksi pemulihan kata sandi telah dikirim ke ${email || 'email Anda'} (jika terdaftar di sistem). Silakan periksa folder Inbox atau Spam.`;
  return res.redirect('/auth/forgot-password');
});

// GET /auth/privacyPolicy
router.get('/privacyPolicy', (req, res) => {
  res.render('auth/privacy-policy');
});

// GET /auth/logout
router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/auth/login');
  });
});

module.exports = router;

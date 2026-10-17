const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const db = require('../database/db');
const { ensureRole } = require('../middleware/auth');

// Multer storage configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '..', 'public', 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + '-' + file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_'));
  }
});
const upload = multer({ storage: storage, limits: { fileSize: 25 * 1024 * 1024 } });

// All routes in /guru are restricted to role 'guru'
router.use(ensureRole('guru'));

// 1. Dashboard
router.get('/dashboard', (req, res) => {
  const teacherId = req.session.user.id;

  const classes = db.prepare(`
    SELECT classes.*, COUNT(class_students.id) AS student_count
    FROM classes
    LEFT JOIN class_students ON classes.id = class_students.class_id
    WHERE classes.teacher_id = ?
    GROUP BY classes.id
    ORDER BY classes.created_at DESC
  `).all(teacherId);

  const totalClasses = classes.length;
  
  const totalStudents = db.prepare(`
    SELECT COUNT(DISTINCT class_students.student_id) AS count
    FROM class_students
    JOIN classes ON class_students.class_id = classes.id
    WHERE classes.teacher_id = ?
  `).get(teacherId).count;

  const totalAssignments = db.prepare(`
    SELECT COUNT(assignments.id) AS count
    FROM assignments
    JOIN classes ON assignments.class_id = classes.id
    WHERE classes.teacher_id = ?
  `).get(teacherId).count;

  const totalExams = db.prepare(`
    SELECT COUNT(exams.id) AS count
    FROM exams
    JOIN classes ON exams.class_id = classes.id
    WHERE classes.teacher_id = ?
  `).get(teacherId).count;

  const recentJournals = db.prepare(`
    SELECT teaching_journals.*, classes.name AS class_name
    FROM teaching_journals
    JOIN classes ON teaching_journals.class_id = classes.id
    WHERE teaching_journals.teacher_id = ?
    ORDER BY teaching_journals.date DESC, teaching_journals.id DESC
    LIMIT 3
  `).all(teacherId);

  res.render('guru/dashboard', {
    title: 'Dashboard Guru | Oemah Sinau LMS',
    activePage: 'dashboard',
    classes,
    totalClasses,
    totalStudents,
    totalAssignments,
    totalExams,
    recentJournals
  });
});

// Profil Madrasah
router.get('/madrasah', (req, res) => {
  const schoolId = req.session.user.school_id || 1;
  let madrasah = db.prepare('SELECT * FROM schools WHERE id = ?').get(schoolId);
  if (!madrasah) {
    madrasah = db.prepare('SELECT * FROM schools ORDER BY id ASC LIMIT 1').get() || { id: 1, name: 'Madrasah Aliyah Negeri 1 Terpadu' };
  }

  // Ambil seluruh daftar dewan guru yang mengajar di madrasah ini
  const dewanGuru = db.prepare(`
    SELECT users.id, users.name, users.identity_number, users.email, users.created_at,
           (SELECT COUNT(*) FROM classes WHERE classes.teacher_id = users.id) AS total_classes
    FROM users
    WHERE users.role = 'guru' AND (users.school_id = ? OR users.school_id IS NULL)
    ORDER BY users.name ASC
  `).all(schoolId);

  const message = req.session.flashMessage || null;
  req.session.flashMessage = null;

  res.render('guru/madrasah', {
    title: 'Profil Madrasah | Oemah Sinau LMS',
    activePage: 'madrasah',
    madrasah,
    dewanGuru,
    message
  });
});

// Tambah Guru Baru ke Madrasah
router.post('/madrasah/add-teacher', (req, res) => {
  const schoolId = req.session.user.school_id || 1;
  const { name, identity_number, email, password } = req.body;

  if (!name || !identity_number) {
    req.session.flashMessage = { type: 'error', text: 'Nama dan NIP/Identitas guru wajib diisi.' };
    return res.redirect('/guru/madrasah');
  }

  // Cek apakah NIP atau email sudah ada
  const existing = db.prepare('SELECT id FROM users WHERE identity_number = ? OR (email IS NOT NULL AND email = ?)').get(identity_number.trim(), email ? email.trim().toLowerCase() : '');
  if (existing) {
    req.session.flashMessage = { type: 'error', text: 'Guru dengan NIP atau Email tersebut sudah terdaftar di sistem.' };
    return res.redirect('/guru/madrasah');
  }

  const pwd = password && password.trim() ? password.trim() : 'password123';
  const passwordHash = bcrypt.hashSync(pwd, 10);

  db.prepare(`
    INSERT INTO users (school_id, name, identity_number, email, password, role)
    VALUES (?, ?, ?, ?, ?, 'guru')
  `).run(schoolId, name.trim(), identity_number.trim(), email ? email.trim().toLowerCase() : null, passwordHash);

  req.session.flashMessage = { type: 'success', text: `Akun Guru "${name}" berhasil ditambahkan ke madrasah! Sandi awal: ${pwd}` };
  res.redirect('/guru/madrasah');
});

// Khusus Upload / Perbarui Logo Madrasah
router.post('/madrasah/upload-logo', upload.single('logo_file'), (req, res) => {
  const schoolId = req.session.user.school_id || 1;
  if (!req.file) {
    req.session.flashMessage = { type: 'error', text: 'Silakan pilih berkas gambar logo terlebih dahulu (format PNG/JPG/WEBP).' };
    return res.redirect('/guru/madrasah');
  }

  const logoPath = '/uploads/' + req.file.filename;
  db.prepare('UPDATE schools SET logo = ? WHERE id = ?').run(logoPath, schoolId);

  if (req.session.user) {
    req.session.user.school_logo = logoPath;
  }

  req.session.flashMessage = { type: 'success', text: 'Alhamdulillah! Logo resmi madrasah berhasil diperbarui.' };
  res.redirect('/guru/madrasah');
});

router.post('/madrasah/update', upload.single('logo_file'), (req, res) => {
  const schoolId = req.session.user.school_id || 1;
  const {
    name, nsm, npsn, jenjang, akreditasi,
    headmaster, headmaster_nip, address,
    phone, email, website, vision, mission
  } = req.body;

  let logoPath = null;
  if (req.file) {
    logoPath = '/uploads/' + req.file.filename;
  }

  db.prepare(`
    UPDATE schools SET
      name = ?,
      nsm = ?,
      npsn = ?,
      jenjang = ?,
      akreditasi = ?,
      headmaster = ?,
      headmaster_nip = ?,
      address = ?,
      phone = ?,
      email = ?,
      website = ?,
      vision = ?,
      mission = ?,
      logo = COALESCE(?, logo)
    WHERE id = ?
  `).run(
    name.trim(),
    nsm ? nsm.trim() : null,
    npsn ? npsn.trim() : null,
    jenjang ? jenjang.trim() : null,
    akreditasi ? akreditasi.trim() : null,
    headmaster ? headmaster.trim() : null,
    headmaster_nip ? headmaster_nip.trim() : null,
    address ? address.trim() : null,
    phone ? phone.trim() : null,
    email ? email.trim() : null,
    website ? website.trim() : null,
    vision ? vision.trim() : null,
    mission ? mission.trim() : null,
    logoPath,
    schoolId
  );

  req.session.user.school_name = name.trim();
  req.session.flashMessage = { type: 'success', text: 'Profil Madrasah berhasil diperbarui!' };
  res.redirect('/guru/madrasah');
});

// 2. Classes Management
router.get('/classes', (req, res) => {
  const teacherId = req.session.user.id;
  const classes = db.prepare(`
    SELECT classes.*, COUNT(class_students.id) AS student_count
    FROM classes
    LEFT JOIN class_students ON classes.id = class_students.class_id
    WHERE classes.teacher_id = ?
    GROUP BY classes.id
    ORDER BY classes.created_at DESC
  `).all(teacherId);

  const message = req.session.flashMessage || null;
  req.session.flashMessage = null;

  res.render('guru/classes', {
    title: 'Ruang Kelas Saya | Oemah Sinau LMS',
    activePage: 'classes',
    classes,
    message
  });
});

router.post('/classes/create', (req, res) => {
  const teacherId = req.session.user.id;
  const schoolId = req.session.user.school_id;
  const { name, subject, grade, description } = req.body;

  // Generate random 6-character unique code e.g. "OS-7X9B"
  const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  const code = (req.body.code && req.body.code.trim()) ? req.body.code.trim().toUpperCase() : `OS-${randomSuffix}`;

  try {
    db.prepare(`
      INSERT INTO classes (teacher_id, school_id, name, subject, grade, code, description)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(teacherId, schoolId, name.trim(), subject.trim(), grade.trim(), code, description ? description.trim() : '');
    req.session.flashMessage = { type: 'success', text: `Kelas "${name}" berhasil dibuat dengan kode: ${code}` };
  } catch (err) {
    req.session.flashMessage = { type: 'error', text: 'Gagal membuat kelas. Pastikan kode kelas unik.' };
  }
  res.redirect('/guru/classes');
});

// Update Class Info
router.post('/classes/:id/update', (req, res) => {
  const classId = req.params.id;
  const teacherId = req.session.user.id;
  const { name, subject, grade, code, description } = req.body;

  const currentClass = db.prepare('SELECT * FROM classes WHERE id = ? AND teacher_id = ?').get(classId, teacherId);
  if (!currentClass) {
    req.session.flashMessage = { type: 'error', text: 'Kelas tidak ditemukan atau Anda tidak berwenang.' };
    return res.redirect('/guru/classes');
  }

  const newCode = (code && code.trim()) ? code.trim().toUpperCase() : currentClass.code;

  try {
    db.prepare(`
      UPDATE classes SET
        name = ?, subject = ?, grade = ?, code = ?, description = ?
      WHERE id = ? AND teacher_id = ?
    `).run(name.trim(), subject.trim(), grade.trim(), newCode, description ? description.trim() : '', classId, teacherId);
    req.session.flashMessage = { type: 'success', text: `Informasi kelas "${name}" berhasil diperbarui!` };
  } catch (err) {
    req.session.flashMessage = { type: 'error', text: 'Gagal memperbarui kelas. Kode kelas mungkin sudah dipakai.' };
  }
  res.redirect(`/guru/classes/${classId}`);
});

// Delete Class completely
router.post('/classes/:id/delete', (req, res) => {
  const classId = req.params.id;
  const teacherId = req.session.user.id;

  const currentClass = db.prepare('SELECT * FROM classes WHERE id = ? AND teacher_id = ?').get(classId, teacherId);
  if (!currentClass) {
    req.session.flashMessage = { type: 'error', text: 'Kelas tidak ditemukan atau Anda tidak berwenang.' };
    return res.redirect('/guru/classes');
  }

  try {
    db.prepare('DELETE FROM classes WHERE id = ? AND teacher_id = ?').run(classId, teacherId);
    req.session.flashMessage = { type: 'success', text: `Ruang Kelas "${currentClass.name}" berhasil dihapus permanen.` };
  } catch (err) {
    req.session.flashMessage = { type: 'error', text: 'Gagal menghapus ruang kelas: ' + err.message };
  }
  res.redirect('/guru/classes');
});

router.get('/classes/:id', (req, res) => {
  const classId = req.params.id;
  const teacherId = req.session.user.id;

  const currentClass = db.prepare('SELECT * FROM classes WHERE id = ? AND teacher_id = ?').get(classId, teacherId);
  if (!currentClass) {
    return res.status(404).send('Kelas tidak ditemukan.');
  }

  const tab = req.query.tab || 'materials';

  const materials = db.prepare('SELECT * FROM materials WHERE class_id = ? ORDER BY meeting_number ASC, id ASC').all(classId);
  const assignments = db.prepare(`
    SELECT assignments.*, COUNT(assignment_submissions.id) AS submission_count
    FROM assignments
    LEFT JOIN assignment_submissions ON assignments.id = assignment_submissions.assignment_id
    WHERE assignments.class_id = ?
    GROUP BY assignments.id
    ORDER BY assignments.deadline DESC
  `).all(classId);

  const exams = db.prepare(`
    SELECT exams.*, COUNT(exam_questions.id) AS question_count, COUNT(exam_sessions.id) AS student_attempt_count
    FROM exams
    LEFT JOIN exam_questions ON exams.id = exam_questions.exam_id
    LEFT JOIN exam_sessions ON exams.id = exam_sessions.exam_id
    WHERE exams.class_id = ?
    GROUP BY exams.id
    ORDER BY exams.created_at DESC
  `).all(classId);

  const students = db.prepare(`
    SELECT users.id, users.name, users.identity_number, users.email, class_students.joined_at
    FROM class_students
    JOIN users ON class_students.student_id = users.id
    WHERE class_students.class_id = ?
    ORDER BY users.name ASC
  `).all(classId);

  const attendances = db.prepare(`
    SELECT attendances.*, COUNT(attendance_records.id) AS present_count
    FROM attendances
    LEFT JOIN attendance_records ON attendances.id = attendance_records.attendance_id AND attendance_records.status = 'Hadir'
    WHERE attendances.class_id = ?
    GROUP BY attendances.id
    ORDER BY attendances.date DESC, attendances.id DESC
  `).all(classId);

  const discussions = db.prepare(`
    SELECT forum_discussions.*, users.name AS author_name, users.role AS author_role,
      (SELECT COUNT(*) FROM forum_replies WHERE forum_replies.discussion_id = forum_discussions.id) AS reply_count
    FROM forum_discussions
    JOIN users ON forum_discussions.user_id = users.id
    WHERE forum_discussions.class_id = ?
    ORDER BY forum_discussions.created_at DESC
  `).all(classId);

  const message = req.session.flashMessage || null;
  req.session.flashMessage = null;

  res.render('guru/class-detail', {
    title: `${currentClass.name} | Oemah Sinau LMS`,
    activePage: 'classes',
    currentClass,
    tab,
    materials,
    assignments,
    exams,
    students,
    attendances,
    discussions,
    message
  });
});

// Add student to class
router.post('/classes/:id/students/add', (req, res) => {
  const classId = req.params.id;
  const teacherId = req.session.user.id;
  const { name, identity_number, email } = req.body;

  const currentClass = db.prepare('SELECT * FROM classes WHERE id = ? AND teacher_id = ?').get(classId, teacherId);
  if (!currentClass) return res.status(404).send('Kelas tidak ditemukan.');

  let student = db.prepare('SELECT id FROM users WHERE identity_number = ?').get(identity_number.trim());
  if (!student) {
    const defaultPasswordHash = bcrypt.hashSync('password123', 10);
    const insertRes = db.prepare(`
      INSERT INTO users (school_id, name, identity_number, email, password, role)
      VALUES (?, ?, ?, ?, ?, 'siswa')
    `).run(currentClass.school_id, name.trim(), identity_number.trim(), email ? email.trim() : null, defaultPasswordHash);
    student = { id: insertRes.lastInsertRowid };
  }

  try {
    db.prepare('INSERT OR IGNORE INTO class_students (class_id, student_id) VALUES (?, ?)').run(classId, student.id);
    req.session.flashMessage = { type: 'success', text: `Siswa "${name}" berhasil ditambahkan ke kelas.` };
  } catch (err) {
    req.session.flashMessage = { type: 'error', text: 'Gagal menambahkan siswa.' };
  }
  res.redirect(`/guru/classes/${classId}?tab=students`);
});

// Remove student from class
router.post('/classes/:id/students/:studentId/remove', (req, res) => {
  const { id: classId, studentId } = req.params;
  db.prepare('DELETE FROM class_students WHERE class_id = ? AND student_id = ?').run(classId, studentId);
  req.session.flashMessage = { type: 'success', text: 'Siswa berhasil dikeluarkan dari kelas.' };
  res.redirect(`/guru/classes/${classId}?tab=students`);
});

// 3. Materials Management
router.post('/classes/:id/materials/create', upload.single('attachment'), (req, res) => {
  const classId = req.params.id;
  const { title, meeting_number, content, video_url } = req.body;

  let attachmentName = null;
  let attachmentPath = null;
  if (req.file) {
    attachmentName = req.file.originalname;
    attachmentPath = '/uploads/' + req.file.filename;
  }

  // Convert YouTube, Canva Presentation, or Google Slides URLs to interactive embed format
  let formattedVideoUrl = video_url ? video_url.trim() : null;
  if (formattedVideoUrl) {
    const ytMatch = formattedVideoUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
    if (ytMatch && ytMatch[1]) {
      formattedVideoUrl = `https://www.youtube.com/embed/${ytMatch[1]}`;
    } else if (formattedVideoUrl.includes('canva.com/design/')) {
      formattedVideoUrl = formattedVideoUrl.replace(/\/edit(\?.*)?$/, '/view');
      formattedVideoUrl = formattedVideoUrl.replace(/\/watch(\?.*)?$/, '/view');
      if (!formattedVideoUrl.includes('embed')) {
        formattedVideoUrl = formattedVideoUrl.split('?')[0] + '?embed';
      }
    } else if (formattedVideoUrl.includes('docs.google.com/presentation')) {
      formattedVideoUrl = formattedVideoUrl.replace(/\/pub(\?.*)?$/, '/embed').replace(/\/edit(\?.*)?$/, '/embed');
      if (!formattedVideoUrl.includes('/embed')) {
        formattedVideoUrl = formattedVideoUrl.replace(/\/$/, '') + '/embed';
      }
    }
  }

  db.prepare(`
    INSERT INTO materials (class_id, title, meeting_number, content, attachment_name, attachment_path, video_url)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(classId, title.trim(), meeting_number || 1, content ? content.trim() : '', attachmentName, attachmentPath, formattedVideoUrl);

  req.session.flashMessage = { type: 'success', text: 'Materi pembelajaran berhasil ditambahkan.' };
  res.redirect(`/guru/classes/${classId}?tab=materials`);
});

// Update Material
router.post('/classes/:id/materials/:materialId/update', upload.single('attachment'), (req, res) => {
  const { id: classId, materialId } = req.params;
  const { title, meeting_number, content, video_url } = req.body;

  let attachmentName = null;
  let attachmentPath = null;
  if (req.file) {
    attachmentName = req.file.originalname;
    attachmentPath = '/uploads/' + req.file.filename;
  }

  // Convert YouTube, Canva Presentation, or Google Slides URLs to interactive embed format
  let formattedVideoUrl = video_url ? video_url.trim() : null;
  if (formattedVideoUrl) {
    const ytMatch = formattedVideoUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
    if (ytMatch && ytMatch[1]) {
      formattedVideoUrl = `https://www.youtube.com/embed/${ytMatch[1]}`;
    } else if (formattedVideoUrl.includes('canva.com/design/')) {
      formattedVideoUrl = formattedVideoUrl.replace(/\/edit(\?.*)?$/, '/view');
      formattedVideoUrl = formattedVideoUrl.replace(/\/watch(\?.*)?$/, '/view');
      if (!formattedVideoUrl.includes('embed')) {
        formattedVideoUrl = formattedVideoUrl.split('?')[0] + '?embed';
      }
    } else if (formattedVideoUrl.includes('docs.google.com/presentation')) {
      formattedVideoUrl = formattedVideoUrl.replace(/\/pub(\?.*)?$/, '/embed').replace(/\/edit(\?.*)?$/, '/embed');
      if (!formattedVideoUrl.includes('/embed')) {
        formattedVideoUrl = formattedVideoUrl.replace(/\/$/, '') + '/embed';
      }
    }
  }

  if (attachmentPath) {
    db.prepare(`
      UPDATE materials SET
        title = ?,
        meeting_number = ?,
        content = ?,
        video_url = ?,
        attachment_name = ?,
        attachment_path = ?
      WHERE id = ? AND class_id = ?
    `).run(title.trim(), meeting_number || 1, content ? content.trim() : '', formattedVideoUrl, attachmentName, attachmentPath, materialId, classId);
  } else {
    db.prepare(`
      UPDATE materials SET
        title = ?,
        meeting_number = ?,
        content = ?,
        video_url = ?
      WHERE id = ? AND class_id = ?
    `).run(title.trim(), meeting_number || 1, content ? content.trim() : '', formattedVideoUrl, materialId, classId);
  }

  req.session.flashMessage = { type: 'success', text: 'Materi pembelajaran berhasil diperbarui.' };
  res.redirect(`/guru/classes/${classId}?tab=materials`);
});

router.post('/classes/:id/materials/:materialId/delete', (req, res) => {
  const { id: classId, materialId } = req.params;
  db.prepare('DELETE FROM materials WHERE id = ? AND class_id = ?').run(materialId, classId);
  req.session.flashMessage = { type: 'success', text: 'Materi berhasil dihapus.' };
  res.redirect(`/guru/classes/${classId}?tab=materials`);
});

// 4. Assignments Management
router.get('/assignments', (req, res) => {
  const teacherId = req.session.user.id;
  const assignments = db.prepare(`
    SELECT assignments.*, classes.name AS class_name, classes.grade AS class_grade,
      COUNT(assignment_submissions.id) AS submission_count,
      (SELECT COUNT(*) FROM class_students WHERE class_students.class_id = assignments.class_id) AS total_students
    FROM assignments
    JOIN classes ON assignments.class_id = classes.id
    LEFT JOIN assignment_submissions ON assignments.id = assignment_submissions.assignment_id
    WHERE classes.teacher_id = ?
    GROUP BY assignments.id
    ORDER BY assignments.deadline DESC
  `).all(teacherId);

  const classes = db.prepare('SELECT id, name, grade FROM classes WHERE teacher_id = ?').all(teacherId);
  const message = req.session.flashMessage || null;
  req.session.flashMessage = null;

  res.render('guru/assignments', {
    title: 'Kelola Tugas | Oemah Sinau LMS',
    activePage: 'assignments',
    assignments,
    classes,
    message
  });
});

router.post('/classes/:id/assignments/create', upload.single('attachment'), (req, res) => {
  const classId = req.params.id;
  const { title, instructions, deadline } = req.body;

  let attachmentName = null;
  let attachmentPath = null;
  if (req.file) {
    attachmentName = req.file.originalname;
    attachmentPath = '/uploads/' + req.file.filename;
  }

  db.prepare(`
    INSERT INTO assignments (class_id, title, instructions, deadline, attachment_name, attachment_path)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(classId, title.trim(), instructions.trim(), deadline, attachmentName, attachmentPath);

  req.session.flashMessage = { type: 'success', text: 'Tugas baru berhasil diterbitkan untuk siswa.' };
  res.redirect(`/guru/classes/${classId}?tab=assignments`);
});

// Review submissions for an assignment
router.get('/assignments/:id/review', (req, res) => {
  const assignmentId = req.params.id;
  const teacherId = req.session.user.id;

  const assignment = db.prepare(`
    SELECT assignments.*, classes.name AS class_name, classes.grade AS class_grade
    FROM assignments
    JOIN classes ON assignments.class_id = classes.id
    WHERE assignments.id = ? AND classes.teacher_id = ?
  `).get(assignmentId, teacherId);

  if (!assignment) return res.status(404).send('Tugas tidak ditemukan.');

  const submissions = db.prepare(`
    SELECT users.id AS student_id, users.name AS student_name, users.identity_number,
           assignment_submissions.id AS submission_id,
           assignment_submissions.submission_text,
           assignment_submissions.file_name,
           assignment_submissions.file_path,
           assignment_submissions.score,
           assignment_submissions.feedback,
           assignment_submissions.submitted_at
    FROM class_students
    JOIN users ON class_students.student_id = users.id
    LEFT JOIN assignment_submissions ON class_students.student_id = assignment_submissions.student_id AND assignment_submissions.assignment_id = ?
    WHERE class_students.class_id = ?
    ORDER BY users.name ASC
  `).all(assignmentId, assignment.class_id);

  const message = req.session.flashMessage || null;
  req.session.flashMessage = null;

  res.render('guru/assignment-review', {
    title: `Penilaian: ${assignment.title} | Oemah Sinau LMS`,
    activePage: 'assignments',
    assignment,
    submissions,
    message
  });
});

router.post('/assignments/:id/grade', (req, res) => {
  const assignmentId = req.params.id;
  const { student_id, score, feedback } = req.body;

  const numericScore = parseFloat(score);

  db.prepare(`
    UPDATE assignment_submissions
    SET score = ?, feedback = ?, graded_at = CURRENT_TIMESTAMP
    WHERE assignment_id = ? AND student_id = ?
  `).run(isNaN(numericScore) ? null : numericScore, feedback ? feedback.trim() : '', assignmentId, student_id);

  req.session.flashMessage = { type: 'success', text: 'Nilai dan catatan evaluasi berhasil disimpan!' };
  res.redirect(`/guru/assignments/${assignmentId}/review`);
});

// 5. CBT Exams Management
router.get('/exams', (req, res) => {
  const teacherId = req.session.user.id;

  const exams = db.prepare(`
    SELECT exams.*, classes.name AS class_name, classes.grade AS class_grade,
      COUNT(DISTINCT exam_questions.id) AS question_count,
      COUNT(DISTINCT exam_sessions.id) AS student_attempt_count
    FROM exams
    JOIN classes ON exams.class_id = classes.id
    LEFT JOIN exam_questions ON exams.id = exam_questions.exam_id
    LEFT JOIN exam_sessions ON exams.id = exam_sessions.exam_id
    WHERE classes.teacher_id = ?
    GROUP BY exams.id
    ORDER BY exams.created_at DESC
  `).all(teacherId);

  const classes = db.prepare('SELECT id, name, grade FROM classes WHERE teacher_id = ?').all(teacherId);
  const message = req.session.flashMessage || null;
  req.session.flashMessage = null;

  res.render('guru/exams', {
    title: 'Ujian Online (CBT) | Oemah Sinau LMS',
    activePage: 'exams',
    exams,
    classes,
    message
  });
});

router.get('/exams/create', (req, res) => {
  const teacherId = req.session.user.id;
  const classes = db.prepare('SELECT id, name, grade FROM classes WHERE teacher_id = ?').all(teacherId);
  res.render('guru/exam-create', {
    title: 'Buat Ujian CBT Baru | Oemah Sinau LMS',
    activePage: 'exams',
    classes
  });
});

router.post('/exams/create', (req, res) => {
  const {
    class_id, title, description, duration_minutes, start_time, end_time,
    randomize_questions, randomize_options, fullscreen_required, tab_switch_limit
  } = req.body;

  const resInsert = db.prepare(`
    INSERT INTO exams (
      class_id, title, description, duration_minutes, start_time, end_time,
      randomize_questions, randomize_options, fullscreen_required, tab_switch_limit,
      auto_submit_on_timeout, show_score_to_student, is_active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, 1)
  `).run(
    class_id,
    title.trim(),
    description ? description.trim() : '',
    parseInt(duration_minutes, 10) || 60,
    start_time,
    end_time,
    randomize_questions ? 1 : 0,
    randomize_options ? 1 : 0,
    fullscreen_required ? 1 : 0,
    parseInt(tab_switch_limit, 10) || 3
  );

  req.session.flashMessage = { type: 'success', text: 'Ujian berhasil dibuat. Silakan tambahkan butir-butir soal di bawah.' };
  res.redirect(`/guru/exams/${resInsert.lastInsertRowid}/questions`);
});

router.get('/exams/:id/questions', (req, res) => {
  const examId = req.params.id;
  const teacherId = req.session.user.id;

  const exam = db.prepare(`
    SELECT exams.*, classes.name AS class_name
    FROM exams
    JOIN classes ON exams.class_id = classes.id
    WHERE exams.id = ? AND classes.teacher_id = ?
  `).get(examId, teacherId);

  if (!exam) return res.status(404).send('Ujian tidak ditemukan.');

  const questions = db.prepare('SELECT * FROM exam_questions WHERE exam_id = ? ORDER BY id ASC').all(examId);
  const message = req.session.flashMessage || null;
  req.session.flashMessage = null;

  res.render('guru/exam-questions', {
    title: `Kelola Soal: ${exam.title} | Oemah Sinau LMS`,
    activePage: 'exams',
    exam,
    questions,
    message
  });
});

router.post('/exams/:id/questions/add', (req, res) => {
  const examId = req.params.id;
  const { question_text, question_type, option_a, option_b, option_c, option_d, option_e, correct_answer, score_weight } = req.body;

  db.prepare(`
    INSERT INTO exam_questions (
      exam_id, question_text, question_type, option_a, option_b, option_c, option_d, option_e, correct_answer, score_weight
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    examId,
    question_text.trim(),
    question_type || 'pg',
    option_a ? option_a.trim() : null,
    option_b ? option_b.trim() : null,
    option_c ? option_c.trim() : null,
    option_d ? option_d.trim() : null,
    option_e ? option_e.trim() : null,
    correct_answer || null,
    parseFloat(score_weight) || 10.0
  );

  req.session.flashMessage = { type: 'success', text: 'Butir soal berhasil ditambahkan ke ujian!' };
  res.redirect(`/guru/exams/${examId}/questions`);
});

router.post('/exams/:id/questions/:qId/delete', (req, res) => {
  const { id: examId, qId } = req.params;
  db.prepare('DELETE FROM exam_questions WHERE id = ? AND exam_id = ?').run(qId, examId);
  req.session.flashMessage = { type: 'success', text: 'Soal berhasil dihapus.' };
  res.redirect(`/guru/exams/${examId}/questions`);
});

router.get('/exams/:id/results', (req, res) => {
  const examId = req.params.id;
  const teacherId = req.session.user.id;

  const exam = db.prepare(`
    SELECT exams.*, classes.name AS class_name
    FROM exams
    JOIN classes ON exams.class_id = classes.id
    WHERE exams.id = ? AND classes.teacher_id = ?
  `).get(examId, teacherId);

  if (!exam) return res.status(404).send('Ujian tidak ditemukan.');

  const results = db.prepare(`
    SELECT users.name AS student_name, users.identity_number,
           exam_sessions.id AS session_id,
           exam_sessions.start_time,
           exam_sessions.end_time,
           exam_sessions.tab_switch_count,
           exam_sessions.status,
           exam_sessions.total_score
    FROM class_students
    JOIN users ON class_students.student_id = users.id
    LEFT JOIN exam_sessions ON class_students.student_id = exam_sessions.student_id AND exam_sessions.exam_id = ?
    WHERE class_students.class_id = ?
    ORDER BY exam_sessions.total_score DESC, users.name ASC
  `).all(examId, exam.class_id);

  res.render('guru/exam-results', {
    title: `Hasil & Rekap Nilai Ujian: ${exam.title} | Oemah Sinau LMS`,
    activePage: 'exams',
    exam,
    results
  });
});

// 6. Attendances Management
router.get('/attendances', (req, res) => {
  const teacherId = req.session.user.id;

  const attendances = db.prepare(`
    SELECT attendances.*, classes.name AS class_name, classes.grade AS class_grade,
      COUNT(attendance_records.id) AS total_recorded,
      SUM(CASE WHEN attendance_records.status = 'Hadir' THEN 1 ELSE 0 END) AS hadir_count
    FROM attendances
    JOIN classes ON attendances.class_id = classes.id
    LEFT JOIN attendance_records ON attendances.id = attendance_records.attendance_id
    WHERE classes.teacher_id = ?
    GROUP BY attendances.id
    ORDER BY attendances.date DESC, attendances.id DESC
  `).all(teacherId);

  const classes = db.prepare('SELECT id, name, grade FROM classes WHERE teacher_id = ?').all(teacherId);
  const message = req.session.flashMessage || null;
  req.session.flashMessage = null;

  res.render('guru/attendances', {
    title: 'Absensi Kelas Digital | Oemah Sinau LMS',
    activePage: 'attendances',
    attendances,
    classes,
    message
  });
});

router.post('/classes/:id/attendances/create', (req, res) => {
  const classId = req.params.id;
  const { title, date, start_time, end_time } = req.body;

  db.prepare(`
    INSERT INTO attendances (class_id, title, date, start_time, end_time)
    VALUES (?, ?, ?, ?, ?)
  `).run(classId, title.trim(), date, start_time, end_time);

  req.session.flashMessage = { type: 'success', text: 'Sesi absensi digital berhasil dibuka.' };
  res.redirect(`/guru/attendances`);
});

router.get('/attendances/:id', (req, res) => {
  const attendanceId = req.params.id;
  const teacherId = req.session.user.id;

  const attendance = db.prepare(`
    SELECT attendances.*, classes.name AS class_name, classes.grade AS class_grade, classes.id AS class_id
    FROM attendances
    JOIN classes ON attendances.class_id = classes.id
    WHERE attendances.id = ? AND classes.teacher_id = ?
  `).get(attendanceId, teacherId);

  if (!attendance) return res.status(404).send('Sesi absensi tidak ditemukan.');

  const records = db.prepare(`
    SELECT users.id AS student_id, users.name AS student_name, users.identity_number,
           attendance_records.status, attendance_records.notes, attendance_records.recorded_at
    FROM class_students
    JOIN users ON class_students.student_id = users.id
    LEFT JOIN attendance_records ON class_students.student_id = attendance_records.student_id AND attendance_records.attendance_id = ?
    WHERE class_students.class_id = ?
    ORDER BY users.name ASC
  `).all(attendanceId, attendance.class_id);

  const message = req.session.flashMessage || null;
  req.session.flashMessage = null;

  res.render('guru/attendance-detail', {
    title: `Presensi: ${attendance.title} | Oemah Sinau LMS`,
    activePage: 'attendances',
    attendance,
    records,
    message
  });
});

router.post('/attendances/:id/update', (req, res) => {
  const attendanceId = req.params.id;
  const { student_id, status, notes } = req.body;

  db.prepare(`
    INSERT INTO attendance_records (attendance_id, student_id, status, notes, recorded_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(attendance_id, student_id) DO UPDATE SET
      status = excluded.status,
      notes = excluded.notes,
      recorded_at = CURRENT_TIMESTAMP
  `).run(attendanceId, student_id, status, notes ? notes.trim() : null);

  req.session.flashMessage = { type: 'success', text: 'Status kehadiran siswa berhasil diperbarui.' };
  res.redirect(`/guru/attendances/${attendanceId}`);
});

// 7. Teaching Journal
router.get('/journal', (req, res) => {
  const teacherId = req.session.user.id;

  const journals = db.prepare(`
    SELECT teaching_journals.*, classes.name AS class_name, classes.grade AS class_grade
    FROM teaching_journals
    JOIN classes ON teaching_journals.class_id = classes.id
    WHERE teaching_journals.teacher_id = ?
    ORDER BY teaching_journals.date DESC, teaching_journals.id DESC
  `).all(teacherId);

  const classes = db.prepare('SELECT id, name, grade FROM classes WHERE teacher_id = ?').all(teacherId);
  const message = req.session.flashMessage || null;
  req.session.flashMessage = null;

  res.render('guru/journal', {
    title: 'Jurnal Mengajar Guru | Oemah Sinau LMS',
    activePage: 'journal',
    journals,
    classes,
    message
  });
});

router.post('/journal/create', (req, res) => {
  const teacherId = req.session.user.id;
  const { class_id, date, period, topic, activities, present_count, absent_count, notes } = req.body;

  db.prepare(`
    INSERT INTO teaching_journals (teacher_id, class_id, date, period, topic, activities, present_count, absent_count, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    teacherId,
    class_id,
    date,
    period.trim(),
    topic.trim(),
    activities.trim(),
    parseInt(present_count, 10) || 0,
    parseInt(absent_count, 10) || 0,
    notes ? notes.trim() : ''
  );

  req.session.flashMessage = { type: 'success', text: 'Catatan Jurnal Mengajar berhasil disimpan.' };
  res.redirect('/guru/journal');
});

// 8. Grades & Report
router.get('/grades', (req, res) => {
  const teacherId = req.session.user.id;
  const classes = db.prepare('SELECT id, name, grade FROM classes WHERE teacher_id = ?').all(teacherId);

  const selectedClassId = req.query.class_id || (classes[0] ? classes[0].id : null);
  let gradeData = [];
  let currentClass = null;

  if (selectedClassId) {
    currentClass = classes.find(c => c.id == selectedClassId);

    // Calculate assignments avg, CBT exam avg, and final score for all students in class
    const students = db.prepare(`
      SELECT users.id, users.name, users.identity_number
      FROM class_students
      JOIN users ON class_students.student_id = users.id
      WHERE class_students.class_id = ?
      ORDER BY users.name ASC
    `).all(selectedClassId);

    gradeData = students.map(st => {
      const assignmentAvg = db.prepare(`
        SELECT AVG(assignment_submissions.score) AS avg_score
        FROM assignment_submissions
        JOIN assignments ON assignment_submissions.assignment_id = assignments.id
        WHERE assignments.class_id = ? AND assignment_submissions.student_id = ?
      `).get(selectedClassId, st.id).avg_score || 0;

      const examAvg = db.prepare(`
        SELECT AVG(exam_sessions.total_score) AS avg_score
        FROM exam_sessions
        JOIN exams ON exam_sessions.exam_id = exams.id
        WHERE exams.class_id = ? AND exam_sessions.student_id = ?
      `).get(selectedClassId, st.id).avg_score || 0;

      const totalAttendances = db.prepare('SELECT COUNT(*) AS count FROM attendances WHERE class_id = ?').get(selectedClassId).count || 1;
      const presentCount = db.prepare(`
        SELECT COUNT(*) AS count
        FROM attendance_records
        JOIN attendances ON attendance_records.attendance_id = attendances.id
        WHERE attendances.class_id = ? AND attendance_records.student_id = ? AND attendance_records.status = 'Hadir'
      `).get(selectedClassId, st.id).count || 0;

      const attendancePct = Math.round((presentCount / totalAttendances) * 100);
      const finalScore = Math.round((assignmentAvg * 0.3) + (examAvg * 0.5) + (attendancePct * 0.2));

      return {
        student: st,
        assignmentAvg: Math.round(assignmentAvg),
        examAvg: Math.round(examAvg),
        attendancePct,
        finalScore
      };
    });
  }

  res.render('guru/grades', {
    title: 'Rekap Nilai Siswa | Oemah Sinau LMS',
    activePage: 'grades',
    classes,
    selectedClassId,
    currentClass,
    gradeData
  });
});

// Print preview for grades
router.get('/grades/:classId/print', (req, res) => {
  const classId = req.params.classId;
  const teacherId = req.session.user.id;

  const currentClass = db.prepare('SELECT * FROM classes WHERE id = ? AND teacher_id = ?').get(classId, teacherId);
  if (!currentClass) return res.status(404).send('Kelas tidak ditemukan.');

  const students = db.prepare(`
    SELECT users.id, users.name, users.identity_number
    FROM class_students
    JOIN users ON class_students.student_id = users.id
    WHERE class_students.class_id = ?
    ORDER BY users.name ASC
  `).all(classId);

  const gradeData = students.map(st => {
    const assignmentAvg = db.prepare(`
      SELECT AVG(assignment_submissions.score) AS avg_score
      FROM assignment_submissions
      JOIN assignments ON assignment_submissions.assignment_id = assignments.id
      WHERE assignments.class_id = ? AND assignment_submissions.student_id = ?
    `).get(classId, st.id).avg_score || 0;

    const examAvg = db.prepare(`
      SELECT AVG(exam_sessions.total_score) AS avg_score
      FROM exam_sessions
      JOIN exams ON exam_sessions.exam_id = exams.id
      WHERE exams.class_id = ? AND exam_sessions.student_id = ?
    `).get(classId, st.id).avg_score || 0;

    const totalAttendances = db.prepare('SELECT COUNT(*) AS count FROM attendances WHERE class_id = ?').get(classId).count || 1;
    const presentCount = db.prepare(`
      SELECT COUNT(*) AS count
      FROM attendance_records
      JOIN attendances ON attendance_records.attendance_id = attendances.id
      WHERE attendances.class_id = ? AND attendance_records.student_id = ? AND attendance_records.status = 'Hadir'
    `).get(classId, st.id).count || 0;

    const attendancePct = Math.round((presentCount / totalAttendances) * 100);
    const finalScore = Math.round((assignmentAvg * 0.3) + (examAvg * 0.5) + (attendancePct * 0.2));

    return {
      student: st,
      assignmentAvg: Math.round(assignmentAvg),
      examAvg: Math.round(examAvg),
      attendancePct,
      finalScore
    };
  });

  res.render('guru/grades-print', {
    title: `Cetak Rekap Nilai - ${currentClass.name}`,
    currentClass,
    gradeData
  });
});

// 9. Forum Discussions
router.post('/classes/:id/forum/create', (req, res) => {
  const classId = req.params.id;
  const userId = req.session.user.id;
  const { title, content } = req.body;

  db.prepare(`
    INSERT INTO forum_discussions (class_id, user_id, title, content)
    VALUES (?, ?, ?, ?)
  `).run(classId, userId, title.trim(), content.trim());

  req.session.flashMessage = { type: 'success', text: 'Topik diskusi baru berhasil diterbitkan.' };
  res.redirect(`/guru/classes/${classId}?tab=forum`);
});

router.post('/forum/:id/reply', (req, res) => {
  const discussionId = req.params.id;
  const userId = req.session.user.id;
  const { reply, class_id } = req.body;

  db.prepare(`
    INSERT INTO forum_replies (discussion_id, user_id, reply)
    VALUES (?, ?, ?)
  `).run(discussionId, userId, reply.trim());

  res.redirect(`/guru/classes/${class_id}?tab=forum`);
});

module.exports = router;

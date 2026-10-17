const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../database/db');
const { ensureRole } = require('../middleware/auth');

// Multer storage configuration for student uploads
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

// All routes in /siswa are restricted to role 'siswa'
router.use(ensureRole('siswa'));

// 1. Dashboard
router.get('/dashboard', (req, res) => {
  const studentId = req.session.user.id;

  const classes = db.prepare(`
    SELECT classes.*, users.name AS teacher_name,
      (SELECT COUNT(*) FROM materials WHERE materials.class_id = classes.id) AS total_materials,
      (SELECT COUNT(*) FROM assignments WHERE assignments.class_id = classes.id) AS total_assignments,
      (SELECT COUNT(*) FROM exams WHERE exams.class_id = classes.id) AS total_exams
    FROM class_students
    JOIN classes ON class_students.class_id = classes.id
    JOIN users ON classes.teacher_id = users.id
    WHERE class_students.student_id = ?
    ORDER BY class_students.joined_at DESC
  `).all(studentId);

  const pendingAssignments = db.prepare(`
    SELECT assignments.*, classes.name AS class_name,
      assignment_submissions.id AS submission_id,
      assignment_submissions.score
    FROM assignments
    JOIN classes ON assignments.class_id = classes.id
    JOIN class_students ON classes.id = class_students.class_id
    LEFT JOIN assignment_submissions ON assignments.id = assignment_submissions.assignment_id AND assignment_submissions.student_id = ?
    WHERE class_students.student_id = ? AND assignments.deadline >= datetime('now', 'localtime')
    ORDER BY assignments.deadline ASC
    LIMIT 5
  `).all(studentId, studentId);

  const upcomingExams = db.prepare(`
    SELECT exams.*, classes.name AS class_name,
      exam_sessions.status AS session_status,
      exam_sessions.total_score
    FROM exams
    JOIN classes ON exams.class_id = classes.id
    JOIN class_students ON classes.id = class_students.class_id
    LEFT JOIN exam_sessions ON exams.id = exam_sessions.exam_id AND exam_sessions.student_id = ?
    WHERE class_students.student_id = ? AND exams.is_active = 1
    ORDER BY exams.start_time ASC
    LIMIT 5
  `).all(studentId, studentId);

  const message = req.session.flashMessage || null;
  req.session.flashMessage = null;

  res.render('siswa/dashboard', {
    title: 'Dashboard Siswa | Oemah Sinau LMS',
    activePage: 'dashboard',
    classes,
    pendingAssignments,
    upcomingExams,
    message
  });
});

// Profil Madrasah
router.get('/madrasah', (req, res) => {
  const schoolId = req.session.user.school_id || 1;
  let madrasah = db.prepare('SELECT * FROM schools WHERE id = ?').get(schoolId);
  if (!madrasah) {
    madrasah = db.prepare('SELECT * FROM schools ORDER BY id ASC LIMIT 1').get() || { id: 1, name: 'Madrasah Aliyah Negeri 1 Terpadu' };
  }

  const dewanGuru = db.prepare(`
    SELECT users.name, users.identity_number, users.email,
           (SELECT COUNT(*) FROM classes WHERE classes.teacher_id = users.id) AS total_classes
    FROM users
    WHERE users.role = 'guru' AND (users.school_id = ? OR users.school_id IS NULL)
    ORDER BY users.name ASC
  `).all(schoolId);

  res.render('siswa/madrasah', {
    title: 'Profil Madrasah | Oemah Sinau LMS',
    activePage: 'madrasah',
    madrasah,
    dewanGuru
  });
});

// Join class using class code
router.post('/classes/join', (req, res) => {
  const studentId = req.session.user.id;
  const { code } = req.body;

  if (!code || !code.trim()) {
    req.session.flashMessage = { type: 'error', text: 'Masukkan kode kelas yang valid.' };
    return res.redirect('/siswa/dashboard');
  }

  const targetClass = db.prepare('SELECT id, name FROM classes WHERE UPPER(code) = ?').get(code.trim().toUpperCase());
  if (!targetClass) {
    req.session.flashMessage = { type: 'error', text: `Kode kelas "${code}" tidak ditemukan. Silakan periksa kembali.` };
    return res.redirect('/siswa/dashboard');
  }

  try {
    db.prepare('INSERT OR IGNORE INTO class_students (class_id, student_id) VALUES (?, ?)').run(targetClass.id, studentId);
    req.session.flashMessage = { type: 'success', text: `Berhasil bergabung ke kelas "${targetClass.name}"!` };
  } catch (err) {
    req.session.flashMessage = { type: 'error', text: 'Gagal bergabung ke kelas.' };
  }
  res.redirect(`/siswa/classes/${targetClass.id}`);
});

// 2. Class List & Detail
router.get('/classes', (req, res) => {
  const studentId = req.session.user.id;
  const classes = db.prepare(`
    SELECT classes.*, users.name AS teacher_name,
      (SELECT COUNT(*) FROM materials WHERE materials.class_id = classes.id) AS total_materials,
      (SELECT COUNT(*) FROM assignments WHERE assignments.class_id = classes.id) AS total_assignments
    FROM class_students
    JOIN classes ON class_students.class_id = classes.id
    JOIN users ON classes.teacher_id = users.id
    WHERE class_students.student_id = ?
    ORDER BY class_students.joined_at DESC
  `).all(studentId);

  const message = req.session.flashMessage || null;
  req.session.flashMessage = null;

  res.render('siswa/classes', {
    title: 'Kelas Saya | Oemah Sinau LMS',
    activePage: 'classes',
    classes,
    message
  });
});

router.get('/classes/:id', (req, res) => {
  const classId = req.params.id;
  const studentId = req.session.user.id;

  const isEnrolled = db.prepare('SELECT id FROM class_students WHERE class_id = ? AND student_id = ?').get(classId, studentId);
  if (!isEnrolled) {
    req.session.flashMessage = { type: 'error', text: 'Anda belum terdaftar di kelas ini.' };
    return res.redirect('/siswa/dashboard');
  }

  const currentClass = db.prepare(`
    SELECT classes.*, users.name AS teacher_name, users.email AS teacher_email
    FROM classes
    JOIN users ON classes.teacher_id = users.id
    WHERE classes.id = ?
  `).get(classId);

  const tab = req.query.tab || 'materials';

  const materials = db.prepare(`
    SELECT materials.*,
      CASE WHEN material_progress.id IS NOT NULL THEN 1 ELSE 0 END AS is_completed
    FROM materials
    LEFT JOIN material_progress ON materials.id = material_progress.material_id AND material_progress.student_id = ?
    WHERE materials.class_id = ?
    ORDER BY materials.meeting_number ASC, materials.id ASC
  `).all(studentId, classId);

  const assignments = db.prepare(`
    SELECT assignments.*,
      assignment_submissions.id AS submission_id,
      assignment_submissions.submitted_at,
      assignment_submissions.score,
      assignment_submissions.feedback
    FROM assignments
    LEFT JOIN assignment_submissions ON assignments.id = assignment_submissions.assignment_id AND assignment_submissions.student_id = ?
    WHERE assignments.class_id = ?
    ORDER BY assignments.deadline DESC
  `).all(studentId, classId);

  const exams = db.prepare(`
    SELECT exams.*,
      exam_sessions.id AS session_id,
      exam_sessions.status AS session_status,
      exam_sessions.total_score,
      exam_sessions.tab_switch_count
    FROM exams
    LEFT JOIN exam_sessions ON exams.id = exam_sessions.exam_id AND exam_sessions.student_id = ?
    WHERE exams.class_id = ? AND exams.is_active = 1
    ORDER BY exams.start_time DESC
  `).all(studentId, classId);

  const attendances = db.prepare(`
    SELECT attendances.*,
      attendance_records.status AS attendance_status,
      attendance_records.recorded_at
    FROM attendances
    LEFT JOIN attendance_records ON attendances.id = attendance_records.attendance_id AND attendance_records.student_id = ?
    WHERE attendances.class_id = ?
    ORDER BY attendances.date DESC, attendances.id DESC
  `).all(studentId, classId);

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

  res.render('siswa/class-detail', {
    title: `${currentClass.name} | Oemah Sinau LMS`,
    activePage: 'classes',
    currentClass,
    tab,
    materials,
    assignments,
    exams,
    attendances,
    discussions,
    message
  });
});

// Toggle material completion
router.post('/materials/:id/toggle', (req, res) => {
  const materialId = req.params.id;
  const studentId = req.session.user.id;
  const { class_id } = req.body;

  const existing = db.prepare('SELECT id FROM material_progress WHERE material_id = ? AND student_id = ?').get(materialId, studentId);
  if (existing) {
    db.prepare('DELETE FROM material_progress WHERE id = ?').run(existing.id);
  } else {
    db.prepare('INSERT INTO material_progress (material_id, student_id) VALUES (?, ?)').run(materialId, studentId);
  }
  res.redirect(`/siswa/classes/${class_id}?tab=materials`);
});

// 3. Assignments
router.get('/assignments', (req, res) => {
  const studentId = req.session.user.id;

  const assignments = db.prepare(`
    SELECT assignments.*, classes.name AS class_name, classes.grade AS class_grade,
      assignment_submissions.id AS submission_id,
      assignment_submissions.score,
      assignment_submissions.submitted_at
    FROM assignments
    JOIN classes ON assignments.class_id = classes.id
    JOIN class_students ON classes.id = class_students.class_id
    LEFT JOIN assignment_submissions ON assignments.id = assignment_submissions.assignment_id AND assignment_submissions.student_id = ?
    WHERE class_students.student_id = ?
    ORDER BY assignments.deadline DESC
  `).all(studentId, studentId);

  res.render('siswa/assignments', {
    title: 'Tugas Siswa | Oemah Sinau LMS',
    activePage: 'assignments',
    assignments
  });
});

router.get('/assignments/:id', (req, res) => {
  const assignmentId = req.params.id;
  const studentId = req.session.user.id;

  const assignment = db.prepare(`
    SELECT assignments.*, classes.name AS class_name, classes.grade AS class_grade, classes.id AS class_id
    FROM assignments
    JOIN classes ON assignments.class_id = classes.id
    JOIN class_students ON classes.id = class_students.class_id
    WHERE assignments.id = ? AND class_students.student_id = ?
  `).get(assignmentId, studentId);

  if (!assignment) return res.status(404).send('Tugas tidak ditemukan atau Anda tidak terdaftar.');

  const submission = db.prepare(`
    SELECT * FROM assignment_submissions WHERE assignment_id = ? AND student_id = ?
  `).get(assignmentId, studentId);

  const message = req.session.flashMessage || null;
  req.session.flashMessage = null;

  res.render('siswa/assignment-detail', {
    title: `Kerjakan Tugas: ${assignment.title} | Oemah Sinau LMS`,
    activePage: 'assignments',
    assignment,
    submission,
    message
  });
});

router.post('/assignments/:id/submit', upload.single('submission_file'), (req, res) => {
  const assignmentId = req.params.id;
  const studentId = req.session.user.id;
  const { submission_text } = req.body;

  let fileName = null;
  let filePath = null;
  if (req.file) {
    fileName = req.file.originalname;
    filePath = '/uploads/' + req.file.filename;
  }

  const existing = db.prepare('SELECT id, file_name, file_path FROM assignment_submissions WHERE assignment_id = ? AND student_id = ?').get(assignmentId, studentId);

  if (existing) {
    db.prepare(`
      UPDATE assignment_submissions
      SET submission_text = ?,
          file_name = COALESCE(?, file_name),
          file_path = COALESCE(?, file_path),
          submitted_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(submission_text ? submission_text.trim() : '', fileName, filePath, existing.id);
  } else {
    db.prepare(`
      INSERT INTO assignment_submissions (assignment_id, student_id, submission_text, file_name, file_path)
      VALUES (?, ?, ?, ?, ?)
    `).run(assignmentId, studentId, submission_text ? submission_text.trim() : '', fileName, filePath);
  }

  req.session.flashMessage = { type: 'success', text: 'Tugas Anda berhasil diserahkan kepada guru!' };
  res.redirect(`/siswa/assignments/${assignmentId}`);
});

// 4. Attendances Check-In
router.post('/attendances/:id/checkin', (req, res) => {
  const attendanceId = req.params.id;
  const studentId = req.session.user.id;
  const { class_id } = req.body;

  db.prepare(`
    INSERT INTO attendance_records (attendance_id, student_id, status, notes)
    VALUES (?, ?, 'Hadir', 'Presensi mandiri oleh siswa')
    ON CONFLICT(attendance_id, student_id) DO UPDATE SET
      status = 'Hadir',
      notes = 'Presensi mandiri oleh siswa',
      recorded_at = CURRENT_TIMESTAMP
  `).run(attendanceId, studentId);

  req.session.flashMessage = { type: 'success', text: 'Presensi kehadiran Anda berhasil dicatat!' };
  res.redirect(`/siswa/classes/${class_id}?tab=attendances`);
});

// 5. CBT Exam Online Room (Anti-Cheat Suite)
router.get('/exams', (req, res) => {
  const studentId = req.session.user.id;

  const exams = db.prepare(`
    SELECT exams.*, classes.name AS class_name,
      exam_sessions.id AS session_id,
      exam_sessions.status AS session_status,
      exam_sessions.total_score,
      exam_sessions.tab_switch_count
    FROM exams
    JOIN classes ON exams.class_id = classes.id
    JOIN class_students ON classes.id = class_students.class_id
    LEFT JOIN exam_sessions ON exams.id = exam_sessions.exam_id AND exam_sessions.student_id = ?
    WHERE class_students.student_id = ? AND exams.is_active = 1
    ORDER BY exams.start_time DESC
  `).all(studentId, studentId);

  res.render('siswa/exams', {
    title: 'Ujian Online (CBT) | Oemah Sinau LMS',
    activePage: 'exams',
    exams
  });
});

router.get('/exams/:id/room', (req, res) => {
  const examId = req.params.id;
  const studentId = req.session.user.id;

  const exam = db.prepare(`
    SELECT exams.*, classes.name AS class_name
    FROM exams
    JOIN classes ON exams.class_id = classes.id
    JOIN class_students ON classes.id = class_students.class_id
    WHERE exams.id = ? AND class_students.student_id = ?
  `).get(examId, studentId);

  if (!exam) return res.status(404).send('Ujian tidak ditemukan atau Anda tidak terdaftar.');

  // Check or initialize student exam session
  let session = db.prepare('SELECT * FROM exam_sessions WHERE exam_id = ? AND student_id = ?').get(examId, studentId);
  if (!session) {
    db.prepare(`
      INSERT INTO exam_sessions (exam_id, student_id, start_time, status, tab_switch_count, answers_json)
      VALUES (?, ?, CURRENT_TIMESTAMP, 'in_progress', 0, '{}')
    `).run(examId, studentId);
    session = db.prepare('SELECT * FROM exam_sessions WHERE exam_id = ? AND student_id = ?').get(examId, studentId);
  }

  if (session.status === 'submitted') {
    return res.redirect(`/siswa/exams/${examId}/result`);
  }

  // Fetch questions
  let questions = db.prepare('SELECT * FROM exam_questions WHERE exam_id = ?').all(examId);

  // If randomize questions is enabled
  if (exam.randomize_questions) {
    // Deterministic pseudo-random based on studentId to keep order consistent across refresh
    questions = questions.sort((a, b) => {
      const hashA = (a.id * 31 + studentId * 17) % 1000;
      const hashB = (b.id * 31 + studentId * 17) % 1000;
      return hashA - hashB;
    });
  }

  const savedAnswers = JSON.parse(session.answers_json || '{}');

  res.render('siswa/exam-room', {
    title: `Ujian CBT: ${exam.title} | Oemah Sinau LMS`,
    exam,
    session,
    questions,
    savedAnswers
  });
});

// AJAX save exam progress & tab switch
router.post('/exams/:id/heartbeat', (req, res) => {
  const examId = req.params.id;
  const studentId = req.session.user.id;
  const { answers, tab_switch_count } = req.body;

  const exam = db.prepare('SELECT * FROM exams WHERE id = ?').get(examId);
  if (!exam) return res.status(404).json({ error: 'Exam not found' });

  const session = db.prepare('SELECT * FROM exam_sessions WHERE exam_id = ? AND student_id = ?').get(examId, studentId);
  if (!session || session.status === 'submitted') {
    return res.json({ status: 'submitted' });
  }

  const currentTabCount = typeof tab_switch_count === 'number' ? tab_switch_count : session.tab_switch_count;
  const answersJson = answers ? JSON.stringify(answers) : session.answers_json;

  let newStatus = session.status;
  if (currentTabCount >= exam.tab_switch_limit && exam.tab_switch_limit > 0) {
    newStatus = 'submitted'; // Auto-submitted due to violations
  }

  db.prepare(`
    UPDATE exam_sessions
    SET tab_switch_count = ?, answers_json = ?, status = ?
    WHERE id = ?
  `).run(currentTabCount, answersJson, newStatus, session.id);

  res.json({
    status: newStatus,
    tab_switch_count: currentTabCount,
    limit_reached: currentTabCount >= exam.tab_switch_limit
  });
});

// Final exam submission
router.post('/exams/:id/submit', (req, res) => {
  const examId = req.params.id;
  const studentId = req.session.user.id;
  const { answers } = req.body;

  const session = db.prepare('SELECT * FROM exam_sessions WHERE exam_id = ? AND student_id = ?').get(examId, studentId);
  if (!session) return res.redirect('/siswa/exams');

  const parsedAnswers = answers ? (typeof answers === 'string' ? JSON.parse(answers) : answers) : JSON.parse(session.answers_json || '{}');
  const questions = db.prepare('SELECT * FROM exam_questions WHERE exam_id = ?').all(examId);

  // Auto-grade Multiple Choice questions
  let totalScore = 0;
  for (const q of questions) {
    if (q.question_type === 'pg') {
      const studentAns = parsedAnswers[q.id];
      if (studentAns && studentAns.toUpperCase() === q.correct_answer.toUpperCase()) {
        totalScore += q.score_weight;
      }
    }
  }

  db.prepare(`
    UPDATE exam_sessions
    SET status = 'submitted',
        end_time = CURRENT_TIMESTAMP,
        total_score = ?,
        answers_json = ?
    WHERE id = ?
  `).run(Math.round(totalScore), JSON.stringify(parsedAnswers), session.id);

  req.session.flashMessage = { type: 'success', text: 'Ujian telah selesai dikerjakan dan tersimpan dalam sistem.' };
  res.redirect(`/siswa/exams/${examId}/result`);
});

// View Exam Result
router.get('/exams/:id/result', (req, res) => {
  const examId = req.params.id;
  const studentId = req.session.user.id;

  const exam = db.prepare(`
    SELECT exams.*, classes.name AS class_name
    FROM exams
    JOIN classes ON exams.class_id = classes.id
    WHERE exams.id = ?
  `).get(examId);

  const session = db.prepare('SELECT * FROM exam_sessions WHERE exam_id = ? AND student_id = ?').get(examId, studentId);
  if (!session || session.status !== 'submitted') {
    return res.redirect(`/siswa/exams/${examId}/room`);
  }

  const questions = db.prepare('SELECT * FROM exam_questions WHERE exam_id = ?').all(examId);
  const studentAnswers = JSON.parse(session.answers_json || '{}');

  res.render('siswa/exam-result', {
    title: `Hasil Ujian: ${exam.title} | Oemah Sinau LMS`,
    exam,
    session,
    questions,
    studentAnswers
  });
});

// 6. Student Grade Report
router.get('/grades', (req, res) => {
  const studentId = req.session.user.id;

  const classes = db.prepare(`
    SELECT classes.*, users.name AS teacher_name
    FROM class_students
    JOIN classes ON class_students.class_id = classes.id
    JOIN users ON classes.teacher_id = users.id
    WHERE class_students.student_id = ?
  `).all(studentId);

  const reports = classes.map(cls => {
    const assignments = db.prepare(`
      SELECT assignments.title, assignment_submissions.score, assignment_submissions.submitted_at
      FROM assignments
      LEFT JOIN assignment_submissions ON assignments.id = assignment_submissions.assignment_id AND assignment_submissions.student_id = ?
      WHERE assignments.class_id = ?
    `).all(studentId, cls.id);

    const exams = db.prepare(`
      SELECT exams.title, exam_sessions.total_score, exam_sessions.status, exam_sessions.end_time
      FROM exams
      LEFT JOIN exam_sessions ON exams.id = exam_sessions.exam_id AND exam_sessions.student_id = ?
      WHERE exams.class_id = ?
    `).all(studentId, cls.id);

    const totalAttendances = db.prepare('SELECT COUNT(*) AS count FROM attendances WHERE class_id = ?').get(cls.id).count || 1;
    const presentCount = db.prepare(`
      SELECT COUNT(*) AS count
      FROM attendance_records
      JOIN attendances ON attendance_records.attendance_id = attendances.id
      WHERE attendances.class_id = ? AND attendance_records.student_id = ? AND attendance_records.status = 'Hadir'
    `).get(cls.id, studentId).count || 0;

    const attendancePct = Math.round((presentCount / totalAttendances) * 100);

    return {
      classInfo: cls,
      assignments,
      exams,
      attendancePct
    };
  });

  res.render('siswa/grades', {
    title: 'Riwayat & Raport Nilai Saya | Oemah Sinau LMS',
    activePage: 'grades',
    reports
  });
});

// 7. Forum Discussions
router.post('/classes/:id/forum/create', (req, res) => {
  const classId = req.params.id;
  const userId = req.session.user.id;
  const { title, content } = req.body;

  db.prepare(`
    INSERT INTO forum_discussions (class_id, user_id, title, content)
    VALUES (?, ?, ?, ?)
  `).run(classId, userId, title.trim(), content.trim());

  req.session.flashMessage = { type: 'success', text: 'Pertanyaan atau bahan diskusi berhasil diposting.' };
  res.redirect(`/siswa/classes/${classId}?tab=forum`);
});

router.post('/forum/:id/reply', (req, res) => {
  const discussionId = req.params.id;
  const userId = req.session.user.id;
  const { reply, class_id } = req.body;

  db.prepare(`
    INSERT INTO forum_replies (discussion_id, user_id, reply)
    VALUES (?, ?, ?)
  `).run(discussionId, userId, reply.trim());

  res.redirect(`/siswa/classes/${class_id}?tab=forum`);
});

module.exports = router;

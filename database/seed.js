const bcrypt = require('bcryptjs');
const db = require('./db');

function seed() {
  console.log('🌱 Menjalankan Seeder Database LMS Oemah Sinau...');

  // 1. Seed Schools
  const schools = [
    'SMK Negeri Karangpucung',
    'SMKN 1 Tasikmalaya',
    'PPKn Universitas Sriwijaya',
    'Sekolah Uji Coba',
    'SD NEGERI BANDAR AGUNG',
    'SMA ISLAM NUR EL GHAZY',
    'SD Negeri Wedusan'
  ];

  const insertSchool = db.prepare('INSERT OR IGNORE INTO schools (name) VALUES (?)');
  for (const s of schools) {
    insertSchool.run(s);
  }

  const school = db.prepare('SELECT id FROM schools WHERE name = ?').get('SMKN 1 Tasikmalaya');
  const schoolId = school ? school.id : 1;

  // 2. Seed Users
  const passwordHash = bcrypt.hashSync('password123', 10);

  // Guru Demo
  const insertUser = db.prepare(`
    INSERT OR IGNORE INTO users (school_id, name, identity_number, email, password, role)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  insertUser.run(
    schoolId,
    'Budi Santoso, S.Pd',
    '198507122010011002',
    'guru@sekolah.com',
    passwordHash,
    'guru'
  );

  // Siswa Demo
  const students = [
    { name: 'Ahmad Fauzi', nis: '20261001', email: 'ahmad@siswa.com' },
    { name: 'Siti Rahmawati', nis: '20261002', email: 'siti@siswa.com' },
    { name: 'Dimas Pratama', nis: '20261003', email: 'dimas@siswa.com' },
    { name: 'Anisa Maharani', nis: '20261004', email: 'anisa@siswa.com' }
  ];

  for (const st of students) {
    insertUser.run(schoolId, st.name, st.nis, st.email, passwordHash, 'siswa');
  }

  const teacher = db.prepare('SELECT id FROM users WHERE identity_number = ?').get('198507122010011002');
  const studentAhmad = db.prepare('SELECT id FROM users WHERE identity_number = ?').get('20261001');
  const studentSiti = db.prepare('SELECT id FROM users WHERE identity_number = ?').get('20261002');
  const studentDimas = db.prepare('SELECT id FROM users WHERE identity_number = ?').get('20261003');

  // 3. Seed Classes
  const insertClass = db.prepare(`
    INSERT OR IGNORE INTO classes (teacher_id, school_id, name, subject, grade, code, description)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  insertClass.run(
    teacher.id,
    schoolId,
    'Pemrograman Web & Perangkat Bergerak',
    'Pemrograman Web',
    'XII RPL 1',
    'PWPB-12',
    'Kelas pembelajaran pemrograman aplikasi berbasis web frontend & backend modern serta perancangan REST API.'
  );

  insertClass.run(
    teacher.id,
    schoolId,
    'Basis Data & Cloud Infrastructure',
    'Basis Data',
    'XI RPL 2',
    'BD-11',
    'Mata pelajaran konsep basis data relasional SQL, optimasi query, normalisasi, dan manajemen server cloud.'
  );

  const mainClass = db.prepare('SELECT id FROM classes WHERE code = ?').get('PWPB-12');

  // 4. Enroll Students
  const enrollStudent = db.prepare(`
    INSERT OR IGNORE INTO class_students (class_id, student_id) VALUES (?, ?)
  `);

  if (mainClass) {
    enrollStudent.run(mainClass.id, studentAhmad.id);
    enrollStudent.run(mainClass.id, studentSiti.id);
    enrollStudent.run(mainClass.id, studentDimas.id);

    // 5. Seed Materials
    const insertMaterial = db.prepare(`
      INSERT OR IGNORE INTO materials (class_id, title, meeting_number, content, video_url)
      VALUES (?, ?, ?, ?, ?)
    `);

    insertMaterial.run(
      mainClass.id,
      'Pengantar Arsitektur Client-Server & REST API',
      1,
      `### Tujuan Pembelajaran
Pada pertemuan pertama ini, siswa akan mempelajari arsitektur dasar web modern yang memisahkan antara frontend dan backend.

#### Konsep Utama:
1. **HTTP Request & Response**: Cara klien (browser/mobile) meminta data melalui method GET, POST, PUT, DELETE.
2. **Stateless Protocol**: Mengapa autentikasi token / session sangat dibutuhkan pada aplikasi web.
3. **Format Data JSON**: Standar pertukaran data ringan antar server dan klien.

Silakan pelajari video terlampir dan kerjakan latihan di menu Tugas.`,
      'https://www.youtube.com/embed/dQw4w9WgXcQ'
    );

    insertMaterial.run(
      mainClass.id,
      'Perancangan Basis Data SQLite & Normalisasi Tabel',
      2,
      `### Ringkasan Materi Pertemuan 2
Basis data yang baik adalah fondasi aplikasi yang tangguh. Kita akan membedah proses normalisasi hingga 3NF.

- **1NF**: Tidak ada kolom multi-value.
- **2NF**: Setiap atribut non-kunci bergantung penuh pada Primary Key.
- **3NF**: Menghilangkan ketergantungan transitif.`,
      null
    );

    // 6. Seed Assignments
    const insertAssignment = db.prepare(`
      INSERT OR IGNORE INTO assignments (class_id, title, instructions, deadline)
      VALUES (?, ?, ?, ?)
    `);

    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);
    insertAssignment.run(
      mainClass.id,
      'Tugas Praktik 1: Desain ERD Sistem Perpustakaan Digital',
      'Buatlah diagram Entity-Relationship (ERD) lengkap dengan entitas Buku, Anggota, Peminjaman, dan Petugas. Cantumkan Primary Key, Foreign Key, serta kardinalitas relasi (1 to M, M to M). Format pengumpulan berupa gambar diagram (PNG/JPG) atau dokumen PDF.',
      nextWeek
    );

    // 7. Seed CBT Exam (Super Aman)
    const examCheck = db.prepare('SELECT id FROM exams WHERE class_id = ?').get(mainClass.id);
    let examId;
    if (!examCheck) {
      const startTime = new Date(Date.now() - 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);
      const endTime = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);

      const res = db.prepare(`
        INSERT INTO exams (
          class_id, title, description, duration_minutes, start_time, end_time,
          randomize_questions, randomize_options, fullscreen_required, tab_switch_limit,
          auto_submit_on_timeout, show_score_to_student, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        mainClass.id,
        'Penilaian Tengah Semester (PTS) Ganjil - Pemrograman Web',
        'Ujian daring dengan proteksi anti-kecurangan aktif: Layar Penuh (Fullscreen), pengacakan soal & opsi, serta deteksi pindah tab (Maksimal toleransi 3x).',
        45,
        startTime,
        endTime,
        1,
        1,
        1,
        3,
        1,
        1,
        1
      );
      examId = res.lastInsertRowid;

      // Seed Exam Questions
      const insertQ = db.prepare(`
        INSERT INTO exam_questions (
          exam_id, question_text, question_type, option_a, option_b, option_c, option_d, option_e, correct_answer, score_weight
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      insertQ.run(
        examId,
        'Protokol standar yang digunakan untuk mentransfer halaman web terenkripsi secara aman antara browser dan web server adalah...',
        'pg',
        'FTP (File Transfer Protocol)',
        'HTTP (Hypertext Transfer Protocol)',
        'HTTPS (Hypertext Transfer Protocol Secure)',
        'SMTP (Simple Mail Transfer Protocol)',
        'SSH (Secure Shell)',
        'C',
        20.0
      );

      insertQ.run(
        examId,
        'Perintah SQL yang digunakan untuk mengambil data dari satu atau lebih tabel dalam basis data adalah...',
        'pg',
        'FETCH',
        'SELECT',
        'RETRIEVE',
        'GET',
        'QUERY',
        'B',
        20.0
      );

      insertQ.run(
        examId,
        'Dalam arsitektur MVC (Model-View-Controller), komponen yang bertanggung jawab untuk logika bisnis dan interaksi langsung dengan basis data adalah...',
        'pg',
        'View',
        'Controller',
        'Model',
        'Router',
        'Middleware',
        'C',
        20.0
      );

      insertQ.run(
        examId,
        'Pada format JSON, manakah sintaks penulisan objek key-value yang valid?',
        'pg',
        '{ "nama": "Ahmad", "umur": 17 }',
        '{ nama = "Ahmad", umur = 17 }',
        '<nama>Ahmad</nama><umur>17</umur>',
        '[ "nama" => "Ahmad", "umur" => 17 ]',
        '{ key: nama, value: Ahmad }',
        'A',
        20.0
      );

      insertQ.run(
        examId,
        'Jelaskan perbedaan mendasar antara HTTP method GET dan POST dalam konteks pengiriman data formulir web!',
        'esai',
        null, null, null, null, null,
        null,
        20.0
      );
    }

    // 8. Seed Attendance Session
    const todayStr = new Date().toISOString().split('T')[0];
    const insertAtt = db.prepare(`
      INSERT OR IGNORE INTO attendances (class_id, title, date, start_time, end_time)
      VALUES (?, ?, ?, ?, ?)
    `);
    const attRes = insertAtt.run(
      mainClass.id,
      'Presensi KBM Pertemuan 1 - Arsitektur Web',
      todayStr,
      '07:00',
      '23:59'
    );

    if (attRes.changes > 0) {
      const attId = attRes.lastInsertRowid;
      db.prepare(`
        INSERT OR IGNORE INTO attendance_records (attendance_id, student_id, status, notes)
        VALUES (?, ?, 'Hadir', 'Hadir tepat waktu')
      `).run(attId, studentAhmad.id);
    }

    // 9. Seed Teaching Journal
    db.prepare(`
      INSERT OR IGNORE INTO teaching_journals (teacher_id, class_id, date, period, topic, activities, present_count, absent_count, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      teacher.id,
      mainClass.id,
      todayStr,
      'Jam ke 1 - 3 (07.30 - 09.45)',
      'Pengantar Arsitektur Client-Server & REST API',
      'Membahas alur request-response HTTP, mendemonstrasikan pengujian endpoint menggunakan browser devtools, serta diskusi kelompok.',
      3,
      0,
      'KBM berjalan interaktif dan lancar tanpa kendala teknis.'
    );

    // 10. Seed Forum Discussion
    const insertForum = db.prepare(`
      INSERT OR IGNORE INTO forum_discussions (class_id, user_id, title, content)
      VALUES (?, ?, ?, ?)
    `);
    const forumRes = insertForum.run(
      mainClass.id,
      teacher.id,
      'Ruang Tanya Jawab Materi Pertemuan 1',
      'Halo semuanya! Jika ada materi yang belum dipahami terkait HTTP Request & Response serta arsitektur REST API, silakan tanyakan di sini ya. Selamat belajar!'
    );

    if (forumRes.changes > 0) {
      db.prepare(`
        INSERT OR IGNORE INTO forum_replies (discussion_id, user_id, reply)
        VALUES (?, ?, ?)
      `).run(
        forumRes.lastInsertRowid,
        studentAhmad.id,
        'Pak Budi, izin bertanya apakah method PUT dan PATCH memiliki perbedaan saat kita update data?'
      );

      db.prepare(`
        INSERT OR IGNORE INTO forum_replies (discussion_id, user_id, reply)
        VALUES (?, ?, ?)
      `).run(
        forumRes.lastInsertRowid,
        teacher.id,
        'Pertanyaan bagus Ahmad! Singkatnya: PUT menggantikan seluruh representasi resource, sedangkan PATCH hanya memperbarui sebagian field yang dimodifikasi.'
      );
    }
  }

  console.log('✅ Seeding berhasil diselesaikan!');
  console.log('----------------------------------------------------');
  console.log('Akun Guru:');
  console.log('  Identitas: guru@sekolah.com ATAU 198507122010011002');
  console.log('  Kata Sandi: password123');
  console.log('Akun Siswa:');
  console.log('  Identitas: 20261001 (Ahmad Fauzi) ATAU ahmad@siswa.com');
  console.log('  Kata Sandi: password123');
  console.log('----------------------------------------------------');
}

seed();

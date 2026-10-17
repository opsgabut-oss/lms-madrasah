const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '..', 'database', 'lms.sqlite');
const db = new Database(dbPath);

console.log('--- Memulai Pembersihan Data ---');

db.pragma('foreign_keys = OFF'); // Turn off FK temporarily to avoid sequence issues during truncate

const tablesToClear = [
  'material_progress',
  'assignment_submissions',
  'exam_sessions',
  'exam_questions',
  'attendance_records',
  'forum_replies',
  'materials',
  'assignments',
  'exams',
  'attendances',
  'teaching_journals',
  'forum_discussions',
  'class_students',
  'classes',
  'users'
];

db.transaction(() => {
  for (const table of tablesToClear) {
    db.prepare(`DELETE FROM ${table}`).run();
    console.log(`[V] Data tabel '${table}' berhasil dihapus bersih.`);
  }

  // Hapus sekolah dummy (id > 1), pertahankan id 1 (Madrasah Aliyah Negeri 1 Terpadu beserta logonya)
  const delSchools = db.prepare('DELETE FROM schools WHERE id > 1').run();
  console.log(`[V] Sekolah dummy dihapus: ${delSchools.changes} sekolah dummy.`);

  // Reset sequence autoincrement
  const resetSeq = db.prepare(`
    DELETE FROM sqlite_sequence 
    WHERE name IN (
      'users', 'classes', 'class_students', 'materials', 'material_progress',
      'assignments', 'assignment_submissions', 'exams', 'exam_questions',
      'exam_sessions', 'attendances', 'attendance_records', 'teaching_journals',
      'forum_discussions', 'forum_replies'
    )
  `).run();
  console.log(`[V] Autoincrement sequence telah direset.`);
})();

db.pragma('foreign_keys = ON');

// Bersihkan file uploads contoh materi/dokumen sementara (kecuali logo madrasah LOGO_MASM.png)
const uploadsDir = path.join(__dirname, '..', 'public', 'uploads');
if (fs.existsSync(uploadsDir)) {
  const files = fs.readdirSync(uploadsDir);
  for (const file of files) {
    if (file.includes('LOGO_MASM')) {
      console.log(`[KEEP] Mempertahankan Logo Madrasah: ${file}`);
    } else {
      fs.unlinkSync(path.join(uploadsDir, file));
      console.log(`[DELETED] File lampiran/uji coba dihapus: ${file}`);
    }
  }
}

// Hapus file cookie uji coba di root jika ada
const rootDir = path.join(__dirname, '..');
['cookie.txt', 'cookie_guru.txt', 'cookie_siswa.txt'].forEach(f => {
  const p = path.join(rootDir, f);
  if (fs.existsSync(p)) {
    fs.unlinkSync(p);
    console.log(`[DELETED] Cookie pengujian dihapus: ${f}`);
  }
});

console.log('--- Verifikasi Data Saat Ini ---');
const allTables = [
  'users',
  'schools',
  'classes',
  'class_students',
  'materials',
  'material_progress',
  'assignments',
  'assignment_submissions',
  'exams',
  'exam_questions',
  'exam_sessions',
  'attendances',
  'attendance_records',
  'teaching_journals',
  'forum_discussions',
  'forum_replies'
];

allTables.forEach(t => {
  const count = db.prepare(`SELECT COUNT(*) as c FROM ${t}`).get().c;
  console.log(`- ${t}: ${count} baris`);
});

console.log('\nSekolah yang tersimpan di database:');
console.log(db.prepare('SELECT id, name, logo FROM schools').all());

console.log('\n--- Pembersihan Selesai dengan Sempurna! ---');

# LMS Oemah Sinau Platform

Aplikasi Learning Management System (LMS) modern, responsif, dan lengkap yang dibangun semirip mungkin dengan [lms.oemahsinau.online](https://lms.oemahsinau.online/) baik dari segi desain visual (Tailwind CSS, Outfit font, palet warna emerald/brand, glassmorphism, floating animation), hingga seluruh fitur fungsional di dalamnya.

---

## 🌟 Fitur Utama (Semua Fitur Oemah Sinau LMS)

### 1. 🔐 Autentikasi & Multi-Tenant Persis Aslinya
- **Halaman Masuk (Login)**: Tampilan 2 kolom (Hero banner desktop gelap dengan floating toga cap badge & glassmorphism form identitas NIP/NIS/Email + kata sandi dengan toggle intip mata).
- **Pendaftaran Guru**: Formulir registrasi guru lengkap dengan pemilihan instansi/sekolah terdaftar atau pembuatan sekolah baru otomatis.
- **Lupa Kata Sandi**: Alur pemulihan kata sandi akun terdaftar.
- **Kebijakan Privasi (Privacy Policy)**: Halaman legal operasional resmi perlindungan data guru dan siswa.

### 2. 🏫 Ruang Kelas Digital (Virtual Classroom)
- Guru dapat membuat ruang kelas per tingkatan/rombel dan mata pelajaran.
- **Kode Kelas Unik**: Siswa dapat langsung bergabung ke kelas dengan memasukkan kode kelas (contoh: `PWPB-12`).
- Manajemen daftar siswa per kelas (tambah manual, buat akun otomatis, atau hapus).

### 3. 📚 Modul Materi Pembelajaran
- Pengelompokan materi berdasarkan pertemuan KBM.
- Dukungan materi teks kaya, tautan embed video (YouTube/Drive), dan unduhan berkas lampiran (PDF/Dokumen).
- Fitur **Tandai Selesai** bagi siswa untuk memantau progres belajar mandiri.

### 4. 📝 Tugas & Penilaian Mandiri
- Guru dapat menerbitkan tugas dengan instruksi lengkap, tenggat waktu (deadline), dan lampiran soal.
- Siswa dapat mengunggah berkas jawaban atau mengetik jawaban langsung.
- Lembar penilaian guru: Input nilai (skala 0-100) dan catatan evaluasi/feedback per siswa.

### 5. 🛡️ Ujian Online (CBT) Super Aman (Anti-Cheat Suite)
- **Bank Soal**: Mendukung soal Pilihan Ganda (PG) A s/d E dengan kunci jawaban otomatis serta soal Esai/Uraian.
- **Acak Soal & Acak Opsi**: Urutan nomor soal dan opsi jawaban diacak berbeda untuk setiap siswa.
- **Wajib Mode Layar Penuh (Fullscreen Enforcement)**: Siswa dipandu masuk layar penuh sebelum memulai ujian.
- **Deteksi Perpindahan Tab / Jendela (Tab-Switch Violation Audit)**: Mendeteksi jika siswa membuka tab atau aplikasi lain, menampilkan modal peringatan pelanggaran (misal toleransi 3x), dan mencatat log kecurangan di rekap guru.
- **Auto-Submit Otomatis**: Jika siswa melanggar batas toleransi atau waktu pengerjaan habis, lembar jawaban otomatis dikumpulkan ke server.
- **Anti-Copy & Anti-Inspect**: Menonaktifkan klik kanan, pintasan keyboard inspeksi elemen (`F12`, `Ctrl+Shift+I`), dan copy-paste.
- **Lembar Navigasi Soal Interaktif**: Palet nomor soal dengan indikator status warna hijau (sudah dijawab), kuning (ragu-ragu), dan abu-abu (belum dijawab).
- **Koreksi Otomatis**: Nilai pilihan ganda dikalkulasi secara instan setelah siswa selesai ujian.

### 6. 📅 Absensi Kelas Digital
- Guru dapat membuka sesi presensi per tanggal dan rentang jam pelajaran.
- Siswa dapat melakukan presensi mandiri (Hadir) dengan 1 klik saat sesi dibuka.
- Guru dapat mengedit status presensi (Hadir, Sakit, Izin, Alpa) dan menambahkan catatan keterangan.

### 7. 📖 Jurnal Mengajar Guru
- Buku agenda KBM harian guru mencakup: Tanggal, Jam pelajaran ke-, Materi/Kompetensi Dasar, Uraian aktivitas KBM, Rekap kehadiran kelas, dan Catatan kendala teknis.

### 8. 💬 Forum Diskusi Interaktif
- Ruang interaksi tanya-jawab antara guru dan siswa di dalam kelas untuk membahas materi maupun kendala belajar.

### 9. 📊 Rekap Nilai Otomatis & Cetak Format Rapor
- Perhitungan otomatis nilai akhir berbobot: **Tugas (30%) + Ujian CBT (50%) + Presensi (20%)** beserta penentuan predikat capaian (A, B, C, D).
- Format cetak siap cetak / simpan ke PDF dengan kop surat dan kolom tanda tangan resmi.

---

## 🚀 Cara Menjalankan Aplikasi

Pastikan Anda berada di direktori project:
```bash
cd C:\Users\OP\.gemini\antigravity\scratch\lms-oemahsinau
```

### 1. Menjalankan Server
```bash
npm start
```
Atau:
```bash
node server.js
```

### 2. Akses di Browser
Buka browser dan buka tautan:
👉 **[http://localhost:3000](http://localhost:3000)**

---

## 🔑 Akun Demo Siap Pakai

Database telah dilengkapi dengan data percontohan lengkap (Sekolah, Kelas, Materi, Tugas, Ujian CBT, Presensi, dan Forum):

### 👨‍🏫 Akun Guru (Teacher):
- **Identitas (NIP/Email)**: `guru@sekolah.com` *atau* `198507122010011002`
- **Kata Sandi**: `password123`
- **Nama**: Budi Santoso, S.Pd

### 👨‍🎓 Akun Siswa (Student):
- **Identitas (NIS/Email)**: `20261001` *atau* `ahmad@siswa.com`
- **Kata Sandi**: `password123`
- **Nama**: Ahmad Fauzi
- **Akun Siswa Lainnya**: `20261002` (Siti Rahmawati) / `20261003` (Dimas Pratama), Sandi: `password123`

---

## 📂 Struktur Direktori Proyek

```
lms-oemahsinau/
├── database/
│   ├── db.js                # Inisialisasi SQLite & skema tabel
│   ├── lms.sqlite           # Berkas basis data SQLite
│   └── seed.js              # Seeder data sekolah, guru, siswa, kelas, CBT
├── middleware/
│   └── auth.js              # Session & Role-Based Access Control
├── public/
│   └── uploads/             # Berkas materi & tugas yang diunggah
├── routes/
│   ├── auth.js              # Login, register, logout, privacy policy
│   ├── guru.js              # Dashboard guru, kelas, tugas, CBT, jurnal, nilai
│   └── siswa.js             # Dashboard siswa, kelas, kerjakan tugas, ruang CBT
├── views/
│   ├── auth/                # Halaman login, register, lupa sandi, privacy
│   ├── guru/                # Halaman manajemen guru & CBT builder
│   ├── siswa/               # Halaman ruang belajar siswa & CBT room
│   └── layouts/             # Header, navbar, sidebar, footer
├── package.json
├── server.js                # Entry point server Express
└── README.md
```

function ensureAuthenticated(req, res, next) {
  if (req.session && req.session.user) {
    res.locals.currentUser = req.session.user;
    return next();
  }
  return res.redirect('/auth/login');
}

function ensureRole(allowedRoles) {
  return function (req, res, next) {
    if (!req.session || !req.session.user) {
      return res.redirect('/auth/login');
    }
    const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
    if (roles.includes(req.session.user.role)) {
      res.locals.currentUser = req.session.user;
      return next();
    }
    const currentRole = req.session.user.role;
    const requiredRole = roles.join(' / ');
    return res.status(403).send(`
      <!DOCTYPE html>
      <html lang="id">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Akses Ditolak | Oemah Sinau LMS</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" rel="stylesheet">
      </head>
      <body class="bg-slate-100 min-h-screen flex items-center justify-center p-4 font-sans">
        <div class="max-w-md w-full bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-2xl text-center space-y-4">
          <div class="w-16 h-16 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center text-2xl mx-auto shadow-sm">
            <i class="fas fa-user-lock"></i>
          </div>
          <div>
            <h2 class="text-xl font-black text-slate-800">Akses Khusus ${requiredRole.toUpperCase()}</h2>
            <p class="text-xs text-slate-500 mt-2 leading-relaxed">
              Anda saat ini sedang aktif login sebagai <strong>${req.session.user.name}</strong> dengan peran <span class="px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${currentRole === 'guru' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'}">${currentRole}</span>.<br>Halaman ini hanya dapat diakses oleh akun <strong>${requiredRole}</strong>.
            </p>
          </div>
          <div class="pt-3 flex flex-col gap-2">
            <a href="${currentRole === 'guru' ? '/guru/dashboard' : '/siswa/dashboard'}" class="w-full py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-all shadow">
              <i class="fas fa-th-large mr-1.5"></i> Buka Dashboard Saya (${currentRole.toUpperCase()})
            </a>
            <a href="/auth/logout" class="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs transition-all shadow-md">
              <i class="fas fa-sign-out-alt mr-1.5"></i> Keluar & Login Sebagai ${requiredRole.toUpperCase()}
            </a>
          </div>
        </div>
      </body>
      </html>
    `);
  };
}

function redirectIfAuthenticated(req, res, next) {
  if (req.session && req.session.user) {
    if (req.session.user.role === 'guru') {
      return res.redirect('/guru/dashboard');
    } else if (req.session.user.role === 'siswa') {
      return res.redirect('/siswa/dashboard');
    }
  }
  next();
}

module.exports = {
  ensureAuthenticated,
  ensureRole,
  redirectIfAuthenticated
};

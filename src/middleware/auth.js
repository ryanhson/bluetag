function requireAuth(req, res, next) {
  if (!req.session.user) {
    req.session.flash = { type: "error", message: "Sign in to continue." };
    return res.redirect("/login");
  }
  next();
}

function attachUser(req, res, next) {
  res.locals.currentUser = req.session.user || null;
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  next();
}

module.exports = { requireAuth, attachUser };

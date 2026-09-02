const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");

const router = express.Router();

router.get("/login", (req, res) => {
  if (req.session.user) return res.redirect("/me");
  res.render("login", { title: "Sign in", email: "" });
});

router.post("/login", (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");

  if (!email || !password) {
    return res.status(400).render("login", {
      title: "Sign in",
      email,
      error: "Email and password are required."
    });
  }

  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).render("login", {
      title: "Sign in",
      email,
      error: "Those credentials do not match a BlueTag account."
    });
  }

  req.session.user = {
    id: user.id,
    email: user.email,
    displayName: user.display_name
  };
  res.redirect("/me");
});

router.get("/register", (req, res) => {
  if (req.session.user) return res.redirect("/me");
  res.render("register", { title: "Create account", values: {} });
});

router.post("/register", (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const displayName = String(req.body.displayName || "").trim();
  const password = String(req.body.password || "");
  const values = { email, displayName };

  if (!email.endsWith(".edu")) {
    return res.status(400).render("register", {
      title: "Create account",
      values,
      error: "Use a .edu email so we can keep the board to campus accounts."
    });
  }
  if (displayName.length < 2) {
    return res.status(400).render("register", {
      title: "Create account",
      values,
      error: "Display name needs at least two characters."
    });
  }
  if (password.length < 8) {
    return res.status(400).render("register", {
      title: "Create account",
      values,
      error: "Password needs at least eight characters."
    });
  }

  const taken = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (taken) {
    return res.status(400).render("register", {
      title: "Create account",
      values,
      error: "That email already has an account. Try signing in."
    });
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const info = db.prepare(
    "INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)"
  ).run(email, passwordHash, displayName);

  req.session.user = {
    id: info.lastInsertRowid,
    email,
    displayName
  };
  res.redirect("/me");
});

router.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/");
  });
});

module.exports = router;

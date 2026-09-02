const express = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

const CATEGORIES = [
  { slug: "electronics", label: "Electronics" },
  { slug: "ids", label: "IDs & cards" },
  { slug: "keys", label: "Keys" },
  { slug: "clothing", label: "Clothing" },
  { slug: "other", label: "Other" }
];

function searchItems({ q, category, kind }) {
  let sql = `
    SELECT
      items.id,
      items.user_id,
      items.kind,
      items.category,
      items.title,
      items.description,
      items.location,
      items.contact_pref,
      items.status,
      items.created_at,
      users.display_name AS owner_name
    FROM items
    JOIN users ON users.id = items.user_id
    WHERE items.status != 'removed'
  `;

  const params = [];

  if (q) {
    sql += ` AND items.title || ' ' || items.description || ' ' || items.location LIKE ? ESCAPE '\\'`;
    params.push(`%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
  }

  if (category && category !== "all" && CATEGORIES.some((c) => c.slug === category)) {
    sql += ` AND items.category = ?`;
    params.push(category);
  }

  if (kind === "lost" || kind === "found") {
    sql += ` AND items.kind = ?`;
    params.push(kind);
  }

  sql += " ORDER BY items.created_at DESC LIMIT 50";
  return db.prepare(sql).all(...params);
}

router.get("/", (req, res) => {
  const q = String(req.query.q || "").trim();
  const category = String(req.query.category || "all");
  const kind = String(req.query.kind || "all");

  let items = [];
  let searchError = null;
  try {
    items = searchItems({ q, category, kind });
  } catch (err) {
    searchError = "Search could not run. Try a simpler phrase.";
  }

  res.render("home", {
    title: q ? `Search · ${q}` : "Lost & found",
    items,
    q,
    category,
    kind,
    categories: CATEGORIES,
    searchError
  });
});

router.get("/items/new", requireAuth, (req, res) => {
  res.render("new-item", {
    title: "Post an item",
    categories: CATEGORIES,
    values: { kind: "lost", category: "other" }
  });
});

router.post("/items", requireAuth, (req, res) => {
  const kind = req.body.kind === "found" ? "found" : "lost";
  const category = CATEGORIES.some((c) => c.slug === req.body.category)
    ? req.body.category
    : "other";
  const title = String(req.body.title || "").trim();
  const description = String(req.body.description || "").trim();
  const location = String(req.body.location || "").trim();
  const contactPref = String(req.body.contactPref || req.session.user.email).trim();

  const values = { kind, category, title, description, location, contactPref };

  if (title.length < 4 || description.length < 10 || location.length < 3) {
    return res.status(400).render("new-item", {
      title: "Post an item",
      categories: CATEGORIES,
      values,
      error: "Title, a short description, and a location are required."
    });
  }

  const info = db.prepare(`
    INSERT INTO items (user_id, kind, category, title, description, location, contact_pref)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(req.session.user.id, kind, category, title, description, location, contactPref);

  res.redirect(`/items/${info.lastInsertRowid}`);
});

router.get("/items/:id", (req, res) => {
  const item = db.prepare(`
    SELECT
      items.*,
      users.display_name AS owner_name,
      users.email AS owner_email
    FROM items
    JOIN users ON users.id = items.user_id
    WHERE items.id = ? AND items.status != 'removed'
  `).get(req.params.id);

  if (!item) {
    return res.status(404).render("404", { title: "Not found" });
  }

  const isOwner = req.session.user && req.session.user.id === item.user_id;
  res.render("item", { title: item.title, item, isOwner });
});

router.post("/items/:id/resolve", requireAuth, (req, res) => {
  const item = db.prepare("SELECT * FROM items WHERE id = ?").get(req.params.id);
  if (!item || item.user_id !== req.session.user.id) {
    req.session.flash = { type: "error", message: "You can only close your own posts." };
    return res.redirect("/");
  }

  db.prepare("UPDATE items SET status = 'resolved' WHERE id = ? AND user_id = ?").run(
    item.id,
    req.session.user.id
  );
  req.session.flash = { type: "ok", message: "Marked as resolved. Thanks for closing the loop." };
  res.redirect(`/items/${item.id}`);
});

router.get("/me", requireAuth, (req, res) => {
  const items = db.prepare(`
    SELECT * FROM items
    WHERE user_id = ? AND status != 'removed'
    ORDER BY created_at DESC
  `).all(req.session.user.id);

  res.render("me", { title: "My posts", items });
});

module.exports = router;

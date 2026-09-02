const path = require("path");
const express = require("express");
const session = require("express-session");

const db = require("./db");
const seed = require("./seed");
const { attachUser } = require("./middleware/auth");
const authRoutes = require("./routes/auth");
const itemRoutes = require("./routes/items");

seed();

const app = express();
const port = Number(process.env.PORT) || 3000;
const sessionSecret = process.env.SESSION_SECRET || "bluetag-dev-session-secret";

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, "public")));

app.use(
  session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24 * 7
    }
  })
);

app.use(attachUser);

app.use((req, res, next) => {
  res.locals.appName = "BlueTag";
  next();
});

app.get("/health", (_req, res) => {
  db.prepare("SELECT 1 AS ok").get();
  res.json({ ok: true });
});

app.use(authRoutes);
app.use(itemRoutes);

app.use((_req, res) => {
  res.status(404).render("404", { title: "Not found" });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).render("500", { title: "Server error" });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`BlueTag listening on http://0.0.0.0:${port}`);
});

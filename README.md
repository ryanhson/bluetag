# BlueTag

Campus lost-and-found board. Students post what they lost or found, search the board, and mark a listing resolved when the item goes home.

Built as a small Express app with EJS pages and SQLite so it can run on a laptop or a single VM.

## Features

- Register with a `.edu` email, sign in, sign out
- Public board with search, kind, and category filters
- Create a lost or found post
- View a post and contact the poster
- Owners can mark their own posts resolved

## Run locally

You need Node 22.13+ (the app uses the built-in `node:sqlite` module).

```bash
cp .env.example .env
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000). The database file is created and seeded on first boot at `data/bluetag.db`.

```bash
npm run dev    # restarts on file changes
npm run seed   # no-op if users already exist
```

## Run with Docker

```bash
docker compose up --build
```

The app listens on port 3000. Item data lives in the `bluetag-data` volume.

## Demo accounts

| Email | Password | Notes |
|---|---|---|
| `alex@campus.edu` | `campus123` | Has a couple of lost posts |
| `jordan@campus.edu` | `campus123` | Has found posts |
| `sam@campus.edu` | `foundit!` | Mixed posts |

Register your own account if you want; it just has to end in `.edu`.

## Project layout

```
src/index.js           HTTP server, sessions, static files
src/db.js              SQLite schema
src/seed.js            First-run demo data
src/routes/auth.js     Register / login / logout
src/routes/items.js    Board, search, posts
src/views/             EJS pages
src/public/css/        Styles
```

## Assignment notes

Host this somewhere your classmates and instructor can reach. Walk the running app until you can explain:

- how a request becomes a row in SQLite
- where authentication is enforced
- how search, filters, and item pages load data

Then look for a security defect in the running system, document how to trigger it, and patch it without breaking normal use of the board. Submit the hosted URL, a short architecture sketch, the writeup, and the patched repo.

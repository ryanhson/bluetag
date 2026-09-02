const bcrypt = require("bcryptjs");
const db = require("./db");

function seed() {
  const existing = db.prepare("SELECT COUNT(*) AS n FROM users").get().n;
  if (existing > 0) {
    return { seeded: false, users: existing };
  }

  const hash = (plain) => bcrypt.hashSync(plain, 10);

  const insertUser = db.prepare(`
    INSERT INTO users (email, password_hash, display_name, staff_notes)
    VALUES (?, ?, ?, ?)
  `);

  const alex = insertUser.run(
    "alex@campus.edu",
    hash("campus123"),
    "Alex Rivera",
    null
  ).lastInsertRowid;

  const jordan = insertUser.run(
    "jordan@campus.edu",
    hash("campus123"),
    "Jordan Park",
    null
  ).lastInsertRowid;

  const sam = insertUser.run(
    "sam@campus.edu",
    hash("foundit!"),
    "Sam Okonkwo",
    null
  ).lastInsertRowid;

  insertUser.run(
    "publicsafety@campus.edu",
    hash("not-in-the-readme"),
    "Public Safety Desk",
    "Do not publish. High-value locker A-14 release code is BLUE-4419. After-hours drop is the west vestibule of Hullihen Hall."
  );

  const insertItem = db.prepare(`
    INSERT INTO items
      (user_id, kind, category, title, description, location, contact_pref, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertItem.run(
    alex, "lost", "ids", "Blue student ID sleeve",
    "Navy ID holder with a semester bus pass tucked behind the card. Name is faded. Last seen after the Tuesday chem lab.",
    "Brown Lab, 2nd floor hallway",
    "alex@campus.edu", "open", "2026-08-21 14:10:00"
  );
  insertItem.run(
    alex, "lost", "electronics", "Black iPad mini with cracked corner",
    "Has a sticker of the campus mascot on the back. Passcode lock is on. Reward if returned.",
    "Morris Library, quiet floor",
    "alex@campus.edu", "open", "2026-08-24 19:40:00"
  );
  insertItem.run(
    jordan, "found", "keys", "Set of three keys on a blue carabiner",
    "Two room keys and a smaller mailbox key. Found on the railing by the bike racks.",
    "Perkins student center bike rack",
    "jordan@campus.edu", "open", "2026-08-22 08:05:00"
  );
  insertItem.run(
    jordan, "found", "clothing", "Grey quarter-zip, size M",
    "Unbranded grey pullover left on a chair after the evening review session. No name inside.",
    "Gore Hall 116",
    "jordan@campus.edu", "open", "2026-08-25 21:15:00"
  );
  insertItem.run(
    sam, "found", "electronics", "White wireless earbuds case",
    "Case only, no buds inside. Found under a table in the food court. Slight scuff on the hinge.",
    "Trabant food court",
    "sam@campus.edu", "open", "2026-08-26 12:30:00"
  );
  insertItem.run(
    sam, "lost", "other", "Green Hydro Flask with tape on the lid",
    "Dented bottle, initials S.O. in silver marker. Lost between the green and the rec center.",
    "South green / Carpenter sports",
    "sam@campus.edu", "open", "2026-08-27 16:00:00"
  );
  insertItem.run(
    jordan, "found", "other", "Calculus notebook, spiral",
    "Half-full notebook, MATH 242 on the cover. Found in a lecture hall after the 9:05 section.",
    "Smith Hall 120",
    "jordan@campus.edu", "resolved", "2026-08-18 10:00:00"
  );
  insertItem.run(
    alex, "lost", "electronics", "Silver MacBook charger, 67W",
    "USB-C brick with a frayed strain relief. Left in the charging bar near the printers.",
    "Memorial Hall print lab",
    "alex@campus.edu", "removed", "2026-08-10 11:20:00"
  );

  const removedId = db.prepare("SELECT id FROM items WHERE status = 'removed'").get().id;
  db.prepare("INSERT INTO intake_log (item_id, note) VALUES (?, ?)").run(
    removedId,
    "Removed from public board at owner's request. Stored in public safety cage. Tag ID PS-8841."
  );

  return { seeded: true, users: 4 };
}

if (require.main === module) {
  const result = seed();
  console.log(result.seeded ? "Seeded a fresh BlueTag database." : "Database already has users; skipping seed.");
}

module.exports = seed;

import { db } from "./db.js";

const tables = db
  .prepare(
    "SELECT name FROM sqlite_master WHERE type = ? ORDER BY name"
  )
  .all("table");

console.log("Database tables:", tables);

const foreignKeys = db.prepare("PRAGMA foreign_keys").get();

console.log("Foreign key enforcement:", foreignKeys);


// Negative control test: reject customer records referencing nonexistent users.
try {
  db.prepare(`
    INSERT INTO customers (name, email, created_by, updated_by)
    VALUES (?, ?, ?, ?)
  `).run(
    "Invalid Test Customer",
    "invalid-test@example.com",
    -999,
    -999
  );

  console.error("FAIL: Invalid customer was accepted.");
  process.exitCode = 1;
} catch (error) {
  console.log("PASS: Invalid customer rejected by foreign key constraint.");
  console.log("Database error:", (error as Error).message);
}


db.close();
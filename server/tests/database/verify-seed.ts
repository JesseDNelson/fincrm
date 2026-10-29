import assert from "node:assert/strict";
import { db } from "../../src/db.js";

try {
  const users = db.prepare(`
    SELECT
      username,
      role,
      is_active,
      length(password_hash) AS hash_length
    FROM users
    ORDER BY username
  `).all() as {
    username: string;
    role: string;
    is_active: number;
    hash_length: number;
  }[];

  console.table(users);

  assert.equal(users.length, 4, "Expected exactly four accounts");

  const expectedRoles: Record<string, string> = {
    admin: "admin",
    manager: "manager",
    analyst: "analyst",
    viewer: "viewer"
  };

  for (const user of users) {
    assert.equal(user.role, expectedRoles[user.username]);
    assert.equal(user.is_active, 1);
    assert.equal(user.hash_length, 161);
  }

  console.log("PASS: All four seeded accounts verified.");
} finally {
  db.close();
}
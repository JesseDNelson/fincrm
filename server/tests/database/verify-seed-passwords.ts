import assert from "node:assert/strict";
import { db } from "../../src/db.js";
import { verifyPassword } from "../../src/password.js";

const accounts = [
  { username: "admin", envKey: "SEED_ADMIN_PASSWORD" },
  { username: "manager", envKey: "SEED_MANAGER_PASSWORD" },
  { username: "analyst", envKey: "SEED_ANALYST_PASSWORD" },
  { username: "viewer", envKey: "SEED_VIEWER_PASSWORD" }
];

try {
  const getUser = db.prepare(`
    SELECT password_hash
    FROM users
    WHERE username = ?
  `);

  for (const account of accounts) {
    const password = process.env[account.envKey];

    assert.ok(password, `Missing ${account.envKey}`);

    const user = getUser.get(account.username) as
      | { password_hash: string }
      | undefined;

    assert.ok(user, `Missing account: ${account.username}`);

    const valid = await verifyPassword(password, user.password_hash);

    assert.equal(valid, true, `${account.username} password verification failed`);

    console.log(`PASS: ${account.username} password verified`);
  }

  console.log("PASS: All seeded credentials verified.");
} finally {
  db.close();
}
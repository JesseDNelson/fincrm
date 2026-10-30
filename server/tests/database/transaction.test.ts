
import assert from "node:assert/strict";
import { test } from "node:test";
import { createDatabase } from "../../src/database-factory.js";

test("rolls back a customer insert when audit logging fails", () => {
  const database = createDatabase(":memory:");

  try {
    database.prepare(`
      INSERT INTO users (username, password_hash, role)
      VALUES (?, ?, ?)
    `).run("testanalyst", "test-hash", "analyst");

    const user = database.prepare(`
      SELECT id FROM users WHERE username = ?
    `).get("testanalyst") as { id: number };

    assert.throws(() => {
      database.exec("BEGIN IMMEDIATE");

      try {
        database.prepare(`
          INSERT INTO customers (
            name, email, status, created_by, updated_by
          )
          VALUES (?, ?, 'active', ?, ?)
        `).run(
          "Rollback Test",
          "rollback@example.com",
          user.id,
          user.id
        );

        // Deliberately violate the audit_logs outcome constraint.
        database.prepare(`
          INSERT INTO audit_logs (
            actor_user_id, action, entity_type, outcome
          )
          VALUES (?, ?, ?, ?)
        `).run(
          user.id,
          "customer.create",
          "customer",
          "invalid_outcome"
        );

        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    });

    const customer = database.prepare(`
      SELECT id FROM customers WHERE email = ?
    `).get("rollback@example.com");

    assert.equal(
      customer,
      undefined,
      "Customer must not persist when audit logging fails"
    );

    const auditCount = database.prepare(`
      SELECT COUNT(*) AS count FROM audit_logs
    `).get() as { count: number };

    assert.equal(auditCount.count, 0);
  } finally {
    database.close();
  }
});

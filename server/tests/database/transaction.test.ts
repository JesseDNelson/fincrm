
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unlinkSync } from "node:fs";

// Use a separate database for this test file.
// The environment variable must be set BEFORE importing db.ts.
const testDatabasePath = join(
  tmpdir(),
  `fincrm-transaction-test-${randomUUID()}.db`
);

process.env.FINCRM_DB_PATH = testDatabasePath;

const { db } = await import("../../src/db.js");
const { withTransaction } = await import("../../src/transaction.js");

after(() => {
  db.close();

  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    try {
      unlinkSync(testDatabasePath + suffix);
    } catch (error) {
      if (
        (error as NodeJS.ErrnoException).code !== "ENOENT"
      ) {
        throw error;
      }
    }
  }
});

function createTestUser(): number {
  const result = db.prepare(`
    INSERT INTO users (username, password_hash, role)
    VALUES (?, ?, ?)
  `).run(
    `analyst-${randomUUID()}`,
    "test-hash",
    "analyst"
  );

  return Number(result.lastInsertRowid);
}

test("commits customer and audit record together", () => {
  const userId = createTestUser();
  const email = `success-${randomUUID()}@example.com`;

  withTransaction(() => {
    const result = db.prepare(`
      INSERT INTO customers (
        name, email, status, created_by, updated_by
      )
      VALUES (?, ?, 'active', ?, ?)
    `).run(
      "Transaction Success",
      email,
      userId,
      userId
    );

    db.prepare(`
      INSERT INTO audit_logs (
        actor_user_id,
        action,
        entity_type,
        entity_id,
        outcome
      )
      VALUES (?, ?, ?, ?, ?)
    `).run(
      userId,
      "customer.create",
      "customer",
      Number(result.lastInsertRowid),
      "success"
    );
  });

  const customer = db.prepare(`
    SELECT id FROM customers WHERE email = ?
  `).get(email) as { id: number } | undefined;

  assert.ok(customer, "Customer must be saved");

  const audit = db.prepare(`
    SELECT actor_user_id, action, entity_id, outcome
    FROM audit_logs
    WHERE entity_type = 'customer'
      AND entity_id = ?
  `).get(customer.id) as {
    actor_user_id: number;
    action: string;
    entity_id: number;
    outcome: string;
  } | undefined;

  assert.ok(audit, "Audit record must be saved");
  assert.equal(audit.actor_user_id, userId);
  assert.equal(audit.action, "customer.create");
  assert.equal(audit.entity_id, customer.id);
  assert.equal(audit.outcome, "success");
});

test("rolls back customer insert when audit logging fails", () => {
  const userId = createTestUser();
  const email = `rollback-${randomUUID()}@example.com`;

  const auditCountBefore = db.prepare(`
    SELECT COUNT(*) AS count FROM audit_logs
  `).get() as { count: number };

  assert.throws(() => {
    withTransaction(() => {
      db.prepare(`
        INSERT INTO customers (
          name, email, status, created_by, updated_by
        )
        VALUES (?, ?, 'active', ?, ?)
      `).run(
        "Rollback Test",
        email,
        userId,
        userId
      );

      // Deliberately violate the audit outcome constraint.
      db.prepare(`
        INSERT INTO audit_logs (
          actor_user_id,
          action,
          entity_type,
          outcome
        )
        VALUES (?, ?, ?, ?)
      `).run(
        userId,
        "customer.create",
        "customer",
        "invalid_outcome"
      );
    });
  });

  const customer = db.prepare(`
    SELECT id FROM customers WHERE email = ?
  `).get(email);

  assert.equal(
    customer,
    undefined,
    "Customer must not persist when audit logging fails"
  );

  const auditCountAfter = db.prepare(`
    SELECT COUNT(*) AS count FROM audit_logs
  `).get() as { count: number };

  assert.equal(
    auditCountAfter.count,
    auditCountBefore.count,
    "Failed transaction must not create an audit record"
  );
});

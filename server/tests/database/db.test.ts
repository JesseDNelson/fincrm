import { test } from "node:test";
import assert from "node:assert/strict";
import { createDatabase } from "../../src/database-factory.js";

test("rejects customers referencing nonexistent users", () => {
  const database = createDatabase(":memory:");

  try {
    assert.throws(
      () => {
        database.prepare(`
          INSERT INTO customers (name, email, created_by, updated_by)
          VALUES (?, ?, ?, ?)
        `).run(
          "Invalid Test Customer",
          "invalid-test@example.com",
          -999,
          -999
        );
      },
      /FOREIGN KEY constraint failed/
    );
  } finally {
    database.close();
  }
});

test("rejects users with invalid roles", () => {
  const database = createDatabase(":memory:");

  try {
    assert.throws(
      () => {
        database.prepare(`
          INSERT INTO users (username, password_hash, role)
          VALUES (?, ?, ?)
        `).run(
          "invalid_user",
          "placeholder_hash",
          "superadmin"
        );
      },
      /CHECK constraint failed/
    );
  } finally {
    database.close();
  }
});

test("rejects duplicate usernames", () => {
  const database = createDatabase(":memory:");

  try {
    const insertUser = database.prepare(`
      INSERT INTO users (username, password_hash, role)
      VALUES (?, ?, ?)
    `);

    insertUser.run("testuser", "placeholder_hash", "analyst");

    assert.throws(
      () => {
        insertUser.run("testuser", "another_placeholder_hash", "viewer");
      },
      /UNIQUE constraint failed/
    );
  } finally {
    database.close();
  }
});

test("rejects duplicate customer emails", () => {
  const database = createDatabase(":memory:");

  try {
    // Create a valid user to satisfy the customer foreign keys.
    const user = database.prepare(`
      INSERT INTO users (username, password_hash, role)
      VALUES (?, ?, ?)
    `).run("testuser", "placeholder_hash", "analyst");

    const insertCustomer = database.prepare(`
      INSERT INTO customers (name, email, created_by, updated_by)
      VALUES (?, ?, ?, ?)
    `);

    insertCustomer.run(
      "Customer One",
      "duplicate@example.com",
      user.lastInsertRowid,
      user.lastInsertRowid
    );

    assert.throws(
      () => {
        insertCustomer.run(
          "Customer Two",
          "duplicate@example.com",
          user.lastInsertRowid,
          user.lastInsertRowid
        );
      },
      /UNIQUE constraint failed/
    );
  } finally {
    database.close();
  }
});


test("rejects invalid customer statuses", () => {
  const database = createDatabase(":memory:");

  try {
    const user = database.prepare(`
      INSERT INTO users (username, password_hash, role)
      VALUES (?, ?, ?)
    `).run("testuser", "placeholder_hash", "analyst");

    assert.throws(
      () => {
        database.prepare(`
          INSERT INTO customers (name, email, status, created_by, updated_by)
          VALUES (?, ?, ?, ?, ?)
        `).run(
          "Invalid Status Customer",
          "invalid-status@example.com",
          "deleted",
          user.lastInsertRowid,
          user.lastInsertRowid
        );
      },
      /CHECK constraint failed/
    );
  } finally {
    database.close();
  }
});

test("rejects invalid user active statuses", () => {
  const database = createDatabase(":memory:");

  try {
    assert.throws(
      () => {
        database.prepare(`
          INSERT INTO users (username, password_hash, role, is_active)
          VALUES (?, ?, ?, ?)
        `).run(
          "invalid_active_user",
          "placeholder_hash",
          "analyst",
          2
        );
      },
      /CHECK constraint failed/
    );
  } finally {
    database.close();
  }
});

test("accepts valid users and customer records", () => {
  const database = createDatabase(":memory:");

  try {
    const user = database.prepare(`
      INSERT INTO users (username, password_hash, role, is_active)
      VALUES (?, ?, ?, ?)
    `).run(
      "valid_user",
      "placeholder_hash",
      "analyst",
      1
    );

    const customer = database.prepare(`
      INSERT INTO customers (name, email, status, created_by, updated_by)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      "Valid Customer",
      "valid@example.com",
      "active",
      user.lastInsertRowid,
      user.lastInsertRowid
    );

    assert.equal(customer.changes, 1);

    const savedCustomer = database.prepare(`
      SELECT name, status, created_by
      FROM customers
      WHERE id = ?
    `).get(customer.lastInsertRowid) as {
      name: string;
      status: string;
      created_by: number;
    };

    assert.equal(savedCustomer.name, "Valid Customer");
    assert.equal(savedCustomer.status, "active");
    assert.equal(savedCustomer.created_by, Number(user.lastInsertRowid));
  } finally {
    database.close();
  }
});

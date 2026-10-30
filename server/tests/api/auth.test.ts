
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";
import { hashPassword } from "../../src/password.js";

let server: Server;
let baseUrl: string;
let testDirectory: string;

type Role = "admin" | "manager" | "analyst" | "viewer";

type AuditEvent = {
  id: number;
  username: string | null;
  action: string;
  entity_type: string;
  entity_id: number | null;
  outcome: string;
  created_at: string;
};

before(async () => {
  testDirectory = mkdtempSync(join(tmpdir(), "fincrm-api-test-"));
  process.env.FINCRM_DB_PATH = join(testDirectory, "test.db");

  const { db } = await import("../../src/db.js");

  for (const role of ["admin", "manager", "analyst", "viewer"] as const) {
    const password =
      role === "admin"
        ? "TestPassword123!"
        : `Test-${role}-Password123!`;

    const passwordHash = await hashPassword(password);

    db.prepare(`
      INSERT INTO users (username, password_hash, role)
      VALUES (?, ?, ?)
    `).run(`test${role}`, passwordHash, role);
  }

  const { app } = await import("../../src/app.js");

  server = app.listen(0);

  await new Promise<void>((resolve) => {
    if (server.listening) resolve();
    else server.once("listening", resolve);
  });

  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("Unable to determine test server port");
  }

  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  const { db } = await import("../../src/db.js");
  db.close();

  if (testDirectory) {
    rmSync(testDirectory, { recursive: true, force: true });
  }

  delete process.env.FINCRM_DB_PATH;
});

async function getAuditEvents(): Promise<AuditEvent[]> {
  const { db } = await import("../../src/db.js");

  return db.prepare(`
    SELECT
      a.id,
      u.username,
      a.action,
      a.entity_type,
      a.entity_id,
      a.outcome,
      a.created_at
    FROM audit_logs a
    LEFT JOIN users u ON u.id = a.actor_user_id
    ORDER BY a.id
  `).all() as AuditEvent[];
}

async function loginAs(role: Role): Promise<string> {
  const password =
    role === "admin"
      ? "TestPassword123!"
      : `Test-${role}-Password123!`;

  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: `test${role}`,
      password
    })
  });

  assert.equal(response.status, 200);

  const cookie = response.headers.get("set-cookie");
  assert.ok(cookie);

  return cookie.split(";")[0];
}

test("health endpoint responds successfully", async () => {
  const response = await fetch(`${baseUrl}/api/health`);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok" });
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("rejects invalid login credentials", async () => {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "testadmin",
      password: "WrongPassword"
    })
  });

  assert.equal(response.status, 401);
});

test("rejects unauthenticated access to customers", async () => {
  const response = await fetch(`${baseUrl}/api/customers`);

  assert.equal(response.status, 401);
});

test("authenticates valid credentials and creates a session", async () => {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "testadmin",
      password: "TestPassword123!"
    })
  });

  assert.equal(response.status, 200);

  const data = await response.json();
  assert.equal(data.user.username, "testadmin");
  assert.equal(data.user.role, "admin");

  const cookie = response.headers.get("set-cookie");
  assert.ok(cookie, "Login must set a session cookie");
  assert.match(cookie, /HttpOnly/i);

  const sessionCookie = cookie.split(";")[0];

  const meResponse = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { Cookie: sessionCookie }
  });

  assert.equal(meResponse.status, 200);

  const meData = await meResponse.json();
  assert.equal(meData.user.username, "testadmin");

  const logoutResponse = await fetch(`${baseUrl}/api/auth/logout`, {
    method: "POST",
    headers: { Cookie: sessionCookie }
  });

  assert.equal(logoutResponse.status, 200);

  const revokedResponse = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { Cookie: sessionCookie }
  });

  assert.equal(revokedResponse.status, 401);
});

test("viewer can read customers but cannot create them", async () => {
  const cookie = await loginAs("viewer");

  const readResponse = await fetch(`${baseUrl}/api/customers`, {
    headers: { Cookie: cookie }
  });

  assert.equal(readResponse.status, 200);

  const createResponse = await fetch(`${baseUrl}/api/customers`, {
    method: "POST",
    headers: {
      Cookie: cookie,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      name: "Unauthorized Customer",
      email: "unauthorized@example.com"
    })
  });

  assert.equal(createResponse.status, 403);
});

test("analyst can create and edit customers but cannot deactivate", async () => {
  const cookie = await loginAs("analyst");

  const createResponse = await fetch(`${baseUrl}/api/customers`, {
    method: "POST",
    headers: {
      Cookie: cookie,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      name: "Integration Test Customer",
      email: "integration@example.com"
    })
  });

  assert.equal(createResponse.status, 201);

  const createData = await createResponse.json();
  const customerId = createData.customer.id as number;

  const updateResponse = await fetch(
    `${baseUrl}/api/customers/${customerId}`,
    {
      method: "PATCH",
      headers: {
        Cookie: cookie,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: "Updated Integration Customer",
        email: "integration@example.com"
      })
    }
  );

  assert.equal(updateResponse.status, 200);

  const deactivateResponse = await fetch(
    `${baseUrl}/api/customers/${customerId}/deactivate`,
    {
      method: "PATCH",
      headers: { Cookie: cookie }
    }
  );

  assert.equal(deactivateResponse.status, 403);
});

test("manager can deactivate an active customer", async () => {
  const analystCookie = await loginAs("analyst");

  const createResponse = await fetch(`${baseUrl}/api/customers`, {
    method: "POST",
    headers: {
      Cookie: analystCookie,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      name: "Manager Deactivation Test",
      email: "manager-test@example.com"
    })
  });

  assert.equal(createResponse.status, 201);

  const createData = await createResponse.json();
  const customerId = createData.customer.id as number;

  const managerCookie = await loginAs("manager");

  const deactivateResponse = await fetch(
    `${baseUrl}/api/customers/${customerId}/deactivate`,
    {
      method: "PATCH",
      headers: { Cookie: managerCookie }
    }
  );

  assert.equal(deactivateResponse.status, 200);

  const { db } = await import("../../src/db.js");

  const customer = db.prepare(`
    SELECT status FROM customers WHERE id = ?
  `).get(customerId) as { status: string };

  assert.equal(customer.status, "inactive");
});

test("audit log attributes successful and denied actions", async () => {
  const events = await getAuditEvents();

  for (const action of [
    "customer.create",
    "customer.update",
    "customer.deactivate"
  ]) {
    assert.ok(
      events.some(
        (event) =>
          event.action === action &&
          event.outcome === "success"
      ),
      `Missing successful audit event: ${action}`
    );
  }

  assert.ok(
    events.some(
      (event) =>
        event.username === "testviewer" &&
        event.outcome === "denied"
    )
  );

  assert.ok(
    events.some(
      (event) =>
        event.username === "testanalyst" &&
        event.action === "access.denied.patch" &&
        event.outcome === "denied"
    )
  );
});

test("failed login generates an attributed audit event", async () => {
  const eventsBefore = await getAuditEvents();

  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "testmanager",
      password: "DefinitelyWrongPassword"
    })
  });

  assert.equal(response.status, 401);

  const eventsAfter = await getAuditEvents();

  const newEvents = eventsAfter.slice(eventsBefore.length);

  assert.equal(newEvents.length, 1);
  assert.equal(newEvents[0].username, "testmanager");
  assert.equal(newEvents[0].action, "auth.login.failed");
  assert.equal(newEvents[0].entity_type, "user");
  assert.equal(newEvents[0].outcome, "failure");
  assert.ok(newEvents[0].created_at);
});

test("customer modification audit events match the customer records", async () => {
  const { db } = await import("../../src/db.js");
  const events = await getAuditEvents();

  const customerEvents = events.filter(
    (event) =>
      event.entity_type === "customer" &&
      event.outcome === "success" &&
      [
        "customer.create",
        "customer.update",
        "customer.deactivate"
      ].includes(event.action)
  );

  // Earlier tests performed:
  // 2 successful creations, 1 update, 1 deactivation.
  assert.equal(customerEvents.length, 4);

  const counts = {
    "customer.create": 0,
    "customer.update": 0,
    "customer.deactivate": 0
  };

  for (const event of customerEvents) {
    assert.ok(event.entity_id, "Audit event must identify a customer");
    assert.ok(event.username, "Audit event must identify an actor");
    assert.ok(event.created_at, "Audit event must have a timestamp");

    const customer = db.prepare(`
      SELECT id FROM customers WHERE id = ?
    `).get(event.entity_id);

    assert.ok(
      customer,
      `Audit event ${event.id} references a missing customer`
    );

    counts[event.action as keyof typeof counts]++;
  }

  assert.deepEqual(counts, {
    "customer.create": 2,
    "customer.update": 1,
    "customer.deactivate": 1
  });

  const deactivation = customerEvents.find(
    (event) => event.action === "customer.deactivate"
  );

  assert.equal(deactivation?.username, "testmanager");

  const update = customerEvents.find(
    (event) => event.action === "customer.update"
  );

  assert.equal(update?.username, "testanalyst");
});


test("rejects login requests from an untrusted origin", async () => {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://malicious.example"
    },
    body: JSON.stringify({
      username: "testadmin",
      password: "TestPassword123!"
    })
  });

  assert.equal(response.status, 403);
});

test("allows a trusted origin through the origin check", async () => {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost:5173"
    },
    body: JSON.stringify({
      username: "testadmin",
      password: "TestPassword123!"
    })
  });

  assert.equal(response.status, 200);
});

test("rate limits repeated failed login attempts", async () => {
  // Use a unique address so the test does not share a rate-limit
  // bucket with earlier authentication tests.
  const address = server.address();

  assert.ok(address && typeof address !== "string");

  const isolatedBaseUrl = `http://127.0.0.2:${address.port}`;

  for (let attempt = 1; attempt <= 5; attempt++) {
    const response = await fetch(
      `${isolatedBaseUrl}/api/auth/login`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          username: "testadmin",
          password: "IncorrectPassword"
        })
      }
    );

    assert.equal(
      response.status,
      401,
      `Attempt ${attempt} should return 401`
    );
  }

  const blockedResponse = await fetch(
    `${isolatedBaseUrl}/api/auth/login`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        username: "testadmin",
        password: "IncorrectPassword"
      })
    }
  );

  assert.equal(blockedResponse.status, 429);
  assert.ok(blockedResponse.headers.get("retry-after"));
});

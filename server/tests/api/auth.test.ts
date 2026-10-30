
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

before(async () => {
  // Set the database path before importing the application.
  testDirectory = mkdtempSync(join(tmpdir(), "fincrm-api-test-"));
  process.env.FINCRM_DB_PATH = join(testDirectory, "test.db");

  const { db } = await import("../../src/db.js");

  const passwordHash = await hashPassword("TestPassword123!");

    db.prepare(`
    INSERT INTO users (username, password_hash, role)
    VALUES (?, ?, ?)
    `).run("testadmin", passwordHash, "admin");

    for (const role of ["manager", "analyst", "viewer"] as const) {
        const passwordHash = await hashPassword(`Test-${role}-Password123!`);

        db.prepare(`
            INSERT INTO users (username, password_hash, role)
            VALUES (?, ?, ?)
        `).run(`test${role}`, passwordHash, role);
        }

  const { app } = await import("../../src/app.js");

  server = app.listen(0);

  await new Promise<void>((resolve) => {
    if (server.listening) {
      resolve();
    } else {
      server.once("listening", resolve);
    }
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

test("health endpoint responds successfully", async () => {
  const response = await fetch(`${baseUrl}/api/health`);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok" });
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


async function loginAs(
  role: "admin" | "manager" | "analyst" | "viewer"
): Promise<string> {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: `test${role}`,
      password:
        role === "admin"
          ? "TestPassword123!"
          : `Test-${role}-Password123!`
    })
  });

  assert.equal(response.status, 200);

  const cookie = response.headers.get("set-cookie");
  assert.ok(cookie);

  return cookie.split(";")[0];
}

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
  const { db } = await import("../../src/db.js");

  const events = db.prepare(`
    SELECT
      u.username,
      a.action,
      a.outcome
    FROM audit_logs a
    LEFT JOIN users u ON u.id = a.actor_user_id
  `).all() as Array<{
    username: string;
    action: string;
    outcome: string;
  }>;

  assert.ok(
    events.some(
      (event) =>
        event.username === "testanalyst" &&
        event.action === "customer.create" &&
        event.outcome === "success"
    )
  );

  assert.ok(
    events.some(
      (event) =>
        event.username === "testanalyst" &&
        event.action === "customer.update" &&
        event.outcome === "success"
    )
  );

  assert.ok(
    events.some(
      (event) =>
        event.username === "testmanager" &&
        event.action === "customer.deactivate" &&
        event.outcome === "success"
    )
  );

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

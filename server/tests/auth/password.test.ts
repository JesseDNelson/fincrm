import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hashPassword,
  verifyPassword
} from "../../src/password.js";

test("verifies a correct password", async () => {
  const password = "ExamplePassword123!";
  const storedHash = await hashPassword(password);

  const result = await verifyPassword(password, storedHash);

  assert.equal(result, true);
});

test("rejects an incorrect password", async () => {
  const storedHash = await hashPassword("CorrectPassword123!");

  const result = await verifyPassword(
    "WrongPassword123!",
    storedHash
  );

  assert.equal(result, false);
});

test("generates unique salted hashes for identical passwords", async () => {
  const password = "ExamplePassword123!";

  const firstHash = await hashPassword(password);
  const secondHash = await hashPassword(password);

  assert.notEqual(firstHash, secondHash);
});

test("rejects malformed stored password hashes", async () => {
  const result = await verifyPassword(
    "ExamplePassword123!",
    "invalid-hash"
  );

  assert.equal(result, false);
});
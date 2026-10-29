import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);

export async function hashPassword(password: string): Promise<string> {
  // Generate a unique, cryptographically secure salt for each password.
  const salt = randomBytes(16).toString("hex");

  // Derive a 64-byte hash using a password-specific salt.
  const derivedKey = (await scrypt(password, salt, 64)) as Buffer;

  // Store the salt alongside the hash so passwords can be verified later.
  return `${salt}:${derivedKey.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  storedHash: string
): Promise<boolean> {
  const parts = storedHash.split(":");

  // Reject malformed stored hashes.
  if (
    parts.length !== 2 ||
    !/^[0-9a-f]{32}$/.test(parts[0]) ||
    !/^[0-9a-f]{128}$/.test(parts[1])
  ) {
    return false;
  }

  const [salt, originalHash] = parts;

  // Hash the submitted password using the original salt.
  const derivedKey = (await scrypt(password, salt, 64)) as Buffer;
  const storedKey = Buffer.from(originalHash, "hex");

  // Compare hashes without a content-dependent early exit.
  return timingSafeEqual(derivedKey, storedKey);
}
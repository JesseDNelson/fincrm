
import { Router } from "express";
import { randomBytes, createHash } from "node:crypto";
import { db } from "./db.js";
import { verifyPassword } from "./password.js";
import { writeAuditLog } from "./audit.js";
import { authenticate } from "./middleware/authenticate.js";

export const authRouter = Router();

const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;
const COOKIE_NAME = "fincrm_session";

// POST /api/auth/login
authRouter.post("/login", async (req, res) => {
  const { username, password } = req.body ?? {};

  if (
    typeof username !== "string" ||
    typeof password !== "string"
  ) {
    res.status(400).json({
      error: "Username and password are required"
    });
    return;
  }

  const user = db.prepare(`
    SELECT id, username, role, password_hash, is_active
    FROM users
    WHERE username = ?
  `).get(username) as {
    id: number;
    username: string;
    role: string;
    password_hash: string;
    is_active: number;
  } | undefined;

  // Return the same error for unknown users, inactive users,
  // and incorrect passwords to prevent username enumeration.
  if (
    !user ||
    !user.is_active ||
    !(await verifyPassword(password, user.password_hash))
  ) {
    // Record the failed authentication attempt.
    // Never store passwords or session tokens in audit logs.
    writeAuditLog({
      actorUserId: user?.id ?? null,
      action: "auth.login.failed",
      entityType: "user",
      entityId: user?.id ?? null,
      outcome: "failure",
      details: "Authentication failed: invalid credentials"
    });

    res.status(401).json({
      error: "Invalid credentials"
    });
    return;
  }

  // Generate a cryptographically random session token.
  const token = randomBytes(32).toString("hex");

  // Store only the hash in the database.
  const tokenHash = createHash("sha256")
    .update(token)
    .digest("hex");

  const expiresAt = new Date(
    Date.now() + SESSION_DURATION_MS
  ).toISOString();

  db.prepare(`
    INSERT INTO sessions (id, user_id, expires_at)
    VALUES (?, ?, ?)
  `).run(tokenHash, user.id, expiresAt);

  // Send the session token to the browser as a cookie.
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_DURATION_MS,
    path: "/"
  });

  res.json({
    user: {
      id: user.id,
      username: user.username,
      role: user.role
    }
  });
});

// POST /api/auth/logout
authRouter.post("/logout", (req, res) => {
  const cookieHeader = req.headers.cookie ?? "";

  const token = cookieHeader
    .split(";")
    .map(part => part.trim())
    .find(part => part.startsWith(`${COOKIE_NAME}=`))
    ?.slice(COOKIE_NAME.length + 1);

  if (token) {
    const tokenHash = createHash("sha256")
      .update(token)
      .digest("hex");

    // Delete the server-side session.
    db.prepare(`
      DELETE FROM sessions WHERE id = ?
    `).run(tokenHash);
  }

  res.clearCookie(COOKIE_NAME, { path: "/" });

  res.json({
    message: "Logged out"
  });
});

// GET /api/auth/me
authRouter.get("/me", authenticate, (req, res) => {
  res.json({ user: req.user });
});

import { Router } from "express";
import { randomBytes, createHash } from "node:crypto";
import { getPostgresPool } from "./postgres.js";
import { verifyPassword } from "./password.js";
import { writePostgresAuditLog } from "./postgres-audit.js";
import { postgresAuthenticate } from "./middleware/postgres-authenticate.js";

export const postgresAuthRouter = Router();

const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;
const COOKIE_NAME = "fincrm_session";

type DatabaseUser = {
  id: number;
  username: string;
  role: "admin" | "manager" | "analyst" | "viewer";
  password_hash: string;
  is_active: number;
};

// POST /api/auth/login
postgresAuthRouter.post("/login", async (req, res) => {
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

  const result = await getPostgresPool().query<DatabaseUser>(
    `
      SELECT id, username, role, password_hash, is_active
      FROM users
      WHERE username = $1
    `,
    [username]
  );

  const user = result.rows[0];

  // Return the same response for unknown, disabled,
  // and incorrectly authenticated users.
  const validPassword =
    user && user.is_active === 1
      ? await verifyPassword(password, user.password_hash)
      : false;

  if (!user || !validPassword) {
    await writePostgresAuditLog({
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

  const token = randomBytes(32).toString("hex");

  const tokenHash = createHash("sha256")
    .update(token)
    .digest("hex");

  const expiresAt = new Date(
    Date.now() + SESSION_DURATION_MS
  );

  await getPostgresPool().query(
    `
      INSERT INTO sessions (id, user_id, expires_at)
      VALUES ($1, $2, $3)
    `,
    [tokenHash, user.id, expiresAt]
  );

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
postgresAuthRouter.post("/logout", async (req, res) => {
  const token = (req.headers.cookie ?? "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE_NAME}=`))
    ?.slice(COOKIE_NAME.length + 1);

  if (token && /^[0-9a-f]{64}$/.test(token)) {
    const tokenHash = createHash("sha256")
      .update(token)
      .digest("hex");

    await getPostgresPool().query(
      "DELETE FROM sessions WHERE id = $1",
      [tokenHash]
    );
  }

  res.clearCookie(COOKIE_NAME, {
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax"
  });

  res.json({
    message: "Logged out"
  });
});

// GET /api/auth/me
postgresAuthRouter.get(
  "/me",
  postgresAuthenticate,
  (req, res) => {
    res.json({ user: req.user });
  }
);

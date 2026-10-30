import type { Request, Response, NextFunction } from "express";
import { createHash } from "node:crypto";
import { db } from "../db.js";

export type AuthenticatedUser = {
  id: number;
  username: string;
  role: "admin" | "manager" | "analyst" | "viewer";
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const cookie = req.headers.cookie
    ?.split(";")
    .map(part => part.trim())
    .find(part => part.startsWith("fincrm_session="));

  const token = cookie?.slice("fincrm_session=".length);

  if (!token || !/^[0-9a-f]{64}$/.test(token)) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const tokenHash = createHash("sha256")
    .update(token)
    .digest("hex");

  const session = db.prepare(`
    SELECT u.id, u.username, u.role
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.id = ?
      AND s.expires_at > ?
      AND u.is_active = 1
  `).get(tokenHash, new Date().toISOString()) as
    | AuthenticatedUser
    | undefined;

  if (!session) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  req.user = session;
  next();
}
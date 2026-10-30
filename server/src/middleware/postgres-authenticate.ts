import type { Request, Response, NextFunction } from "express";
import { createHash } from "node:crypto";
import type { AuthenticatedUser } from "./authenticate.js";
import { getPostgresPool } from "../postgres.js";

export async function postgresAuthenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const cookie = req.headers.cookie
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("fincrm_session="));

  const token = cookie?.slice("fincrm_session=".length);

  if (!token || !/^[0-9a-f]{64}$/.test(token)) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const tokenHash = createHash("sha256")
    .update(token)
    .digest("hex");

  try {
    const result = await getPostgresPool().query<AuthenticatedUser>(
      `
        SELECT u.id, u.username, u.role
        FROM sessions s
        JOIN users u ON u.id = s.user_id
        WHERE s.id = $1
          AND s.expires_at > CURRENT_TIMESTAMP
          AND u.is_active = 1
      `,
      [tokenHash]
    );

    const session = result.rows[0];

    if (!session) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    req.user = session;
    next();
  } catch (error) {
    next(error);
  }
}

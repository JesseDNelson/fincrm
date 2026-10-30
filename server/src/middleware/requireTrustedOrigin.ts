import type { Request, Response, NextFunction } from "express";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function requireTrustedOrigin(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  const origin = req.get("Origin");

  const allowedOrigins = new Set(
    (process.env.ALLOWED_ORIGINS ?? "http://localhost:5173")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  );

  if (!origin) {
    // Permitted for local API testing.
    // Production should also validate Fetch Metadata
    // or require a trusted Origin/Referer.
    next();
    return;
  }

  if (!allowedOrigins.has(origin)) {
    res.status(403).json({
      error: "Request origin is not trusted.",
    });
    return;
  }

  next();
}
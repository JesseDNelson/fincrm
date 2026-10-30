import type { Request, Response, NextFunction } from "express";

const MAX_FAILED_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

type AttemptRecord = {
  failures: number;
  resetAt: number;
};

const attempts = new Map<string, AttemptRecord>();

export function loginRateLimit(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const ip = req.ip ?? "unknown";
  const now = Date.now();

  let record = attempts.get(ip);

  if (record && now >= record.resetAt) {
    attempts.delete(ip);
    record = undefined;
  }

  if (record && record.failures >= MAX_FAILED_ATTEMPTS) {
    res.setHeader(
      "Retry-After",
      String(Math.ceil((record.resetAt - now) / 1000))
    );

    res.status(429).json({
      error: "Too many failed login attempts. Please try again later.",
    });
    return;
  }

  res.on("finish", () => {
    if (res.statusCode === 401) {
      const current = attempts.get(ip);
      const currentTime = Date.now();

      if (!current || currentTime >= current.resetAt) {
        attempts.set(ip, {
          failures: 1,
          resetAt: currentTime + WINDOW_MS,
        });
      } else {
        current.failures += 1;
      }
    }

    if (res.statusCode === 200) {
      attempts.delete(ip);
    }
  });

  next();
}
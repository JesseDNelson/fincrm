import express from "express";

import { authRouter } from "./auth.js";
import { customersRouter } from "./customers.js";

import { postgresAuthRouter } from "./postgres-auth.js";
import { postgresCustomersRouter } from "./postgres-customers.js";

import { loginRateLimit } from "./middleware/loginRateLimit.js";
import { requireTrustedOrigin } from "./middleware/requireTrustedOrigin.js";

export const app = express();

const usePostgres = Boolean(process.env.DATABASE_URL);

app.use(express.json());

// Prevent browsers from caching API responses.
app.use("/api", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

// Validate request origins to reduce CSRF risk.
app.use("/api", requireTrustedOrigin);

// Health check endpoint.
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Limit repeated failed login attempts.
app.use("/api/auth/login", loginRateLimit);

// Select one database backend.
// Never mount both sets of routes simultaneously.
if (usePostgres) {
  app.use("/api/auth", postgresAuthRouter);
  app.use("/api/customers", postgresCustomersRouter);
} else {
  app.use("/api/auth", authRouter);
  app.use("/api/customers", customersRouter);
}

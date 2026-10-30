
import express from "express";
import { authRouter } from "./auth.js";
import { customersRouter } from "./customers.js";

export const app = express();

app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRouter);
app.use("/api/customers", customersRouter);

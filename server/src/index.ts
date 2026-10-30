
import { app } from "./app.js";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import express from "express";

const PORT = Number(process.env.PORT) || 3000;

// The production frontend build lives in client/dist.
// This path assumes the server starts from the server/ directory.
const clientDistPath = resolve(
  process.cwd(),
  "..",
  "client",
  "dist"
);

if (existsSync(clientDistPath)) {
  // Serve React's compiled JavaScript, CSS, and other assets.
  app.use(express.static(clientDistPath));

  // Let React handle frontend routes.
  // Do not return index.html for unknown API endpoints.
  app.get("/{*path}", (req, res, next) => {
    if (req.path.startsWith("/api")) {
      next();
      return;
    }

    res.sendFile(resolve(clientDistPath, "index.html"));
  });

  console.log("Serving React frontend from:", clientDistPath);
} else {
  console.log(
    "React production build not found; API-only mode."
  );
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`FinCRM running on port ${PORT}`);
});

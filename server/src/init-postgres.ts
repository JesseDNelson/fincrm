
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getPostgresPool, closePostgresPool } from "./postgres.js";

async function main(): Promise<void> {
  const schemaPath = resolve(
    process.cwd(),
    "src",
    "schema.postgres.sql"
  );

  const schema = readFileSync(schemaPath, "utf8");
  const pool = getPostgresPool();

  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(schema);
    await client.query("COMMIT");

    console.log("PostgreSQL schema initialized successfully.");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

main()
  .catch((error) => {
    console.error("PostgreSQL initialization failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePostgresPool();
  });

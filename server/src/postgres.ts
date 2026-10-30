
import pg from "pg";

const { Pool } = pg;

let pool: pg.Pool | undefined;

export function getPostgresPool(): pg.Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
      throw new Error(
        "DATABASE_URL is required for PostgreSQL connections"
      );
    }

    pool = new Pool({
      connectionString,
      max: 5,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 30000
    });
  }

  return pool;
}

export async function closePostgresPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}

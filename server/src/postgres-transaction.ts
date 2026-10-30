import type { PoolClient } from "pg";
import { getPostgresPool } from "./postgres.js";

export async function withPostgresTransaction<T>(
  operation: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getPostgresPool().connect();

  try {
    await client.query("BEGIN");

    const result = await operation(client);

    await client.query("COMMIT");

    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error(
        "PostgreSQL transaction rollback failed:",
        rollbackError
      );
    }

    throw error;
  } finally {
    client.release();
  }
}

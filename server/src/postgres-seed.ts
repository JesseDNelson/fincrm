import { getPostgresPool, closePostgresPool } from "./postgres.js";
import { hashPassword } from "./password.js";

const seedUsers = [
  { username: "admin", role: "admin" },
  { username: "manager", role: "manager" },
  { username: "analyst", role: "analyst" },
  { username: "viewer", role: "viewer" }
] as const;

async function seedPostgres(): Promise<void> {
  const passwords: Record<string, string | undefined> = {
    admin: process.env.SEED_ADMIN_PASSWORD,
    manager: process.env.SEED_MANAGER_PASSWORD,
    analyst: process.env.SEED_ANALYST_PASSWORD,
    viewer: process.env.SEED_VIEWER_PASSWORD
  };

  if (Object.values(passwords).some((password) => !password)) {
    throw new Error("All four seed account passwords are required.");
  }

  if (new Set(Object.values(passwords)).size !== 4) {
    throw new Error("Seed account passwords must be distinct.");
  }

  const pool = getPostgresPool();

  for (const user of seedUsers) {
    const passwordHash = await hashPassword(passwords[user.username]!);

    const result = await pool.query(
      `
        INSERT INTO users (username, password_hash, role)
        VALUES ($1, $2, $3)
        ON CONFLICT (username) DO NOTHING
        RETURNING id
      `,
      [user.username, passwordHash, user.role]
    );

    if (result.rowCount === 1) {
      console.log(`Created ${user.username} (${user.role})`);
    } else {
      console.log(`Skipped ${user.username} (already exists)`);
    }
  }

  console.log("PostgreSQL seeding complete.");
}

try {
  await seedPostgres();
} catch (error) {
  console.error("PostgreSQL seeding failed:", error);
  process.exitCode = 1;
} finally {
  await closePostgresPool();
}

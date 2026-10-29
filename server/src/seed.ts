import { db } from "./db.js";
import { hashPassword } from "./password.js";

const seedUsers = [
  { username: "admin", role: "admin" },
  { username: "manager", role: "manager" },
  { username: "analyst", role: "analyst" },
  { username: "viewer", role: "viewer" }
];

async function seedDatabase() {
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
    const insertUser = db.prepare(`
    INSERT INTO users (username, password_hash, role)
    VALUES (?, ?, ?)
    ON CONFLICT(username) DO NOTHING
    `);

  for (const user of seedUsers) {
    const passwordHash = await hashPassword(passwords[user.username]!);

    const result = insertUser.run(
      user.username,
      passwordHash,
      user.role
    );

    if (result.changes === 1) {
      console.log(`Created ${user.username} (${user.role})`);
    } else {
      console.log(`Skipped ${user.username} (already exists)`);
    }
  }

  console.log("Database seeding complete.");
}

try {
  await seedDatabase();
} finally {
  db.close();
}
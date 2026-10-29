import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const schemaPath = resolve(process.cwd(), "src", "schema.sql");

export function createDatabase(path: string): DatabaseSync {
  const database = new DatabaseSync(path);

  // Enforce relationships between users, customers, and audit events.
  database.exec("PRAGMA foreign_keys = ON");

  // Apply the same schema to application and test databases.
  const schema = readFileSync(schemaPath, "utf8");
  database.exec(schema);

  return database;
}
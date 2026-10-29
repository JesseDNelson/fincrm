import { resolve } from "node:path";
import { createDatabase } from "./database-factory.js";

// Persistent database connection used by the application.
export const db = createDatabase(resolve(process.cwd(), "fincrm.db"));
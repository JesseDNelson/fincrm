import { resolve } from "node:path";
import { createDatabase } from "./database-factory.js";

const databasePath = process.env.FINCRM_DB_PATH
  ? resolve(process.env.FINCRM_DB_PATH)
  : resolve(process.cwd(), "fincrm.db");

export const db = createDatabase(databasePath);

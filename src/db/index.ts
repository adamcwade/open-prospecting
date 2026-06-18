import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";

let _db: NeonHttpDatabase<typeof schema> | null = null;

function getDb(): NeonHttpDatabase<typeof schema> {
  if (_db) return _db;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "[modus] DATABASE_URL is not set. Configure Neon in .env.local before making database calls."
    );
  }

  const sql = neon(connectionString);
  _db = drizzle(sql, { schema });
  return _db;
}

/**
 * Lazy db proxy: the underlying Neon client is only constructed on first query,
 * so importing this module during build (without env vars) does not crash.
 */
export const db = new Proxy({} as NeonHttpDatabase<typeof schema>, {
  get(_target, prop) {
    const real = getDb() as unknown as Record<string | symbol, unknown>;
    const value = real[prop];
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export { schema };

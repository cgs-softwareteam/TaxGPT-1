import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";

// Feature flag to control database initialization
const ENABLE_DATABASE_STORAGE = process.env.ENABLE_DATABASE_STORAGE === 'true';

let db: ReturnType<typeof drizzle> | null = null;
let pool: Pool | null = null;

export function initializeDatabase() {
  if (!ENABLE_DATABASE_STORAGE) {
    return null;
  }

  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL must be set when ENABLE_DATABASE_STORAGE is true. Did you forget to provision a database?",
    );
  }

  try {
    // Connection pool tuned for Neon (serverless Postgres) on Render.
    //
    // CRITICAL: Neon auto-suspends idle compute after ~5 min, which kills any
    // open connections. The pg driver then emits 'error' events on those
    // Clients. We MUST attach a pool-level error handler — otherwise Node
    // treats the unhandled 'error' as fatal and crashes the whole process.
    //
    // We also keep min=0: holding connections open across Neon's idle suspend
    // is what causes the terminations in the first place. Spinning up fresh
    // connections on demand (~50ms cold) is far cheaper than restarting the
    // whole web service every few minutes.
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: process.env.NODE_ENV === 'production' ? 20 : 10,
      min: 0,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      allowExitOnIdle: false,
      keepAlive: true,
    });

    // Without this listener, an idle-client connection drop crashes Node.
    pool.on('error', (err) => {
      console.error('[pg pool] idle client error (likely Neon auto-suspend):', err.message);
    });

    db = drizzle(pool, { schema });
    return db;
  } catch (error) {
    console.error('Failed to initialize database:', error);
    throw error;
  }
}

export function getDatabase() {
  if (!db && ENABLE_DATABASE_STORAGE) {
    return initializeDatabase();
  }
  return db;
}

export { db };
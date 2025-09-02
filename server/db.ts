import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

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
    // Optimize connection pool for Render deployment
    pool = new Pool({ 
      connectionString: process.env.DATABASE_URL,
      max: process.env.NODE_ENV === 'production' ? 20 : 10, // Render connection limits
      min: 2, // Keep minimum connections open
      idleTimeoutMillis: 30000, // Close idle connections after 30s
      connectionTimeoutMillis: 5000, // Connection timeout for responsiveness
      allowExitOnIdle: false // Keep pool alive
    });
    db = drizzle({ client: pool, schema });
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
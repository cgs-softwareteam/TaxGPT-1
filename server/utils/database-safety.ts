import { db } from "../db";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

/**
 * Application Error class for proper error classification and handling
 */
export class ApplicationError extends Error {
  constructor(
    message: string,
    public type: 'database' | 'auth' | 'external' | 'validation' | 'system',
    public code: string,
    public statusCode: number = 500,
    public recoverable: boolean = true,
    public context?: Record<string, any>
  ) {
    super(message);
    this.name = 'ApplicationError';
  }
}

/**
 * Safe database operation wrapper to handle null database gracefully
 */
export async function safeDbOperation<T>(
  operation: (db: NodePgDatabase<any>) => Promise<T>,
  fallback?: () => Promise<T>
): Promise<T> {
  try {
    if (!db) {
      if (fallback) {
        console.warn('Database unavailable, using fallback operation');
        return await fallback();
      }
      throw new ApplicationError(
        'Database not available - please check database configuration',
        'database',
        'DB_NOT_AVAILABLE',
        503,
        true
      );
    }
    
    return await operation(db);
  } catch (error: unknown) {
    if (error instanceof ApplicationError) {
      throw error;
    }
    
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Handle database connection errors
    if (errorMessage.includes('connection') || errorMessage.includes('timeout')) {
      throw new ApplicationError(
        'Database connection failed - please try again',
        'database',
        'DB_CONNECTION_FAILED',
        503,
        true,
        { originalError: errorMessage }
      );
    }
    
    // Handle constraint violations
    if (errorMessage.includes('unique constraint') || errorMessage.includes('duplicate key')) {
      throw new ApplicationError(
        'This record already exists',
        'validation',
        'DUPLICATE_RECORD',
        409,
        true,
        { originalError: errorMessage }
      );
    }
    
    // Handle foreign key violations
    if (errorMessage.includes('foreign key') || errorMessage.includes('violates')) {
      throw new ApplicationError(
        'Invalid reference - related record not found',
        'validation',
        'INVALID_REFERENCE',
        400,
        true,
        { originalError: errorMessage }
      );
    }
    
    // Generic database error
    throw new ApplicationError(
      `Database operation failed: ${errorMessage}`,
      'database',
      'DB_OPERATION_FAILED',
      500,
      true,
      { originalError: errorMessage }
    );
  }
}

/**
 * Test database connection health
 */
export async function testDatabaseConnection(): Promise<boolean> {
  try {
    if (!db) return false;
    
    // Simple query to test connection
    await db.execute('SELECT 1 as test');
    return true;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn('Database connection test failed:', errorMessage);
    return false;
  }
}

/**
 * Get database connection status
 */
export function getDatabaseStatus(): 'connected' | 'disconnected' | 'error' | 'unknown' {
  if (!db) return 'disconnected';
  
  // We can't easily check connection state without making a query
  // This will be enhanced when we implement the health monitoring system
  return 'unknown';
}
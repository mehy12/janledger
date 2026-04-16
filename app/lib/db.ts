import { Pool } from 'pg';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required.');
}

const globalForPool = globalThis as unknown as { pgPool?: Pool };

const pool =
  globalForPool.pgPool ??
  new Pool({
    connectionString: databaseUrl,
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPool.pgPool = pool;
}

export { pool };

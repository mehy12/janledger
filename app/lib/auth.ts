import { betterAuth } from 'better-auth';
import { nextCookies } from 'better-auth/next-js';
import { Pool } from 'pg';

const databaseUrl = process.env.DATABASE_URL;
const authSecret = process.env.BETTER_AUTH_SECRET;
const authBaseUrl = process.env.BETTER_AUTH_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required for Better Auth.');
}
if (!authSecret) {
  throw new Error('BETTER_AUTH_SECRET is required for Better Auth.');
}
if (!authBaseUrl) {
  throw new Error('BETTER_AUTH_URL is required for Better Auth.');
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

export const auth = betterAuth({
  secret: authSecret,
  baseURL: authBaseUrl,
  database: pool,
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
  user: {
    additionalFields: {
      username: {
        type: 'string',
        required: true,
        unique: true,
      },
      phone: {
        type: 'string',
        required: true,
      },
      role: {
        type: 'string',
        required: true,
        defaultValue: 'citizen',
      },
    },
  },
  plugins: [nextCookies()],
});

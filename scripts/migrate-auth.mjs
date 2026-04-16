import { betterAuth } from 'better-auth';
import { getMigrations } from 'better-auth/db/migration';
import { Pool } from 'pg';

const databaseUrl = process.env.DATABASE_URL;
const authSecret = process.env.BETTER_AUTH_SECRET;
const authBaseUrl = process.env.BETTER_AUTH_URL;

if (!databaseUrl || !authSecret || !authBaseUrl) {
  throw new Error('DATABASE_URL, BETTER_AUTH_SECRET, and BETTER_AUTH_URL are required.');
}

const pool = new Pool({ connectionString: databaseUrl });

const auth = betterAuth({
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
});

const { runMigrations, toBeCreated, toBeAdded } = await getMigrations(auth.options);

if (toBeCreated.length === 0 && toBeAdded.length === 0) {
  console.log('Better Auth schema is already up to date.');
} else {
  console.log(`Applying Better Auth migrations (${toBeCreated.length} tables, ${toBeAdded.length} table updates)...`);
  await runMigrations();
  console.log('Better Auth migrations completed successfully.');
}

await pool.end();

import pg from 'pg';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required.');
}

const pool = new pg.Pool({ connectionString: databaseUrl });

const CREATE_TABLE = `
CREATE TABLE IF NOT EXISTS complaints (
  id              SERIAL PRIMARY KEY,
  complaint_id    TEXT UNIQUE NOT NULL,
  title           TEXT NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  category        TEXT NOT NULL DEFAULT 'General',
  image           TEXT NOT NULL DEFAULT '',
  lat             DOUBLE PRECISION NOT NULL DEFAULT 0,
  lng             DOUBLE PRECISION NOT NULL DEFAULT 0,
  location_label  TEXT NOT NULL DEFAULT '',
  upvotes         INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'CRITICAL',
  progress_stage  INTEGER NOT NULL DEFAULT 0,
  routed_to       TEXT NOT NULL DEFAULT 'BBMP',
  reporter_id     TEXT NOT NULL DEFAULT '',
  created_at      TEXT NOT NULL DEFAULT '',
  hash            TEXT,
  tx_hash         TEXT,
  inserted_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

try {
  await pool.query(CREATE_TABLE);
  console.log('✅ complaints table created (or already exists).');
} catch (error) {
  console.error('❌ Failed to create complaints table:', error);
  process.exit(1);
}

await pool.end();

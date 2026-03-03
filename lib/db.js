const { neon } = require('@neondatabase/serverless');
const crypto = require('crypto');

let sql;
let initialized = false;

function getDb() {
  if (!sql) {
    sql = neon(process.env.DATABASE_URL);
  }
  return sql;
}

function sha256(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

async function initDb() {
  if (initialized) return;
  const sql = getDb();

  // Create tables
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT DEFAULT '',
      role TEXT NOT NULL DEFAULT 'client',
      workspace_id TEXT DEFAULT '',
      avatar_url TEXT DEFAULT '',
      created_at DOUBLE PRECISION
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at DOUBLE PRECISION
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      website TEXT DEFAULT '',
      created_at TEXT DEFAULT '',
      status TEXT DEFAULT 'active',
      type TEXT DEFAULT 'client',
      intake_count INTEGER DEFAULT 0,
      runs_count INTEGER DEFAULT 0,
      client_email TEXT DEFAULT '',
      is_client INTEGER DEFAULT 1,
      notes TEXT DEFAULT ''
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS intake_data (
      workspace_id TEXT PRIMARY KEY,
      data TEXT NOT NULL DEFAULT '{}',
      updated_at DOUBLE PRECISION
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS strategy_data (
      workspace_id TEXT PRIMARY KEY,
      data TEXT NOT NULL DEFAULT '{}',
      updated_at DOUBLE PRECISION
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT ''
    )
  `;

  // Seed default admins (new emails)
  const now = Date.now() / 1000;
  const pwd = 'ridge2026';
  const h = sha256(pwd);

  const admins = [
    { email: 'owen@joinridge.co', name: 'Owen' },
    { email: 'jack@joinridge.co', name: 'Jack' },
    { email: 'owen@ridgeinternal.com', name: 'Owen' },
    { email: 'jack@ridgeinternal.com', name: 'Jack' },
  ];

  for (const admin of admins) {
    const id = `usr_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
    await sql`
      INSERT INTO users (id, email, password_hash, name, role, workspace_id, created_at)
      VALUES (${id}, ${admin.email}, ${h}, ${admin.name}, 'ridge_admin', '', ${now})
      ON CONFLICT (email) DO NOTHING
    `;
  }

  initialized = true;
}

module.exports = { getDb, initDb };

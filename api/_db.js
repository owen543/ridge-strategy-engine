import { sql } from '@vercel/postgres';
import crypto from 'crypto';

export { sql };

export async function initDb() {
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT DEFAULT '',
      role TEXT NOT NULL DEFAULT 'client',
      workspace_id TEXT DEFAULT '',
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
  await sql`
    CREATE TABLE IF NOT EXISTS intelligence_data (
      workspace_id TEXT PRIMARY KEY,
      signals TEXT NOT NULL DEFAULT '[]',
      dismissed TEXT NOT NULL DEFAULT '[]',
      drafts TEXT NOT NULL DEFAULT '{}',
      last_scan_at DOUBLE PRECISION DEFAULT 0,
      scan_count INTEGER DEFAULT 0,
      updated_at DOUBLE PRECISION
    )
  `;
}

export function sha256(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

export function uuid() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}

export function handleCors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return true;
  }
  return false;
}

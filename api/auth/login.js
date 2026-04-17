import { getDb, initDb, sha256, handleCors } from '../_db.js';
import crypto from 'crypto';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });

  try {
    await initDb();
    const sql = getDb();
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const e = email.trim().toLowerCase();
    const h = sha256(password);
    const rows = await sql`SELECT * FROM users WHERE email=${e} AND password_hash=${h}`;
    if (rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });

    const user = { ...rows[0] };
    const token = crypto.randomUUID().replace(/-/g, '');
    await sql`INSERT INTO sessions (token, user_id, created_at) VALUES (${token}, ${user.id}, ${Date.now() / 1000})`;
    delete user.password_hash;
    return res.json({ user, token });
  } catch (e) {
    console.error('Login error:', e);
    return res.status(500).json({ error: 'Server error' });
  }
}

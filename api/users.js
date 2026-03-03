const { getDb, initDb } = require('../lib/db');
const crypto = require('crypto');

function sha256(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

module.exports = async function handler(req, res) {
  await initDb();
  const sql = getDb();

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET /api/users — list all users
  if (req.method === 'GET') {
    const rows = await sql`
      SELECT id, email, name, role, workspace_id, created_at
      FROM users
      ORDER BY created_at DESC
    `;
    return res.status(200).json(rows);
  }

  // POST /api/users — create user
  if (req.method === 'POST') {
    const { email, password, name = '', role = 'client', workspace_id = '' } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const existing = await sql`SELECT id FROM users WHERE email = ${normalizedEmail}`;
    if (existing.length > 0) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    const uid = `usr_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const h = sha256(password);
    const now = Date.now() / 1000;

    await sql`
      INSERT INTO users (id, email, password_hash, name, role, workspace_id, created_at)
      VALUES (${uid}, ${normalizedEmail}, ${h}, ${name}, ${role}, ${workspace_id}, ${now})
    `;

    return res.status(201).json({ id: uid, email: normalizedEmail, name, role, workspace_id });
  }

  // DELETE /api/users?id=xxx — delete user
  if (req.method === 'DELETE') {
    const uid = req.query.id;
    if (uid) {
      await sql`DELETE FROM sessions WHERE user_id = ${uid}`;
      await sql`DELETE FROM users WHERE id = ${uid}`;
    }
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};

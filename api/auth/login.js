const { getDb, initDb } = require('../../lib/db');
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

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const h = sha256(password);

  const rows = await sql`
    SELECT * FROM users WHERE email = ${normalizedEmail} AND password_hash = ${h}
  `;

  if (rows.length === 0) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const user = rows[0];
  const token = crypto.randomUUID().replace(/-/g, '');
  const now = Date.now() / 1000;

  await sql`
    INSERT INTO sessions (token, user_id, created_at)
    VALUES (${token}, ${user.id}, ${now})
  `;

  const { password_hash, ...safeUser } = user;
  return res.status(200).json({ user: safeUser, token });
};

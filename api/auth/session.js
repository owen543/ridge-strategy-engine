const { getDb, initDb } = require('../../lib/db');

module.exports = async function handler(req, res) {
  await initDb();
  const sql = getDb();

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = req.query.token;

  if (!token) {
    return res.status(200).json({ user: null });
  }

  const rows = await sql`
    SELECT u.*
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.token = ${token}
  `;

  if (rows.length === 0) {
    return res.status(200).json({ user: null });
  }

  const user = rows[0];
  const { password_hash, ...safeUser } = user;
  return res.status(200).json({ user: safeUser });
};

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

  const { id: uid, password: new_password } = req.body || {};

  if (uid && new_password) {
    const h = sha256(new_password);
    await sql`UPDATE users SET password_hash = ${h} WHERE id = ${uid}`;
  }

  return res.status(200).json({ ok: true });
};

const { getDb, initDb } = require('../lib/db');

module.exports = async function handler(req, res) {
  await initDb();
  const sql = getDb();

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET /api/settings — get all settings or a single key
  if (req.method === 'GET') {
    const key = req.query.key || '';

    if (key) {
      const rows = await sql`SELECT value FROM settings WHERE key = ${key}`;
      return res.status(200).json({ value: rows.length > 0 ? rows[0].value : '' });
    }

    const rows = await sql`SELECT * FROM settings`;
    const result = {};
    for (const row of rows) {
      result[row.key] = row.value;
    }
    return res.status(200).json(result);
  }

  // POST /api/settings — set a key-value pair
  if (req.method === 'POST') {
    const body = req.body || {};
    const key = body.key || '';
    const value = body.value || '';

    if (key) {
      await sql`
        INSERT INTO settings (key, value)
        VALUES (${key}, ${value})
        ON CONFLICT (key)
        DO UPDATE SET value = EXCLUDED.value
      `;
    }

    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};

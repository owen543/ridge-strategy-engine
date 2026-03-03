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

  // GET /api/intake?workspace_id=xxx
  if (req.method === 'GET') {
    const wid = req.query.workspace_id || '';
    const rows = await sql`SELECT data FROM intake_data WHERE workspace_id = ${wid}`;
    if (rows.length > 0) {
      return res.status(200).json(JSON.parse(rows[0].data));
    }
    return res.status(200).json({});
  }

  // POST /api/intake — save intake data
  if (req.method === 'POST') {
    const body = req.body || {};
    const wid = body.workspace_id || '';
    const data = body.data || {};

    if (!wid) {
      return res.status(400).json({ error: 'Missing workspace_id' });
    }

    const now = Date.now() / 1000;
    const dataStr = JSON.stringify(data);

    await sql`
      INSERT INTO intake_data (workspace_id, data, updated_at)
      VALUES (${wid}, ${dataStr}, ${now})
      ON CONFLICT (workspace_id)
      DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at
    `;

    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};

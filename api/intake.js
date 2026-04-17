import { getDb, initDb, handleCors } from './_db.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  await initDb();
  const sql = getDb();

  try {
    if (req.method === 'GET') {
      const wid = req.query.workspace_id;
      const rows = await sql`SELECT data FROM intake_data WHERE workspace_id=${wid}`;
      if (rows.length > 0) return res.json(JSON.parse(rows[0].data));
      return res.json({});
    }

    if (req.method === 'POST') {
      const { workspace_id, data } = req.body || {};
      if (!workspace_id) return res.status(400).json({ error: 'Missing workspace_id' });
      const dataStr = JSON.stringify(data || {});
      const now = Date.now() / 1000;
      await sql`INSERT INTO intake_data (workspace_id, data, updated_at) VALUES (${workspace_id}, ${dataStr}, ${now}) ON CONFLICT(workspace_id) DO UPDATE SET data=EXCLUDED.data, updated_at=EXCLUDED.updated_at`;
      return res.json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('Intake error:', e);
    return res.status(500).json({ error: 'Server error' });
  }
}

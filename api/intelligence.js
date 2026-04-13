import { getDb, initDb, handleCors } from './_db.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  const sql = getDb();
  await initDb();

  try {
    if (req.method === 'GET') {
      const wid = req.query.workspace_id;
      const rows = await sql`SELECT * FROM intelligence_data WHERE workspace_id=${wid}`;
      if (rows.length > 0) {
        const r = rows[0];
        return res.json({
          signals: JSON.parse(r.signals),
          dismissed: JSON.parse(r.dismissed),
          drafts: JSON.parse(r.drafts),
          last_scan_at: r.last_scan_at,
          scan_count: r.scan_count,
        });
      }
      return res.json({ signals: [], dismissed: [], drafts: {}, last_scan_at: 0, scan_count: 0 });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const wid = body.workspace_id;
      if (!wid) return res.status(400).json({ error: 'Missing workspace_id' });
      const signals = JSON.stringify(body.signals || []);
      const dismissed = JSON.stringify(body.dismissed || []);
      const drafts = JSON.stringify(body.drafts || {});
      const lastScan = body.last_scan_at || Date.now() / 1000;
      const scanCount = body.scan_count || 0;
      const now = Date.now() / 1000;
      await sql`INSERT INTO intelligence_data (workspace_id, signals, dismissed, drafts, last_scan_at, scan_count, updated_at) VALUES (${wid}, ${signals}, ${dismissed}, ${drafts}, ${lastScan}, ${scanCount}, ${now}) ON CONFLICT(workspace_id) DO UPDATE SET signals=EXCLUDED.signals, dismissed=EXCLUDED.dismissed, drafts=EXCLUDED.drafts, last_scan_at=EXCLUDED.last_scan_at, scan_count=EXCLUDED.scan_count, updated_at=EXCLUDED.updated_at`;
      return res.json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('Intelligence error:', e);
    return res.status(500).json({ error: 'Server error' });
  }
}

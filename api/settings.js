import { query, initDb, handleCors } from './_db.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  await initDb();

  try {
    if (req.method === 'GET') {
      const key = req.query.key;
      if (key) {
        const keyRows = await query('SELECT value FROM settings WHERE key=$1', [key]);
        return res.json({ value: keyRows.length > 0 ? keyRows[0].value : '' });
      }
      const rows = await query('SELECT * FROM settings');
      const obj = {};
      for (const r of rows) obj[r.key] = r.value;
      return res.json(obj);
    }

    if (req.method === 'POST') {
      const { key, value } = req.body || {};
      if (key) {
        await query('INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value', [key, value || '']);
      }
      return res.json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('Settings error:', e);
    return res.status(500).json({ error: 'Server error' });
  }
}

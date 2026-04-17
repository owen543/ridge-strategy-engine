import { getDb, handleCors } from '../_db.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });

  try {
    const sql = getDb();
    const { token } = req.body || {};
    if (token) {
      await sql`DELETE FROM sessions WHERE token=${token}`;
    }
    return res.json({ ok: true });
  } catch (e) {
    console.error('Logout error:', e);
    return res.status(500).json({ error: 'Server error' });
  }
}

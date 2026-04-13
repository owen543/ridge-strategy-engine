import { getDb, initDb, handleCors } from '../_db.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET required' });

  try {
    const sql = getDb();
    await initDb();
    const token = req.query.token;
    if (!token) return res.json({ user: null });

    const rows = await sql`SELECT u.id, u.email, u.name, u.role, u.workspace_id, u.created_at FROM sessions s JOIN users u ON s.user_id=u.id WHERE s.token=${token}`;
    if (rows.length === 0) return res.json({ user: null });
    return res.json({ user: rows[0] });
  } catch (e) {
    console.error('Session error:', e);
    return res.status(500).json({ error: 'Server error' });
  }
}

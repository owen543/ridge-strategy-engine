import { query, handleCors } from '../_db.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });

  try {
    const { token } = req.body || {};
    if (token) {
      await query('DELETE FROM sessions WHERE token=$1', [token]);
    }
    return res.json({ ok: true });
  } catch (e) {
    console.error('Logout error:', e);
    return res.status(500).json({ error: 'Server error' });
  }
}

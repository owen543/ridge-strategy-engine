import { query, sha256, handleCors } from '../_db.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });

  try {
    const { id, password } = req.body || {};
    if (id && password) {
      const h = sha256(password);
      await query('UPDATE users SET password_hash=$1 WHERE id=$2', [h, id]);
    }
    return res.json({ ok: true });
  } catch (e) {
    console.error('Password error:', e);
    return res.status(500).json({ error: 'Server error' });
  }
}

import { getDb, initDb, sha256, uuid, handleCors } from './_db.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  const sql = getDb();
  await initDb();

  try {
    if (req.method === 'GET') {
      const rows = await sql`SELECT id, email, name, role, workspace_id, created_at FROM users ORDER BY created_at DESC`;
      return res.json(rows);
    }

    if (req.method === 'POST') {
      const { email, password, name, role, workspace_id } = req.body || {};
      if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
      const e = email.trim().toLowerCase();
      const existing = await sql`SELECT id FROM users WHERE email=${e}`;
      if (existing.length > 0) return res.status(400).json({ error: 'Email already exists' });
      const uid = `usr_${uuid()}`;
      const h = sha256(password);
      await sql`INSERT INTO users (id, email, password_hash, name, role, workspace_id, created_at) VALUES (${uid}, ${e}, ${h}, ${name || ''}, ${role || 'client'}, ${workspace_id || ''}, ${Date.now() / 1000})`;
      return res.status(201).json({ id: uid, email: e, name: name || '', role: role || 'client', workspace_id: workspace_id || '' });
    }

    if (req.method === 'DELETE') {
      const uid = req.query.id;
      if (uid) {
        await sql`DELETE FROM sessions WHERE user_id=${uid}`;
        await sql`DELETE FROM users WHERE id=${uid}`;
      }
      return res.json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('Users error:', e);
    return res.status(500).json({ error: 'Server error' });
  }
}

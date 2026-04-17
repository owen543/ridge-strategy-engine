import { query, initDb, sha256, uuid, handleCors } from './_db.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });

  try {
    await initDb();

    const now = Date.now() / 1000;
    const admins = [
      { email: 'jack@ridgeinternal.com', password: 'ridge2026', name: 'Jack' },
      { email: 'owen@ridgeinternal.com', password: 'ridge2026', name: 'Owen' },
    ];

    for (const admin of admins) {
      const existing = await query('SELECT id FROM users WHERE email=$1', [admin.email]);
      if (existing.length === 0) {
        const uid = `usr_${uuid()}`;
        const h = sha256(admin.password);
        await query('INSERT INTO users (id, email, password_hash, name, role, workspace_id, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)', [uid, admin.email, h, admin.name, 'ridge_admin', '', now]);
      }
    }

    await query("INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO NOTHING", ['theme', 'dark']);

    return res.json({ ok: true, message: 'Database seeded with admin accounts' });
  } catch (e) {
    console.error('Seed error:', e);
    return res.status(500).json({ error: e.message });
  }
}

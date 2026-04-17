import { sql, initDb, sha256, uuid, handleCors } from './_db.js';

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
      const { rows: existing } = await sql`SELECT id FROM users WHERE email=${admin.email}`;
      if (existing.length === 0) {
        const uid = `usr_${uuid()}`;
        const h = sha256(admin.password);
        await sql`INSERT INTO users (id, email, password_hash, name, role, workspace_id, created_at) VALUES (${uid}, ${admin.email}, ${h}, ${admin.name}, 'ridge_admin', '', ${now})`;
      }
    }

    await sql`INSERT INTO settings (key, value) VALUES ('theme', 'dark') ON CONFLICT(key) DO NOTHING`;

    return res.json({ ok: true, message: 'Database seeded with admin accounts' });
  } catch (e) {
    console.error('Seed error:', e);
    return res.status(500).json({ error: e.message });
  }
}

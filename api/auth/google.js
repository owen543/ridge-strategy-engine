import { getDb, initDb, uuid, handleCors } from '../_db.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });

  try {
    const sql = getDb();
    await initDb();
    const { credential } = req.body || {};
    if (!credential) return res.status(400).json({ error: 'Missing Google credential' });

    const parts = credential.split('.');
    if (parts.length !== 3) return res.status(400).json({ error: 'Invalid token format' });

    // Decode JWT payload
    let payloadB64 = parts[1];
    const padding = 4 - (payloadB64.length % 4);
    if (padding !== 4) payloadB64 += '='.repeat(padding);
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());

    const gEmail = (payload.email || '').trim().toLowerCase();
    const gName = payload.name || '';
    if (!gEmail) return res.status(400).json({ error: 'No email in Google token' });

    // Check existing user
    const existing = await sql`SELECT * FROM users WHERE email=${gEmail}`;
    let user;
    if (existing.length > 0) {
      user = { ...existing[0] };
    } else {
      const uid = `usr_${uuid()}`;
      const placeholderHash = require('crypto').createHash('sha256').update(require('crypto').randomUUID()).digest('hex');
      await sql`INSERT INTO users (id, email, password_hash, name, role, workspace_id, created_at) VALUES (${uid}, ${gEmail}, ${placeholderHash}, ${gName}, 'client', '', ${Date.now() / 1000})`;
      user = { id: uid, email: gEmail, name: gName, role: 'client', workspace_id: '', created_at: Date.now() / 1000 };
    }

    const token = require('crypto').randomUUID().replace(/-/g, '');
    await sql`INSERT INTO sessions (token, user_id, created_at) VALUES (${token}, ${user.id}, ${Date.now() / 1000})`;
    delete user.password_hash;
    return res.json({ user, token });
  } catch (e) {
    console.error('Google auth error:', e);
    return res.status(400).json({ error: `Google auth failed: ${e.message}` });
  }
}

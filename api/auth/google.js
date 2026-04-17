import { query, initDb, uuid, handleCors } from '../_db.js';
import crypto from 'crypto';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });

  try {
    await initDb();
    const { credential } = req.body || {};
    if (!credential) return res.status(400).json({ error: 'Missing Google credential' });

    const parts = credential.split('.');
    if (parts.length !== 3) return res.status(400).json({ error: 'Invalid token format' });

    let payloadB64 = parts[1];
    const padding = 4 - (payloadB64.length % 4);
    if (padding !== 4) payloadB64 += '='.repeat(padding);
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());

    const gEmail = (payload.email || '').trim().toLowerCase();
    const gName = payload.name || '';
    if (!gEmail) return res.status(400).json({ error: 'No email in Google token' });

    const existing = await query('SELECT * FROM users WHERE email=$1', [gEmail]);
    let user;
    if (existing.length > 0) {
      user = { ...existing[0] };
    } else {
      const uid = `usr_${uuid()}`;
      const placeholderHash = crypto.createHash('sha256').update(crypto.randomUUID()).digest('hex');
      await query('INSERT INTO users (id, email, password_hash, name, role, workspace_id, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)', [uid, gEmail, placeholderHash, gName, 'client', '', Date.now() / 1000]);
      user = { id: uid, email: gEmail, name: gName, role: 'client', workspace_id: '', created_at: Date.now() / 1000 };
    }

    const token = crypto.randomUUID().replace(/-/g, '');
    await query('INSERT INTO sessions (token, user_id, created_at) VALUES ($1, $2, $3)', [token, user.id, Date.now() / 1000]);
    delete user.password_hash;
    return res.json({ user, token });
  } catch (e) {
    console.error('Google auth error:', e);
    return res.status(400).json({ error: `Google auth failed: ${e.message}` });
  }
}

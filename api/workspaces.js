import { query, initDb, uuid, handleCors } from './_db.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  await initDb();

  try {
    if (req.method === 'GET') {
      const rows = await query('SELECT * FROM workspaces ORDER BY created_at DESC');
      return res.json(rows);
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const wid = `ws_${uuid()}`;
      await query('INSERT INTO workspaces (id, name, website, created_at, status, type, intake_count, runs_count, client_email, is_client, notes) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)', [wid, body.name || '', body.website || '', body.createdAt || '', body.status || 'active', body.type || 'client', 0, 0, body.clientEmail || '', body.isClient !== false ? 1 : 0, body.notes || '']);
      return res.status(201).json({ id: wid });
    }

    if (req.method === 'PUT') {
      const body = req.body || {};
      const wid = body.id;
      if (!wid) return res.status(400).json({ error: 'Missing workspace id' });
      if ('name' in body) await query('UPDATE workspaces SET name=$1 WHERE id=$2', [body.name, wid]);
      if ('website' in body) await query('UPDATE workspaces SET website=$1 WHERE id=$2', [body.website, wid]);
      if ('status' in body) await query('UPDATE workspaces SET status=$1 WHERE id=$2', [body.status, wid]);
      if ('type' in body) await query('UPDATE workspaces SET type=$1 WHERE id=$2', [body.type, wid]);
      if ('intake_count' in body) await query('UPDATE workspaces SET intake_count=$1 WHERE id=$2', [body.intake_count, wid]);
      if ('runs_count' in body) await query('UPDATE workspaces SET runs_count=$1 WHERE id=$2', [body.runs_count, wid]);
      if ('client_email' in body) await query('UPDATE workspaces SET client_email=$1 WHERE id=$2', [body.client_email, wid]);
      if ('notes' in body) await query('UPDATE workspaces SET notes=$1 WHERE id=$2', [body.notes, wid]);
      return res.json({ ok: true });
    }

    if (req.method === 'DELETE') {
      const wid = req.query.id;
      if (wid) {
        await query('DELETE FROM intake_data WHERE workspace_id=$1', [wid]);
        await query('DELETE FROM strategy_data WHERE workspace_id=$1', [wid]);
        await query('DELETE FROM intelligence_data WHERE workspace_id=$1', [wid]);
        await query('DELETE FROM workspaces WHERE id=$1', [wid]);
      }
      return res.json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('Workspaces error:', e);
    return res.status(500).json({ error: 'Server error' });
  }
}

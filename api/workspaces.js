import { sql, initDb, uuid, handleCors } from './_db.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  await initDb();

  try {
    if (req.method === 'GET') {
      const { rows } = await sql`SELECT * FROM workspaces ORDER BY created_at DESC`;
      return res.json(rows);
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const wid = `ws_${uuid()}`;
      await sql`INSERT INTO workspaces (id, name, website, created_at, status, type, intake_count, runs_count, client_email, is_client, notes) VALUES (${wid}, ${body.name || ''}, ${body.website || ''}, ${body.createdAt || ''}, ${body.status || 'active'}, ${body.type || 'client'}, 0, 0, ${body.clientEmail || ''}, ${body.isClient !== false ? 1 : 0}, ${body.notes || ''})`;
      return res.status(201).json({ id: wid });
    }

    if (req.method === 'PUT') {
      const body = req.body || {};
      const wid = body.id;
      if (!wid) return res.status(400).json({ error: 'Missing workspace id' });
      if ('name' in body) await sql`UPDATE workspaces SET name=${body.name} WHERE id=${wid}`;
      if ('website' in body) await sql`UPDATE workspaces SET website=${body.website} WHERE id=${wid}`;
      if ('status' in body) await sql`UPDATE workspaces SET status=${body.status} WHERE id=${wid}`;
      if ('type' in body) await sql`UPDATE workspaces SET type=${body.type} WHERE id=${wid}`;
      if ('intake_count' in body) await sql`UPDATE workspaces SET intake_count=${body.intake_count} WHERE id=${wid}`;
      if ('runs_count' in body) await sql`UPDATE workspaces SET runs_count=${body.runs_count} WHERE id=${wid}`;
      if ('client_email' in body) await sql`UPDATE workspaces SET client_email=${body.client_email} WHERE id=${wid}`;
      if ('notes' in body) await sql`UPDATE workspaces SET notes=${body.notes} WHERE id=${wid}`;
      return res.json({ ok: true });
    }

    if (req.method === 'DELETE') {
      const wid = req.query.id;
      if (wid) {
        await sql`DELETE FROM intake_data WHERE workspace_id=${wid}`;
        await sql`DELETE FROM strategy_data WHERE workspace_id=${wid}`;
        await sql`DELETE FROM intelligence_data WHERE workspace_id=${wid}`;
        await sql`DELETE FROM workspaces WHERE id=${wid}`;
      }
      return res.json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('Workspaces error:', e);
    return res.status(500).json({ error: 'Server error' });
  }
}

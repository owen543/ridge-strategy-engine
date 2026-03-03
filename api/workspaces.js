const { getDb, initDb } = require('../lib/db');
const crypto = require('crypto');

module.exports = async function handler(req, res) {
  await initDb();
  const sql = getDb();

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET /api/workspaces — list all workspaces
  if (req.method === 'GET') {
    const rows = await sql`SELECT * FROM workspaces ORDER BY created_at DESC`;
    return res.status(200).json(rows);
  }

  // POST /api/workspaces — create workspace
  if (req.method === 'POST') {
    const body = req.body || {};
    const wid = `ws_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`;

    await sql`
      INSERT INTO workspaces (id, name, website, created_at, status, type, intake_count, runs_count, client_email, is_client, notes)
      VALUES (
        ${wid},
        ${body.name || ''},
        ${body.website || ''},
        ${body.createdAt || ''},
        ${body.status || 'active'},
        ${body.type || 'client'},
        ${0},
        ${0},
        ${body.clientEmail || ''},
        ${body.isClient === false ? 0 : 1},
        ${body.notes || ''}
      )
    `;

    return res.status(201).json({ id: wid });
  }

  // PUT /api/workspaces — update workspace
  if (req.method === 'PUT') {
    const body = req.body || {};
    const wid = body.id;

    if (!wid) {
      return res.status(400).json({ error: 'Missing workspace id' });
    }

    const allowed = ['name', 'website', 'status', 'type', 'intake_count', 'runs_count', 'client_email', 'notes'];
    const updates = {};
    for (const col of allowed) {
      if (col in body) {
        updates[col] = body[col];
      }
    }
    if ('is_client' in body) {
      updates['is_client'] = body.is_client ? 1 : 0;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(200).json({ ok: true });
    }

    const { name, website, status, type, intake_count, runs_count, client_email, notes, is_client } = updates;

    const current = await sql`SELECT * FROM workspaces WHERE id = ${wid}`;
    if (current.length === 0) {
      return res.status(404).json({ error: 'Workspace not found' });
    }
    const row = current[0];

    const newName = 'name' in updates ? updates.name : row.name;
    const newWebsite = 'website' in updates ? updates.website : row.website;
    const newStatus = 'status' in updates ? updates.status : row.status;
    const newType = 'type' in updates ? updates.type : row.type;
    const newIntakeCount = 'intake_count' in updates ? updates.intake_count : row.intake_count;
    const newRunsCount = 'runs_count' in updates ? updates.runs_count : row.runs_count;
    const newClientEmail = 'client_email' in updates ? updates.client_email : row.client_email;
    const newNotes = 'notes' in updates ? updates.notes : row.notes;
    const newIsClient = 'is_client' in updates ? updates.is_client : row.is_client;

    await sql`
      UPDATE workspaces SET
        name = ${newName},
        website = ${newWebsite},
        status = ${newStatus},
        type = ${newType},
        intake_count = ${newIntakeCount},
        runs_count = ${newRunsCount},
        client_email = ${newClientEmail},
        notes = ${newNotes},
        is_client = ${newIsClient}
      WHERE id = ${wid}
    `;

    return res.status(200).json({ ok: true });
  }

  // DELETE /api/workspaces?id=xxx — delete workspace and its data
  if (req.method === 'DELETE') {
    const wid = req.query.id;
    if (wid) {
      await sql`DELETE FROM intake_data WHERE workspace_id = ${wid}`;
      await sql`DELETE FROM strategy_data WHERE workspace_id = ${wid}`;
      await sql`DELETE FROM workspaces WHERE id = ${wid}`;
    }
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};

const { neon } = require('@neondatabase/serverless');
const crypto = require('crypto');

// ─── Rate Limiting (Upstash Redis or in-memory fallback) ─────────────────────
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.ridge_UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.ridge_UPSTASH_REDIS_REST_TOKEN;

// Rate limit config
const RL_MAX_ATTEMPTS = 10;       // attempts per window
const RL_WINDOW_SEC = 60;         // sliding window in seconds
const RL_BACKOFF_BASE = 60;       // initial backoff in seconds
const RL_BACKOFF_MAX = 3600;      // max backoff: 1 hour
const RL_ESCALATION_WINDOW = 86400; // 24h escalation tracking

// In-memory fallback when Redis is unavailable
const memoryRL = new Map(); // key -> { attempts: [], escalations: 0, blockedUntil: 0 }

async function upstashCmd(cmd, ...args) {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) return null;
  try {
    const r = await fetch(`${UPSTASH_URL}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([cmd, ...args]),
    });
    const d = await r.json();
    return d.result;
  } catch { return null; }
}

async function upstashPipeline(commands) {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) return null;
  try {
    const r = await fetch(`${UPSTASH_URL}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(commands),
    });
    const d = await r.json();
    return d;
  } catch { return null; }
}

function getRateLimitKey(ip, email) {
  const e = (email || '').trim().toLowerCase();
  return e ? `rl:${ip}:${e}` : `rl:${ip}:_`;
}

async function checkRateLimit(ip, email) {
  const key = getRateLimitKey(ip, email);
  const now = Date.now();
  const nowSec = now / 1000;

  // Try Redis first
  if (UPSTASH_URL && UPSTASH_TOKEN) {
    try {
      const windowKey = `rate:${key}`;
      const escKey = `esc:${key}`;
      const blockKey = `block:${key}`;

      // Check if currently blocked
      const blocked = await upstashCmd('GET', blockKey);
      if (blocked) {
        const blockedUntil = parseInt(blocked, 10);
        if (nowSec < blockedUntil) {
          const retryAfter = Math.ceil(blockedUntil - nowSec);
          return { allowed: false, retryAfter, remaining: 0 };
        }
      }

      // Sliding window: count attempts in last RL_WINDOW_SEC
      const cutoff = nowSec - RL_WINDOW_SEC;
      const pipeline = [
        ['ZREMRANGEBYSCORE', windowKey, '0', String(cutoff)],
        ['ZCARD', windowKey],
      ];
      const results = await upstashPipeline(pipeline);
      if (!results) throw new Error('Pipeline failed');
      const count = results[1]?.result || 0;

      if (count >= RL_MAX_ATTEMPTS) {
        // Get escalation count
        const escCount = parseInt(await upstashCmd('GET', escKey) || '0', 10);
        const backoff = Math.min(RL_BACKOFF_BASE * Math.pow(2, escCount), RL_BACKOFF_MAX);
        const blockedUntil = nowSec + backoff;

        // Set block and increment escalation
        await upstashPipeline([
          ['SET', blockKey, String(Math.floor(blockedUntil)), 'EX', String(backoff + 10)],
          ['INCR', escKey],
          ['EXPIRE', escKey, String(RL_ESCALATION_WINDOW)],
        ]);

        return { allowed: false, retryAfter: backoff, remaining: 0 };
      }

      return { allowed: true, remaining: RL_MAX_ATTEMPTS - count };
    } catch {
      // Redis error: fail open
      return { allowed: true, remaining: RL_MAX_ATTEMPTS };
    }
  }

  // In-memory fallback
  if (!memoryRL.has(key)) {
    memoryRL.set(key, { attempts: [], escalations: 0, blockedUntil: 0 });
  }
  const entry = memoryRL.get(key);

  // Check block
  if (entry.blockedUntil > now) {
    return { allowed: false, retryAfter: Math.ceil((entry.blockedUntil - now) / 1000), remaining: 0 };
  }

  // Clean old attempts
  const cutoff = now - (RL_WINDOW_SEC * 1000);
  entry.attempts = entry.attempts.filter(t => t > cutoff);

  if (entry.attempts.length >= RL_MAX_ATTEMPTS) {
    const backoff = Math.min(RL_BACKOFF_BASE * Math.pow(2, entry.escalations), RL_BACKOFF_MAX);
    entry.blockedUntil = now + (backoff * 1000);
    entry.escalations++;
    return { allowed: false, retryAfter: backoff, remaining: 0 };
  }

  return { allowed: true, remaining: RL_MAX_ATTEMPTS - entry.attempts.length };
}

async function recordAttempt(ip, email) {
  const key = getRateLimitKey(ip, email);
  const nowSec = Date.now() / 1000;

  if (UPSTASH_URL && UPSTASH_TOKEN) {
    try {
      const windowKey = `rate:${key}`;
      await upstashPipeline([
        ['ZADD', windowKey, String(nowSec), `${nowSec}:${Math.random().toString(36).slice(2, 8)}`],
        ['EXPIRE', windowKey, String(RL_WINDOW_SEC * 2)],
      ]);
    } catch { /* fail open */ }
    return;
  }

  // In-memory fallback
  if (!memoryRL.has(key)) {
    memoryRL.set(key, { attempts: [], escalations: 0, blockedUntil: 0 });
  }
  memoryRL.get(key).attempts.push(Date.now());
}

function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.headers['x-real-ip']
    || req.socket?.remoteAddress
    || '0.0.0.0';
}

// ─── Database ────────────────────────────────────────────────────────────────
function getDb() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING || process.env.ridge_DATABASE_URL || process.env.ridge_POSTGRES_URL || process.env.ridge_DATABASE_URL_UNPOOLED;
  if (!url) throw new Error('No DATABASE_URL env var found');
  return neon(url);
}

async function initDb() {
  const sql = getDb();
  await sql`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, name TEXT DEFAULT '', role TEXT NOT NULL DEFAULT 'client', workspace_id TEXT DEFAULT '', created_at DOUBLE PRECISION)`;
  await sql`CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at DOUBLE PRECISION)`;
  await sql`CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, name TEXT NOT NULL, website TEXT DEFAULT '', created_at TEXT DEFAULT '', status TEXT DEFAULT 'active', type TEXT DEFAULT 'client', intake_count INTEGER DEFAULT 0, runs_count INTEGER DEFAULT 0, client_email TEXT DEFAULT '', is_client INTEGER DEFAULT 1, notes TEXT DEFAULT '')`;
  await sql`CREATE TABLE IF NOT EXISTS intake_data (workspace_id TEXT PRIMARY KEY, data TEXT NOT NULL DEFAULT '{}', updated_at DOUBLE PRECISION)`;
  await sql`CREATE TABLE IF NOT EXISTS strategy_data (workspace_id TEXT PRIMARY KEY, data TEXT NOT NULL DEFAULT '{}', updated_at DOUBLE PRECISION)`;
  await sql`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT '')`;
  await sql`CREATE TABLE IF NOT EXISTS intelligence_data (workspace_id TEXT PRIMARY KEY, signals TEXT NOT NULL DEFAULT '[]', dismissed TEXT NOT NULL DEFAULT '[]', drafts TEXT NOT NULL DEFAULT '{}', last_scan_at DOUBLE PRECISION DEFAULT 0, scan_count INTEGER DEFAULT 0, updated_at DOUBLE PRECISION)`;
}

function sha256(str) { return crypto.createHash('sha256').update(str).digest('hex'); }
function uuid() { return crypto.randomUUID().replace(/-/g, '').slice(0, 12); }

// ─── CORS ────────────────────────────────────────────────────────────────────
function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
}

// ─── AI Helpers ──────────────────────────────────────────────────────────────
function findEnv(...names) { for (const n of names) { if (process.env[n]) return process.env[n]; } return null; }
const ANTHROPIC_KEY = findEnv('ANTHROPIC_API_KEY', 'ridge_ANTHROPIC_API_KEY', 'ANTHROPIC_KEY');
const _OK = Buffer.from('c2stcHJvai10VDY4N3RoM1RfcTZuSDVkYlZPRkhRN0diV1c3djNjWmh3NG85bzNQcFh1eFNycE5VMXUyVnczSkYtSFltdEt0LUNYTTZqdXdFT1QzQmxia0ZKR1hKb0N3QzgzVDhUbWlKSWdfWFdHM0RMbmJmQ0lrRW1iQnVBNjlLYlV3QjFKVF9KSEd5eG1tYmZzeFFWSzZiY1B3dXhQMlFNSUE=', 'base64').toString();
const OPENAI_KEY = findEnv('OPENAI_API_KEY', 'ridge_OPENAI_API_KEY', 'OPENAI_KEY') || _OK;

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
// ─── Model registry — latest 2026 frontier lineup ───────────────────────────
const CLAUDE_HAIKU   = 'claude-haiku-4-5';        // alias → claude-haiku-4-5-20251001 (fast, Vercel-Hobby-safe)
const CLAUDE_SONNET  = 'claude-sonnet-4-6';        // smarter, slower
const CLAUDE_OPUS    = 'claude-opus-4-7';          // top reasoning, 1M ctx (Apr 2026)
const GPT4O_MINI     = 'gpt-4o-mini';
const GPT4O          = 'gpt-4o';
const GPT_5_5        = 'gpt-5.5';                  // OpenAI frontier (Apr 2026)
const GPT_5_4        = 'gpt-5.4';

// Map friendly alias → real API id. Used by `callAI(..., pref)`.
const MODEL_ALIAS = {
  haiku:   { provider: 'anthropic', id: CLAUDE_HAIKU },
  sonnet:  { provider: 'anthropic', id: CLAUDE_SONNET },
  opus:    { provider: 'anthropic', id: CLAUDE_OPUS },
  'claude-haiku-4-5':  { provider: 'anthropic', id: CLAUDE_HAIKU },
  'claude-sonnet-4-6': { provider: 'anthropic', id: CLAUDE_SONNET },
  'claude-opus-4-7':   { provider: 'anthropic', id: CLAUDE_OPUS },
  'gpt-4o-mini':       { provider: 'openai', id: GPT4O_MINI },
  'gpt-4o':            { provider: 'openai', id: GPT4O },
  'gpt-5.4':           { provider: 'openai', id: GPT_5_4 },
  'gpt-5.5':           { provider: 'openai', id: GPT_5_5 },
  'gpt5':              { provider: 'openai', id: GPT_5_5 },
  'force_sonnet':      { provider: 'anthropic', id: CLAUDE_SONNET },
  'force_opus':        { provider: 'anthropic', id: CLAUDE_OPUS },
};
function resolveModel(pref) {
  if (!pref) return MODEL_ALIAS.haiku;
  const key = String(pref).toLowerCase().trim();
  return MODEL_ALIAS[key] || MODEL_ALIAS.haiku;
}

function stripMarkdownFences(text) {
  let t = text.trim();
  if (t.startsWith('```json')) t = t.slice(7);
  else if (t.startsWith('```')) t = t.slice(3);
  if (t.endsWith('```')) t = t.slice(0, -3);
  return t.trim();
}

async function callAnthropic(sys, usr, model = CLAUDE_SONNET, max = 5000, retries = 3) {
  // 3 retries with exponential backoff + jitter — handles 429 (rate limit) and 529 (overloaded)
  // when 6 chunks fire in parallel and exceed Anthropic per-account TPM/RPM.
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' }, body: JSON.stringify({ model, max_tokens: max, messages: [{ role: 'user', content: usr }], system: sys }) });
      const b = await r.json();
      const isRetryable = (r.status === 429 || r.status === 529 || r.status === 503 || r.status === 502);
      if (isRetryable && attempt < retries) {
        // exponential backoff: 2s, 5s, 10s + 0-2s jitter so parallel callers desync
        const base = [2000, 5000, 10000][attempt] || 10000;
        await sleep(base + Math.floor(Math.random() * 2000));
        continue;
      }
      if (!r.ok) return { ok: false, error: `Anthropic ${r.status}: ${JSON.stringify(b)}`, provider: 'anthropic' };
      const raw = (b.content || []).filter(x => x.type === 'text').map(x => x.text).join('');
      return { ok: true, text: stripMarkdownFences(raw), model, provider: 'anthropic', usage: b.usage || {} };
    } catch (e) { if (attempt < retries) { await sleep(3000 + Math.floor(Math.random() * 2000)); continue; } return { ok: false, error: e.message, provider: 'anthropic' }; }
  }
}

async function callOpenAI(sys, usr, model = GPT4O, max = 5000) {
  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_KEY}` }, body: JSON.stringify({ model, max_tokens: max, messages: [{ role: 'system', content: sys }, { role: 'user', content: usr }] }) });
    const b = await r.json();
    if (!r.ok) return { ok: false, error: `OpenAI ${r.status}: ${JSON.stringify(b)}`, provider: 'openai' };
    return { ok: true, text: b.choices[0].message.content, model, provider: 'openai', usage: b.usage || {} };
  } catch (e) { return { ok: false, error: e.message, provider: 'openai' }; }
}

async function callOpenAISearch(sys, usr, model = 'gpt-4o-search-preview', max = 5000) {
  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_KEY}` }, body: JSON.stringify({ model, max_tokens: max, web_search_options: { search_context_size: 'medium' }, messages: [{ role: 'system', content: sys }, { role: 'user', content: usr }] }) });
    const b = await r.json();
    if (!r.ok) return { ok: false, error: `OpenAI Search ${r.status}: ${JSON.stringify(b)}`, provider: 'openai_search' };
    return { ok: true, text: b.choices[0].message.content, model, provider: 'openai_search', usage: b.usage || {} };
  } catch (e) { return { ok: false, error: e.message, provider: 'openai_search' }; }
}

async function callAnthropicSearch(sys, usr, model = CLAUDE_HAIKU, max = 4000, retries = 1) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' }, body: JSON.stringify({ model, max_tokens: max, tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }], messages: [{ role: 'user', content: usr }], system: sys }) });
      const b = await r.json();
      if (r.status === 429 && attempt < retries) { await sleep(5000); continue; }
      if (!r.ok) return { ok: false, error: `Anthropic Search ${r.status}: ${JSON.stringify(b)}`, provider: 'anthropic_search' };
      return { ok: true, text: stripMarkdownFences((b.content || []).filter(x => x.type === 'text').map(x => x.text).join('')), model, provider: 'anthropic_search', usage: b.usage || {} };
    } catch (e) { if (attempt < retries) { await sleep(3000); continue; } return { ok: false, error: e.message, provider: 'anthropic_search' }; }
  }
}

async function callAI(sys, usr, pref = 'haiku', max = 5000, search = false) {
  // Resolve user-supplied alias to {provider, id}.
  // Vercel Hobby plan = 10s function timeout, so default to Haiku for safety.
  const sel = resolveModel(pref);

  if (search) {
    // Web-search path — always use Haiku for low latency; OpenAI search as fallback.
    const r = await callAnthropicSearch(sys, usr, CLAUDE_HAIKU, max);
    if (r.ok) return r;
    if (OPENAI_KEY) { const r2 = await callOpenAISearch(sys, usr, undefined, max); if (r2.ok) return r2; }
    return callAnthropic(sys, usr, CLAUDE_HAIKU, max);
  }

  // Helper: only fallback to OpenAI if it has real quota (not the depleted shared key).
  // The depleted key returns insufficient_quota immediately, so cross-provider fallback is
  // worthless and just produces misleading error messages. Detect via env var presence.
  const hasRealOpenAI = !!findEnv('OPENAI_API_KEY', 'ridge_OPENAI_API_KEY', 'OPENAI_KEY');

  // Primary call
  if (sel.provider === 'openai') {
    const r = await callOpenAI(sys, usr, sel.id, max);
    if (r.ok) return r;
    // Fallback to Anthropic Haiku if OpenAI fails — Anthropic key is reliable
    if (ANTHROPIC_KEY) return callAnthropic(sys, usr, CLAUDE_HAIKU, max);
    return r;
  } else {
    const r = await callAnthropic(sys, usr, sel.id, max);
    if (r.ok) return r;
    // Only fallback to OpenAI if the user actually has an OpenAI key configured —
    // the hardcoded shared key is depleted and would just return insufficient_quota.
    if (hasRealOpenAI) return callOpenAI(sys, usr, GPT4O_MINI, max);
    return r;
  }
}

// ─── Route Handlers ──────────────────────────────────────────────────────────

async function handleAuthLogin(req, res) {
  await initDb();
  const sql = getDb();
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const e = email.trim().toLowerCase();
  const ip = getClientIP(req);

  // Rate limit check
  const rl = await checkRateLimit(ip, e);
  if (!rl.allowed) {
    res.setHeader('Retry-After', String(rl.retryAfter));
    return res.status(429).json({
      error: `Too many login attempts. Try again in ${formatRetryTime(rl.retryAfter)}.`,
      retryAfter: rl.retryAfter,
    });
  }

  const h = sha256(password);
  const rows = await sql`SELECT * FROM users WHERE email=${e} AND password_hash=${h}`;
  if (rows.length === 0) {
    // Record failed attempt
    await recordAttempt(ip, e);
    const remaining = rl.remaining - 1;
    const msg = remaining <= 3 && remaining > 0
      ? `Invalid credentials. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining before lockout.`
      : 'Invalid credentials';
    return res.status(401).json({ error: msg, remaining });
  }

  const user = { ...rows[0] };
  const token = crypto.randomUUID().replace(/-/g, '');
  await sql`INSERT INTO sessions (token, user_id, created_at) VALUES (${token}, ${user.id}, ${Date.now() / 1000})`;
  delete user.password_hash;
  return res.json({ user, token });
}

function formatRetryTime(seconds) {
  if (seconds < 60) return `${seconds} second${seconds === 1 ? '' : 's'}`;
  if (seconds < 3600) { const m = Math.ceil(seconds / 60); return `${m} minute${m === 1 ? '' : 's'}`; }
  const h = Math.ceil(seconds / 3600); return `${h} hour${h === 1 ? '' : 's'}`;
}

async function handleRateLimitCheck(req, res) {
  const { email } = req.body || {};
  const ip = getClientIP(req);
  const rl = await checkRateLimit(ip, email);
  if (!rl.allowed) {
    res.setHeader('Retry-After', String(rl.retryAfter));
    return res.status(429).json({
      error: `Too many attempts. Try again in ${formatRetryTime(rl.retryAfter)}.`,
      retryAfter: rl.retryAfter,
      remaining: 0,
    });
  }
  return res.json({ allowed: true, remaining: rl.remaining });
}

async function handleRateLimitRecordFailure(req, res) {
  const { email } = req.body || {};
  const ip = getClientIP(req);
  await recordAttempt(ip, email);
  const rl = await checkRateLimit(ip, email);
  return res.json({ remaining: rl.remaining });
}

const SESSION_MAX_AGE_SEC = 30 * 24 * 60 * 60; // 30 days

async function handleAuthSession(req, res) {
  await initDb();
  const sql = getDb();
  const token = req.query.token;
  if (!token) return res.json({ user: null });
  const rows = await sql`SELECT s.created_at as session_created, u.id, u.email, u.name, u.role, u.workspace_id, u.created_at FROM sessions s JOIN users u ON s.user_id=u.id WHERE s.token=${token}`;
  if (rows.length === 0) return res.json({ user: null });
  // Check session expiry
  const sessionAge = (Date.now() / 1000) - (rows[0].session_created || 0);
  if (sessionAge > SESSION_MAX_AGE_SEC) {
    await sql`DELETE FROM sessions WHERE token=${token}`;
    return res.json({ user: null, expired: true });
  }
  // Touch: extend session by updating created_at (sliding window)
  await sql`UPDATE sessions SET created_at=${Date.now() / 1000} WHERE token=${token}`;
  const { session_created, ...user } = rows[0];
  return res.json({ user });
}

async function handleAuthLogout(req, res) {
  const sql = getDb();
  const { token } = req.body || {};
  if (token) await sql`DELETE FROM sessions WHERE token=${token}`;
  return res.json({ ok: true });
}

async function handleAuthGoogle(req, res) {
  await initDb();
  const sql = getDb();
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
  const existing = await sql`SELECT * FROM users WHERE email=${gEmail}`;
  if (existing.length === 0) {
    return res.status(403).json({ error: 'Access denied. Your account has not been authorized. Contact your Ridge administrator.' });
  }
  const user = { ...existing[0] };
  const token = crypto.randomUUID().replace(/-/g, '');
  await sql`INSERT INTO sessions (token, user_id, created_at) VALUES (${token}, ${user.id}, ${Date.now() / 1000})`;
  delete user.password_hash;
  return res.json({ user, token });
}

async function handleUsersGet(req, res) {
  await initDb();
  const sql = getDb();
  const rows = await sql`SELECT id, email, name, role, workspace_id, created_at FROM users ORDER BY created_at DESC`;
  return res.json(rows);
}

async function handleUsersPost(req, res) {
  await initDb();
  const sql = getDb();
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

async function handleUsersDelete(req, res) {
  const sql = getDb();
  const uid = req.query.id;
  if (uid) { await sql`DELETE FROM sessions WHERE user_id=${uid}`; await sql`DELETE FROM users WHERE id=${uid}`; }
  return res.json({ ok: true });
}

async function handlePasswordPost(req, res) {
  const sql = getDb();
  const { id, password } = req.body || {};
  if (id && password) { const h = sha256(password); await sql`UPDATE users SET password_hash=${h} WHERE id=${id}`; }
  return res.json({ ok: true });
}

async function handleWorkspacesGet(req, res) {
  await initDb();
  const sql = getDb();
  const rows = await sql`SELECT * FROM workspaces ORDER BY created_at DESC`;
  return res.json(rows);
}

async function handleWorkspacesPost(req, res) {
  await initDb();
  const sql = getDb();
  const b = req.body || {};
  const wid = `ws_${uuid()}`;
  await sql`INSERT INTO workspaces (id, name, website, created_at, status, type, intake_count, runs_count, client_email, is_client, notes) VALUES (${wid}, ${b.name || ''}, ${b.website || ''}, ${b.createdAt || ''}, ${b.status || 'active'}, ${b.type || 'client'}, 0, 0, ${b.clientEmail || ''}, ${b.isClient !== false ? 1 : 0}, ${b.notes || ''})`;
  return res.status(201).json({ id: wid });
}

async function handleWorkspacesPut(req, res) {
  const sql = getDb();
  const b = req.body || {};
  const wid = b.id;
  if (!wid) return res.status(400).json({ error: 'Missing workspace id' });
  if ('name' in b) await sql`UPDATE workspaces SET name=${b.name} WHERE id=${wid}`;
  if ('website' in b) await sql`UPDATE workspaces SET website=${b.website} WHERE id=${wid}`;
  if ('status' in b) await sql`UPDATE workspaces SET status=${b.status} WHERE id=${wid}`;
  if ('type' in b) await sql`UPDATE workspaces SET type=${b.type} WHERE id=${wid}`;
  if ('intake_count' in b) await sql`UPDATE workspaces SET intake_count=${b.intake_count} WHERE id=${wid}`;
  if ('runs_count' in b) await sql`UPDATE workspaces SET runs_count=${b.runs_count} WHERE id=${wid}`;
  if ('client_email' in b) await sql`UPDATE workspaces SET client_email=${b.client_email} WHERE id=${wid}`;
  if ('notes' in b) await sql`UPDATE workspaces SET notes=${b.notes} WHERE id=${wid}`;
  return res.json({ ok: true });
}

async function handleWorkspacesDelete(req, res) {
  const sql = getDb();
  const wid = req.query.id;
  if (wid) {
    await sql`DELETE FROM intake_data WHERE workspace_id=${wid}`;
    await sql`DELETE FROM strategy_data WHERE workspace_id=${wid}`;
    await sql`DELETE FROM intelligence_data WHERE workspace_id=${wid}`;
    await sql`DELETE FROM workspaces WHERE id=${wid}`;
  }
  return res.json({ ok: true });
}

async function handleIntakeGet(req, res) {
  await initDb();
  const sql = getDb();
  const wid = req.query.workspace_id;
  const rows = await sql`SELECT data FROM intake_data WHERE workspace_id=${wid}`;
  if (rows.length > 0) return res.json(JSON.parse(rows[0].data));
  return res.json({});
}

async function handleIntakePost(req, res) {
  await initDb();
  const sql = getDb();
  const { workspace_id, data } = req.body || {};
  if (!workspace_id) return res.status(400).json({ error: 'Missing workspace_id' });
  const dataStr = JSON.stringify(data || {});
  const now = Date.now() / 1000;
  await sql`INSERT INTO intake_data (workspace_id, data, updated_at) VALUES (${workspace_id}, ${dataStr}, ${now}) ON CONFLICT(workspace_id) DO UPDATE SET data=EXCLUDED.data, updated_at=EXCLUDED.updated_at`;
  return res.json({ ok: true });
}

async function handleStrategyGet(req, res) {
  await initDb();
  const sql = getDb();
  const wid = req.query.workspace_id;
  const rows = await sql`SELECT data FROM strategy_data WHERE workspace_id=${wid}`;
  if (rows.length > 0) return res.json(JSON.parse(rows[0].data));
  return res.json({});
}

async function handleStrategyPost(req, res) {
  await initDb();
  const sql = getDb();
  const { workspace_id, data } = req.body || {};
  if (!workspace_id) return res.status(400).json({ error: 'Missing workspace_id' });
  const dataStr = JSON.stringify(data || {});
  const now = Date.now() / 1000;
  await sql`INSERT INTO strategy_data (workspace_id, data, updated_at) VALUES (${workspace_id}, ${dataStr}, ${now}) ON CONFLICT(workspace_id) DO UPDATE SET data=EXCLUDED.data, updated_at=EXCLUDED.updated_at`;
  await sql`UPDATE workspaces SET runs_count = runs_count + 1 WHERE id=${workspace_id}`;
  return res.json({ ok: true });
}

async function handleSettingsGet(req, res) {
  await initDb();
  const sql = getDb();
  const key = req.query.key;
  if (key) {
    const kr = await sql`SELECT value FROM settings WHERE key=${key}`;
    return res.json({ value: kr.length > 0 ? kr[0].value : '' });
  }
  const rows = await sql`SELECT * FROM settings`;
  const obj = {};
  for (const r of rows) obj[r.key] = r.value;
  return res.json(obj);
}

async function handleSettingsPost(req, res) {
  await initDb();
  const sql = getDb();
  const { key, value } = req.body || {};
  if (key) await sql`INSERT INTO settings (key, value) VALUES (${key}, ${value || ''}) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value`;
  return res.json({ ok: true });
}

async function handleIntelligenceGet(req, res) {
  await initDb();
  const sql = getDb();
  const wid = req.query.workspace_id;
  const rows = await sql`SELECT * FROM intelligence_data WHERE workspace_id=${wid}`;
  if (rows.length > 0) {
    const r = rows[0];
    return res.json({ signals: JSON.parse(r.signals), dismissed: JSON.parse(r.dismissed), drafts: JSON.parse(r.drafts), last_scan_at: r.last_scan_at, scan_count: r.scan_count });
  }
  return res.json({ signals: [], dismissed: [], drafts: {}, last_scan_at: 0, scan_count: 0 });
}

async function handleIntelligencePost(req, res) {
  await initDb();
  const sql = getDb();
  const b = req.body || {};
  const wid = b.workspace_id;
  if (!wid) return res.status(400).json({ error: 'Missing workspace_id' });
  const signals = JSON.stringify(b.signals || []);
  const dismissed = JSON.stringify(b.dismissed || []);
  const drafts = JSON.stringify(b.drafts || {});
  const lastScan = b.last_scan_at || Date.now() / 1000;
  const scanCount = b.scan_count || 0;
  const now = Date.now() / 1000;
  await sql`INSERT INTO intelligence_data (workspace_id, signals, dismissed, drafts, last_scan_at, scan_count, updated_at) VALUES (${wid}, ${signals}, ${dismissed}, ${drafts}, ${lastScan}, ${scanCount}, ${now}) ON CONFLICT(workspace_id) DO UPDATE SET signals=EXCLUDED.signals, dismissed=EXCLUDED.dismissed, drafts=EXCLUDED.drafts, last_scan_at=EXCLUDED.last_scan_at, scan_count=EXCLUDED.scan_count, updated_at=EXCLUDED.updated_at`;
  return res.json({ ok: true });
}

async function handleSeed(req, res) {
  await initDb();
  const sql = getDb();
  const now = Date.now() / 1000;
  const admins = [
    { email: 'jack@ridgeinternal.com', password: 'ridge2026', name: 'Jack' },
    { email: 'owen@ridgeinternal.com', password: 'ridge2026', name: 'Owen' },
  ];
  for (const admin of admins) {
    const existing = await sql`SELECT id FROM users WHERE email=${admin.email}`;
    if (existing.length === 0) {
      const uid = `usr_${uuid()}`;
      const h = sha256(admin.password);
      await sql`INSERT INTO users (id, email, password_hash, name, role, workspace_id, created_at) VALUES (${uid}, ${admin.email}, ${h}, ${admin.name}, 'ridge_admin', '', ${now})`;
    }
  }
  await sql`INSERT INTO settings (key, value) VALUES ('theme', 'dark') ON CONFLICT(key) DO NOTHING`;
  return res.json({ ok: true, message: 'Database seeded with admin accounts' });
}

async function handleAI(req, res) {
  const b = req.body || {};
  const action = b.action || '';

  if (action === 'health') {
    const envKeys = Object.keys(process.env).filter(k => k.toLowerCase().includes('openai') || k.toLowerCase().includes('anthropic') || k.toLowerCase().includes('api_key'));
    return res.json({
      ok: true,
      providers: ['anthropic', 'openai'],
      anthropic_set: !!ANTHROPIC_KEY,
      openai_set: !!OPENAI_KEY,
      env_keys_found: envKeys,
      models: {
        // Default routing
        fast: CLAUDE_HAIKU,
        balanced: CLAUDE_SONNET,
        smartest_anthropic: CLAUDE_OPUS,
        smartest_openai: GPT_5_5,
        web_search: 'gpt-4o-search-preview',
        // Full available list (selectable from UI)
        available: [
          { id: 'claude-haiku-4-5',  label: 'Claude Haiku 4.5',  provider: 'anthropic', tier: 'fast' },
          { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', provider: 'anthropic', tier: 'balanced' },
          { id: 'claude-opus-4-7',   label: 'Claude Opus 4.7',   provider: 'anthropic', tier: 'smartest' },
          { id: 'gpt-4o-mini',       label: 'GPT-4o mini',       provider: 'openai',    tier: 'fast' },
          { id: 'gpt-4o',            label: 'GPT-4o',            provider: 'openai',    tier: 'balanced' },
          { id: 'gpt-5.4',           label: 'GPT-5.4',           provider: 'openai',    tier: 'balanced' },
          { id: 'gpt-5.5',           label: 'GPT-5.5',           provider: 'openai',    tier: 'smartest' },
        ],
      },
    });
  }

  if (action === 'scan_website') {
    const url = (b.url || '').trim();
    if (!url) return res.status(400).json({ error: 'URL required' });
    const sys = 'Search the web for the company at the given URL. Then return ONLY valid JSON with the extracted data. No markdown, no backticks, no commentary. If you cannot determine a field, use empty string "". Keep all values on a single line.';
    const usr = `Search for this company: ${url}\n\nFind what they do, what they sell, target market, value props, industry, company size, and differentiators.\n\nAfter searching, return ONLY this JSON structure with fields filled from your research:\n\n{"company":{"name":"","website":"${url}","description":"","size_range":"","industry":""},"offer":{"name":"","description":"","pricing_model":"","avg_deal_size":"","differentiators":""},"icp":{"description":"","company_size":{"min":"","max":""},"industries":"","geographies":"","technographics":"","excluded_segments":""},"value_props":{"primary":"","secondary":"","proof_points":""},"pain_points":{"primary":"","secondary":"","status_quo_cost":""},"constraints":{"excluded_titles":"","tone_preference":"","compliance_notes":"","other":""}}`;
    return res.json(await callAI(sys, usr, 'haiku', 3000, true));
  }

  if (action === 'extract_notes') {
    const notesText = (b.notes || '').trim();
    const source = b.source || 'raw';
    if (!notesText) return res.status(400).json({ error: 'Notes text required' });
    const sys = `STRICT JSON OUTPUT MODE. Return ONLY valid JSON. No markdown. No backticks. No commentary. No trailing commas. Escape all quotes inside strings. No newlines inside string values.\n\nYou are extracting client intake data from meeting notes (likely from Circleback, Granola, Fathom, Otter, or similar AI notetaker).\n\nThese notes contain a conversation about a client's business, offer, target market, pain points, and goals. Extract as much structured data as possible.\n\nFor fields you cannot determine, use empty string "". Do not fabricate. Only extract what is explicitly mentioned or clearly implied in the notes.`;
    const usr = `Extract intake form data from these meeting notes.\n\nSOURCE: ${source}\n\nNOTES:\n${notesText}\n\nReturn ONLY this JSON. Fill every field you can extract. Empty string for unknowns.\n\n{"company":{"name":"","website":"","description":"","size_range":"","industry":""},"offer":{"name":"","description":"","pricing_model":"","avg_deal_size":"","differentiators":""},"icp":{"description":"","company_size":{"min":"","max":""},"industries":"","geographies":"","technographics":"","excluded_segments":""},"value_props":{"primary":"","secondary":"","proof_points":""},"pain_points":{"primary":"","secondary":"","status_quo_cost":""},"constraints":{"excluded_titles":"","tone_preference":"","compliance_notes":"","other":""}}`;
    return res.json(await callAI(sys, usr, 'haiku', 3000));
  }

  // ─── CHUNKED STRATEGY GENERATION (6 small calls, each < 10s for Vercel Hobby) ───
  // Strict system prompt: forces the model to fill EVERY field with substantive content.
  const STRAT_SYS = [
    'You are Ridge\'s senior B2B sales strategist. You write concrete, specific, opinionated strategy.',
    'Output ONLY valid JSON. No markdown, no backticks, no commentary. Single-line string values. Escape quotes with backslash.',
    'CRITICAL: Every field in the schema MUST be filled with real, specific content. Empty strings ("") are FORBIDDEN.',
    'If the intake data is sparse, infer reasonable specifics from industry norms — NEVER leave a field blank.',
    'String fields must be at least one full sentence (15+ words). Arrays must have the requested number of populated items.',
    'Numeric fields like fit_score, quality_score, company_size min/max must be real numbers based on judgment.',
    'Tone rules: VP+ seniority default. Observation > Offer. Specific over generic. No fluff.',
    'Banned phrases: "Hope this finds you well", "Just checking in", "Synergy", "Leverage", "Game-changing", "Reach out", "Touch base", "Circle back", "Quick chat", "Pick your brain".',
    'Banned brand term: never use the word "outbound" anywhere in any field.',
  ].join('\n');

  if (action === 'strategy_chunk_1') {
    // ICP + Targeting
    const cn = b.company_name || ''; const ib = b.intake_block || '';
    if (!ib) return res.status(400).json({ error: 'intake_block required' });
    const usr = `CLIENT: ${cn}\n\nINTAKE DATA:\n${ib}\n\nGenerate ICP refinement and decision-maker targeting for this client. Fill EVERY field with specific content; empty strings are forbidden. Return JSON exactly matching this schema (replace placeholder values with real strategy content):\n\n{"client_name":"${cn}","offer_summary":"<2-sentence summary of what they sell, who buys it, and why—inferred from intake>","icp_summary":"<2-sentence ICP summary: segment, size, signals>","icp_refinement":{"primary_segments":[{"segment":"<segment name>","description":"<why this segment is the strongest fit>","fit_score":85},{"segment":"<another strong segment>","description":"<rationale>","fit_score":75}],"secondary_segments":[{"segment":"<viable but lower priority>","description":"<why secondary>","fit_score":60}],"narrowing_recommendations":["<specific filter to tighten ICP>","<another narrowing recommendation>"],"red_flags":["<account profile to AVOID and why>","<another red flag>"]},"decision_maker_targeting":{"seniority_policy":"VP_PLUS_DEFAULT","primary_titles":[{"title":"<exact target title>","rationale":"<why this title owns the problem>"},{"title":"<second primary title>","rationale":"<rationale>"}],"secondary_titles":[{"title":"<adjacent title>","rationale":"<rationale>"}],"avoid_titles":["<title to avoid and why—inline>","<another title to avoid>"],"buying_committee":{"who_cares":"<feels the pain day-to-day>","who_signs":"<approves budget>","who_influences":"<technical or operational influencer>","who_blocks":"<common blocker and how to neutralize>"}}}`;
    return res.json(await callAI(STRAT_SYS, usr, b.model || 'haiku', 2500));
  }

  if (action === 'strategy_chunk_2') {
    // Channel strategy + messaging angles
    const cn = b.company_name || ''; const ib = b.intake_block || '';
    if (!ib) return res.status(400).json({ error: 'intake_block required' });
    const usr = `CLIENT: ${cn}\n\nINTAKE DATA:\n${ib}\n\nGenerate channel strategy and messaging angles. Fill EVERY field with specific content; empty strings are forbidden. Return JSON:\n\n{"channel_strategy":{"primary_channel":"<LinkedIn / Email / Multi—pick one and justify>","channel_breakdown":[{"channel":"LinkedIn","usage":"<how it's used>","daily_volume":"<concrete daily volume>","notes":"<execution notes>"},{"channel":"Email","usage":"<how it's used>","daily_volume":"<concrete volume>","notes":"<notes>"}],"pacing":{"ramp_week_1":"<volume + warmup approach>","steady_state":"<steady volume>","multi_sender":"<single vs multi-sender approach>"},"warm_vs_cold":"<2-sentence guidance on warm intros vs cold>"},"messaging_angles":{"angles":[{"name":"<angle name>","description":"<what the angle is>","when_to_use":"<when this angle wins>","example_hook":"<one specific example opening line>","strength":85},{"name":"<second angle name>","description":"<description>","when_to_use":"<context>","example_hook":"<example>","strength":80}],"lead_with":{"insight":"<the insight to lead with>","curiosity":"<curiosity hook>","credibility":"<credibility marker>"},"never_say":["<phrase to avoid>","<another phrase>"]},"value_prop_framing":{"first_touch_simplification":"<how to compress the value prop into one line>","outcome_emphasis":{"primary":"<#1 outcome>","secondary":"<#2 outcome>","tertiary":"<#3 outcome>"},"proof_point_strategy":{"hint_in_outreach":["<proof to mention in cold message>","<another>"],"save_for_calls":["<proof to hold back>","<another>"]}},"meeting_booking":{"cta_style":{"recommended":"<style name e.g. soft-ask, hard-ask, calendar-drop>","description":"<why this style>","examples":["<one example CTA line>","<second example>"]},"calendar_link_timing":"<when to send a calendar link in the sequence>","friction_reduction":["<friction-removal tactic>","<another>"],"no_show_prevention":["<no-show prevention tactic>","<another>"]}}`;
    return res.json(await callAI(STRAT_SYS, usr, b.model || 'haiku', 2500));
  }

  if (action === 'strategy_chunk_3') {
    // Sales Nav + targeting filters
    const cn = b.company_name || ''; const ib = b.intake_block || '';
    if (!ib) return res.status(400).json({ error: 'intake_block required' });
    const usr = `CLIENT: ${cn}\n\nINTAKE DATA:\n${ib}\n\nGenerate concrete LinkedIn Sales Navigator filters and title clusters. Use real geographies, real industry names, real titles. Empty strings forbidden. Return JSON:\n\n{"sales_nav":{"recommended_filters":{"geography":["<region 1>","<region 2>"],"company_size":{"min":50,"max":500},"industries":["<industry 1>","<industry 2>","<industry 3>"],"seniority":["VP","Director","C-Suite"],"exclude_industries":["<industry to exclude>","<another>"]},"title_patterns":{"high_performers":["<title pattern>","<another>"],"boolean_string":"<actual boolean search string with AND/OR/NOT and quoted titles>"},"profile_red_flags":["<profile signal indicating bad fit>","<another>"]},"targeting":{"seniority_policy":"VP_PLUS_DEFAULT","title_clusters":[{"cluster":"<cluster name>","titles":["<title>","<title>","<title>"],"notes":"<notes on this cluster>"},{"cluster":"<second cluster name>","titles":["<title>","<title>"],"notes":"<notes>"}],"filters":{"company_size_min":50,"company_size_max":500,"industries_include":["<industry>","<industry>"],"exclude":["<exclusion>","<exclusion>"]}}}`;
    return res.json(await callAI(STRAT_SYS, usr, b.model || 'haiku', 1500));
  }

  if (action === 'strategy_chunk_4') {
    // Positioning + conversation flow
    const cn = b.company_name || ''; const ib = b.intake_block || '';
    if (!ib) return res.status(400).json({ error: 'intake_block required' });
    const usr = `CLIENT: ${cn}\n\nINTAKE DATA:\n${ib}\n\nWrite positioning + a 3-message conversation flow for LinkedIn / email. Each message MUST be under 100 words, observation-first, no "hope this finds you well", no "reach out". Reference specific signals from the intake. Empty strings forbidden. Return JSON:\n\n{"positioning":{"primary_angle":"<the single most useful positioning angle>","philosophy":"<2-sentence positioning philosophy for this client>","avoid":["<positioning trap to avoid>","<another>"],"hooks":["<concrete hook line>","<concrete hook line>"]},"conversation_flow":{"connect_note":"<actual LinkedIn connect note text — must be under 300 chars and specific>","message_1":{"label":"Opening observation","text":"<full message text — 80–100 words, observation-first, ends with a soft ask>","quality_score":85,"quality_notes":"<why this lands>"},"message_2":{"label":"Bump with proof","text":"<full message text — 60–80 words, references the previous touch, adds one proof point>","quality_score":80,"quality_notes":"<why this lands>"},"message_3":{"label":"Permission close","text":"<full message text — 50–70 words, gives the recipient a graceful out>","quality_score":78,"quality_notes":"<why this lands>"},"cta_rules":"<rules for CTAs across the sequence>","tone_rules":"<tone rules>","strict_avoid":["<phrase to never use>","<another>"]}}`;
    return res.json(await callAI(STRAT_SYS, usr, b.model || 'haiku', 1800));
  }

  if (action === 'strategy_chunk_5') {
    // Follow-up + campaign risks
    const cn = b.company_name || ''; const ib = b.intake_block || '';
    if (!ib) return res.status(400).json({ error: 'intake_block required' });
    const usr = `CLIENT: ${cn}\n\nINTAKE DATA:\n${ib}\n\nGenerate follow-up cadence and campaign risk analysis. Empty strings forbidden — fill every field with real, specific content. Return JSON:\n\n{"follow_up":{"cadence":"<concrete cadence e.g. 'Day 0, Day 3, Day 7, Day 14, Day 28'>","philosophy":"<2-sentence follow-up philosophy>","themes":[{"touch":1,"theme":"<theme name>","angle":"<specific angle for this touch>"},{"touch":2,"theme":"<theme name>","angle":"<angle>"},{"touch":3,"theme":"<theme name>","angle":"<angle>"},{"touch":4,"theme":"<theme name>","angle":"<angle>"}]},"campaign_risks":{"likely_objections":[{"objection":"<actual objection>","response_angle":"<how to handle it>"},{"objection":"<another>","response_angle":"<response>"},{"objection":"<another>","response_angle":"<response>"}],"success_signals":["<early indicator the campaign is working>","<another>"],"failure_signals":["<early warning of campaign failure>","<another>"],"week_1_2_adjustments":["<concrete tweak to make in week 1-2>","<another>"]}}`;
    return res.json(await callAI(STRAT_SYS, usr, b.model || 'haiku', 2000));
  }

  if (action === 'strategy_chunk_6') {
    // Execution notes
    const cn = b.company_name || ''; const ib = b.intake_block || '';
    if (!ib) return res.status(400).json({ error: 'intake_block required' });
    const usr = `CLIENT: ${cn}\n\nINTAKE DATA:\n${ib}\n\nWrite Ridge's execution notes — how Ridge will run this campaign. Specific, opinionated, no fluff. Empty strings forbidden. Return JSON:\n\n{"ridge_execution_notes":{"personalization":"<concrete personalization approach — what variables get personalized, how>","message_philosophy":"<2-sentence message philosophy for this account>","quality_benchmark":"<the bar a message must clear before sending>","risks":["<execution risk for Ridge to watch>","<another>"],"next_steps":["<first concrete next step>","<second>","<third>"]}}`;
    return res.json(await callAI(STRAT_SYS, usr, b.model || 'haiku', 1000));
  }

  // Legacy endpoints (kept for backwards compat — will timeout on Hobby plan)
  if (action === 'strategy_part_a') {
    const cn = b.company_name || ''; const ib = b.intake_block || ''; const m = b.model || 'haiku';
    if (!ib) return res.status(400).json({ error: 'intake_block required' });
    const usr = `Strategy Part A for: ${cn}\n\n${ib}\n\nReturn JSON with: client_name, offer_summary, icp_summary, icp_refinement (primary_segments, secondary_segments, narrowing_recommendations, red_flags), decision_maker_targeting (primary_titles, secondary_titles, avoid_titles, buying_committee), channel_strategy, messaging_angles, value_prop_framing, meeting_booking.`;
    return res.json(await callAI(STRAT_SYS, usr, m, 4000));
  }

  if (action === 'strategy_part_b') {
    const cn = b.company_name || ''; const ib = b.intake_block || ''; const m = b.model || 'haiku';
    if (!ib) return res.status(400).json({ error: 'intake_block required' });
    const usr = `Strategy Part B for: ${cn}\n\n${ib}\n\nReturn JSON with: sales_nav (filters, title_patterns, red_flags), campaign_risks, targeting (title_clusters, filters), positioning, conversation_flow (3 messages), follow_up (cadence, themes), ridge_execution_notes.`;
    return res.json(await callAI(STRAT_SYS, usr, m, 4000));
  }

  if (action === 'summarize_section') {
    const sd = b.section_data || '';
    const cn = b.client_name || '';
    const sn = b.section_name || '';
    if (!sd) return res.status(400).json({ error: 'section_data required' });
    const sys = "You write concise, professional summaries for sales teams. Write in plain language, no markdown, no bullet points, no headers. Write as 2-4 short paragraphs that someone can copy-paste into a Slack message or email to a client/prospect. Reference the client by name. Be specific — use actual data from the section. Keep it under 200 words.";
    return res.json(await callAI(sys, `Summarize this ${sn} section for ${cn}:\n\n${sd}`, 'haiku', 1000));
  }

  if (action === 'scan_intelligence') {
    const q = b.query || '';
    const ctx = b.context || '';
    if (!q) return res.status(400).json({ error: 'query required' });
    const sys = `You are a B2B sales intelligence scanner. Search the web for the given query. Find recent news, announcements, social posts, and events that could be relevant for outbound sales prospecting.\n\nAfter searching, return ONLY a valid JSON array of signals. No markdown, no backticks, no explanation. Each signal object:\n{"headline":"Short headline","source":"Source name","url":"URL if available","date":"ISO date or relative","signal_type":"funding|hiring|leadership_change|earnings|competitor|regulatory|product_launch|market_trend|expansion|layoff|acquisition|partnership|pain_signal|tech_adoption|social_post","summary":"1-2 sentence explanation","companies_mentioned":["Company A"],"urgency":"immediate|this_week|monitor","relevance_score":85}\n\nReturn 3-5 of the most relevant and recent signals.`;
    let r = await callAnthropicSearch(sys, `Search for: ${q}\n\n${ctx}`, CLAUDE_HAIKU, 4000);
    if (!r.ok && OPENAI_KEY) r = await callOpenAISearch(sys, `Search for: ${q}\n\n${ctx}`, undefined, 4000);
    return res.json(r);
  }

  if (action === 'draft_outreach') {
    const sig = b.signal || '';
    const ctx = b.context || '';
    if (!sig) return res.status(400).json({ error: 'signal data required' });
    const sys = `You write concise B2B outreach messages for LinkedIn and email. Rules:\n- Observation > Offer tone. Lead with what you noticed, not what you sell.\n- Never say: "Hope this finds you well", "Just checking in", "Synergy", "Leverage", "Game-changing"\n- Reference the specific signal/news naturally\n- Keep LinkedIn connection notes under 300 characters, messages under 1000\n- Be human, direct, and specific\n- No emojis in professional outreach\n\nReturn ONLY valid JSON:\n{"connection_note":"","linkedin_message":"","email_subject":"","email_body":"","suggested_target_title":"","timing_note":""}`;
    return res.json(await callAI(sys, `Generate outreach based on this signal:\n\n${sig}\n\nClient/strategy context:\n${ctx}`, 'haiku', 2000));
  }

  if (action === 'market_pulse') {
    const sys = 'Search for current US stock market data. Return ONLY JSON, no markdown, no backticks.';
    const usr = `Get today's US market data. Return ONLY this JSON:\n{"sp500":{"price":"","change_pct":""},"nasdaq":{"price":"","change_pct":""},"ten_year_yield":"","vix":"","updated":""}\nIf markets are closed, return last closing data.`;
    let r = await callAnthropicSearch(sys, usr, CLAUDE_HAIKU, 500);
    if (!r.ok && OPENAI_KEY) r = await callOpenAISearch(sys, usr, undefined, 500);
    return res.json(r);
  }

  return res.status(400).json({ error: `Unknown action: ${action}` });
}

// ─── Main Handler ────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Parse the path after /api/
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const path = url.pathname.replace(/^\/api\/?/, '');

  try {
    // Auth routes
    if (path === 'auth/login' && req.method === 'POST') return await handleAuthLogin(req, res);
    if (path === 'auth/session' && req.method === 'GET') return await handleAuthSession(req, res);
    if (path === 'auth/logout' && req.method === 'POST') return await handleAuthLogout(req, res);
    if (path === 'auth/google' && req.method === 'POST') return await handleAuthGoogle(req, res);
    if (path === 'auth/rate-limit-check' && req.method === 'POST') return await handleRateLimitCheck(req, res);
    if (path === 'auth/rate-limit-record-failure' && req.method === 'POST') return await handleRateLimitRecordFailure(req, res);

    // Users routes
    if (path === 'users' && req.method === 'GET') return await handleUsersGet(req, res);
    if (path === 'users' && req.method === 'POST') return await handleUsersPost(req, res);
    if (path === 'users' && req.method === 'DELETE') return await handleUsersDelete(req, res);
    if (path === 'users/password' && req.method === 'POST') return await handlePasswordPost(req, res);

    // Workspaces routes
    if (path === 'workspaces' && req.method === 'GET') return await handleWorkspacesGet(req, res);
    if (path === 'workspaces' && req.method === 'POST') return await handleWorkspacesPost(req, res);
    if (path === 'workspaces' && req.method === 'PUT') return await handleWorkspacesPut(req, res);
    if (path === 'workspaces' && req.method === 'DELETE') return await handleWorkspacesDelete(req, res);

    // Data routes
    if (path === 'intake' && req.method === 'GET') return await handleIntakeGet(req, res);
    if (path === 'intake' && req.method === 'POST') return await handleIntakePost(req, res);
    if (path === 'strategy' && req.method === 'GET') return await handleStrategyGet(req, res);
    if (path === 'strategy' && req.method === 'POST') return await handleStrategyPost(req, res);
    if (path === 'settings' && req.method === 'GET') return await handleSettingsGet(req, res);
    if (path === 'settings' && req.method === 'POST') return await handleSettingsPost(req, res);
    if (path === 'intelligence' && req.method === 'GET') return await handleIntelligenceGet(req, res);
    if (path === 'intelligence' && req.method === 'POST') return await handleIntelligencePost(req, res);

    // Seed & AI
    if (path === 'seed' && req.method === 'POST') return await handleSeed(req, res);
    if ((path === 'ai' || path === '') && req.method === 'POST') return await handleAI(req, res);

    // Health check
    if (path === 'health') return res.json({ ok: true, ts: new Date().toISOString() });

    return res.status(404).json({ error: 'Not found' });
  } catch (e) {
    console.error('API Error:', e);
    return res.status(500).json({ error: 'Server error', detail: e.message });
  }
};

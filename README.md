# Ridge Strategy Engine

## Deploy to Vercel (all-in-one)

### Step 1 — Import to Vercel
1. Go to [vercel.com/new](https://vercel.com/new)
2. Click **Continue with GitHub**
3. Select `owen543/ridge-strategy-engine`
4. Add these **Environment Variables**:

| Variable | Value |
|---|---|
| `ANTHROPIC_API_KEY` | Your Anthropic API key |
| `OPENAI_API_KEY` | Your OpenAI API key |

5. Click **Deploy**

### Step 2 — Add Vercel Postgres
1. After deploy, go to your project in the Vercel dashboard
2. Click **Storage** tab → **Create Database** → **Postgres**
3. Name it `ridge-db`, select a region, click **Create**
4. Vercel auto-injects `POSTGRES_URL` env vars — no manual config needed

### Step 3 — Seed the Database
Open your deployed site, open browser console (F12), and run:
```js
fetch('/api/seed', { method: 'POST' }).then(r => r.json()).then(console.log)
```

Admin accounts created:
- `owen@ridgeinternal.com` / `ridge2026`
- `jack@ridgeinternal.com` / `ridge2026`

### Step 4 — Redeploy
After adding Postgres storage, trigger a redeploy:
1. Go to **Deployments** tab → click the three dots on the latest → **Redeploy**

## Architecture
- **Frontend**: Static React SPA from `/public`
- **Backend**: Vercel Serverless Functions in `/api`
- **Database**: Vercel Postgres (`@vercel/postgres`)
- **AI**: Anthropic Claude + OpenAI GPT-4o (dual fallback)

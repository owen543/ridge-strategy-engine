# Ridge Strategy Engine — Vercel Deployment

## Quick Deploy

### 1. Create a Neon Database (free)
1. Go to [neon.tech](https://neon.tech) and sign up / sign in
2. Create a new project → name it `ridge-engine`
3. Copy the **connection string** (starts with `postgresql://...`)

### 2. Deploy to Vercel
1. Go to [vercel.com/new](https://vercel.com/new)
2. Import the `owen543/ridge-strategy-engine` repository from GitHub
3. In the **Environment Variables** section, add:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Your Neon connection string |
| `ANTHROPIC_API_KEY` | Your Anthropic API key |
| `OPENAI_API_KEY` | Your OpenAI API key |

4. Click **Deploy**

### 3. Seed the Database
After deployment, hit this URL once in your browser:
```
https://your-vercel-url.vercel.app/api/seed
```
(Send a POST request — you can use the browser console):
```js
fetch('/api/seed', { method: 'POST' }).then(r => r.json()).then(console.log)
```

This creates the admin accounts:
- `owen@ridgeinternal.com` / `ridge2026`
- `jack@ridgeinternal.com` / `ridge2026`

## Architecture
- **Frontend**: Static HTML/React served from `/public`
- **Backend**: Node.js serverless functions in `/api`
- **Database**: Neon Postgres (serverless)
- **AI**: Anthropic Claude (primary) + OpenAI (fallback)

## Environment Variables
| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | Neon Postgres connection string |
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key for Claude |
| `OPENAI_API_KEY` | Yes | OpenAI API key for GPT-4o |

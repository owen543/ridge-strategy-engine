# Ridge Strategy Engine

AI-powered sales intelligence platform by Ridge.

## Setup

1. Clone the repo
2. Copy `.env.example` to `.env.local` and fill in your credentials
3. Add a Neon Postgres database and set `DATABASE_URL`
4. Deploy to Vercel

## Environment Variables

- `DATABASE_URL` — Neon Postgres connection string
- `ANTHROPIC_API_KEY` — Anthropic API key for Claude
- `OPENAI_API_KEY` — OpenAI API key for GPT-4o and web search

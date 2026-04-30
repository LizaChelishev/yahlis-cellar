# Yahli's Cellar

Personal wine cellar tracker. Photograph bottle labels, AI auto-fills details. Built with Next.js, Supabase, and Claude.

## Stack

- Next.js 16 (App Router) + TypeScript
- Tailwind v4
- Supabase (Postgres + Storage)
- Anthropic Claude (`claude-haiku-4-5`) with `web_search` + `web_fetch`
- Deployed on Vercel

## Local development

```bash
npm install
npm run dev
```

Visit `http://localhost:3000`.

## Environment

Create a `.env.local` with:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
ANTHROPIC_API_KEY=...
```

## Database

Migrations live in `supabase/migrations/`. Apply them once in the Supabase SQL Editor (in order).

## PWA icons

If `public/icon.svg` changes, regenerate the PNG variants:

```bash
node scripts/generate-icons.mjs
```

Outputs `public/icon-192.png`, `public/icon-512.png`, `public/apple-touch-icon.png`.

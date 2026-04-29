# Wine Tracker

## Purpose
A personal app to catalog wine bottles. Single user (my boyfriend).
He receives or buys bottles, enters basic info, and the app uses an AI agent
to enrich each entry with detailed wine info pulled from the web.

## Core flow
1. User enters: bottle name, optional store, optional photo of label.
2. Server calls Gemini (with web search) to fetch:
   - producer, region, country
   - vintage (year)
   - grape variety / blend
   - color (red / white / rose / sparkling / dessert / fortified)
   - tasting notes
   - typical price range
   - food pairing suggestions
   - drinking window (when to drink)
   - any other interesting context
3. AI returns structured JSON, app shows a draft card.
4. User can edit any field, then save to the collection.
5. Collection page: grid of all bottles, filter by color / grape / region.

## Stack
- Next.js (App Router) + TypeScript
- Tailwind CSS
- Supabase (Postgres + Storage for label images)
- Gemini API (gemini-2.5-flash or latest, with Google Search grounding)
- Deployed on Vercel

## Constraints
- Free tier only. No paid services.
- Single user, no auth needed for v1 (we can add later).
- Mobile-friendly UI (he'll use it on his phone in front of the wine fridge).
- Clean, modern design. Not corporate.

## Out of scope for v1
- Multi-user / sharing
- Tasting log / ratings (will add in v2)
- Inventory location tracking inside the fridge
- Barcode scanning

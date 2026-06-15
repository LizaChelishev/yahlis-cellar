-- Two named tasting ratings per archived bottle, kept separate (Yahli / Liza).
-- Each blob holds { score, tags, note, would_buy_again, rated_at }; null = the
-- rater hasn't rated. score is a half-point value 1–5 (multiple of 0.5),
-- validated in the saveArchivedRatings server action. Stored as jsonb so each
-- rater's rating travels with the existing archived_wines.select("*").
alter table public.archived_wines
  add column if not exists yahli_rating jsonb,
  add column if not exists liza_rating jsonb;

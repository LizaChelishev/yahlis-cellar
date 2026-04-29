create extension if not exists "pgcrypto";

create table if not exists public.wines (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  store text,
  producer text,
  region text,
  country text,
  vintage int,
  grape text,
  color text,
  tasting_notes text,
  price_range text,
  food_pairings text,
  drinking_window text,
  extra_notes text,
  label_image_url text
);

alter table public.wines enable row level security;

create policy "wines_allow_all_v1"
  on public.wines
  for all
  using (true)
  with check (true);

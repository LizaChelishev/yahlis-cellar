create table if not exists public.archived_wines (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  finished_at timestamptz not null default now(),
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
  price_source text,
  food_pairings text,
  drinking_window text,
  extra_notes text,
  label_image_url text,
  product_image_url text,
  shelf int,
  position int
);

alter table public.archived_wines enable row level security;

create policy "archived_wines_allow_all_v1"
  on public.archived_wines
  for all
  using (true)
  with check (true);

create index if not exists archived_wines_finished_at_idx
  on public.archived_wines (finished_at desc);

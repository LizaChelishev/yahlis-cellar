alter table public.wines
  add column if not exists shelf int,
  add column if not exists position int;

create unique index if not exists wines_shelf_position_uniq
  on public.wines (shelf, position)
  where shelf is not null and position is not null;

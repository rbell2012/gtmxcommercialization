alter table public.weekly_funnels add column if not exists accounts integer not null default 0;
alter table public.weekly_funnels add column if not exists feedback integer not null default 0;

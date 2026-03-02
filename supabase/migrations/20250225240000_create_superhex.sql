-- ============================================================
-- superhex — rep activity metrics per week
-- ============================================================

create table if not exists public.superhex (
  id                    uuid        primary key default gen_random_uuid(),
  rep_name              text        not null,
  activity_week         date        not null,
  total_activity_count  integer     not null default 0,
  calls_count           integer     not null default 0,
  connects_count        integer     not null default 0,
  total_ops             integer     not null default 0,
  total_demos           integer     not null default 0,
  total_wins            integer     not null default 0,
  total_feedback        integer     not null default 0,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index idx_superhex_rep_name on public.superhex(rep_name);
create index idx_superhex_activity_week on public.superhex(activity_week);

alter table public.superhex enable row level security;
create policy "superhex_select" on public.superhex for select using (true);
create policy "superhex_insert" on public.superhex for insert with check (true);
create policy "superhex_update" on public.superhex for update using (true);
create policy "superhex_delete" on public.superhex for delete using (true);

create trigger trg_superhex_updated_at
  before update on public.superhex
  for each row execute function public.set_updated_at();

comment on table public.superhex is 'Rep activity metrics per week (Superhex)';

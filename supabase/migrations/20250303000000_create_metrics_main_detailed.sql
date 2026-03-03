create table if not exists public.metrics_main_detailed (
  id                   uuid        primary key default gen_random_uuid(),
  rep_name             text        not null default '',
  customer_name        text        not null default '',
  total_activities     integer     not null default 0,
  first_call_date      date,
  first_connect_date   date,
  first_demo_date      date,
  latest_activity_date date,
  chorus_link          text        not null default '',
  win_date             date,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

alter table public.metrics_main_detailed enable row level security;
create policy "metrics_main_detailed_select" on public.metrics_main_detailed for select using (true);
create policy "metrics_main_detailed_insert" on public.metrics_main_detailed for insert with check (true);
create policy "metrics_main_detailed_update" on public.metrics_main_detailed for update using (true);
create policy "metrics_main_detailed_delete" on public.metrics_main_detailed for delete using (true);

create trigger trg_metrics_main_detailed_updated_at before update on public.metrics_main_detailed for each row execute function public.set_updated_at();

comment on table public.metrics_main_detailed is 'Detailed main metrics per rep and customer';

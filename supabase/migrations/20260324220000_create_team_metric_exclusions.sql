create table if not exists public.team_metric_exclusions (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  metric text not null,
  field text not null,
  value text not null,
  created_at timestamptz not null default now(),
  unique (team_id, metric, field, value)
);

create index if not exists idx_team_metric_exclusions_team on public.team_metric_exclusions(team_id);

alter table public.team_metric_exclusions enable row level security;

create policy "team_metric_exclusions_select" on public.team_metric_exclusions for select using (true);
create policy "team_metric_exclusions_insert" on public.team_metric_exclusions for insert with check (true);
create policy "team_metric_exclusions_update" on public.team_metric_exclusions for update using (true);
create policy "team_metric_exclusions_delete" on public.team_metric_exclusions for delete using (true);

comment on table public.team_metric_exclusions is 'Manual exclusions by opportunity or account name per metric; excluded rows still show in Data but do not count in funnel totals.';

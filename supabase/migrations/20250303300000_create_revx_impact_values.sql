-- RevX Impact values: stores the user-entered $ per win for each project (team).
-- One row per team, upserted on change.

create table if not exists public.revx_impact_values (
  id            uuid          primary key default gen_random_uuid(),
  team_id       uuid          not null references public.teams(id) on delete cascade,
  value_per_win numeric(15,2) not null default 0,
  created_at    timestamptz   not null default now(),
  updated_at    timestamptz   not null default now(),
  unique(team_id)
);

alter table public.revx_impact_values enable row level security;
create policy "revx_impact_values_select" on public.revx_impact_values for select using (true);
create policy "revx_impact_values_insert" on public.revx_impact_values for insert with check (true);
create policy "revx_impact_values_update" on public.revx_impact_values for update using (true);
create policy "revx_impact_values_delete" on public.revx_impact_values for delete using (true);

-- Per-phase opportunity flags and line item targets (test phase months)
create table if not exists public.team_phase_configs (
  id                  uuid        primary key default gen_random_uuid(),
  team_id             uuid        not null references public.teams(id) on delete cascade,
  month_index         integer     not null,
  opportunity_flags   jsonb       not null default '[]'::jsonb,
  line_item_targets   jsonb       not null default '[]'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique(team_id, month_index)
);

create index idx_team_phase_configs_team on public.team_phase_configs(team_id);

alter table public.team_phase_configs enable row level security;
create policy "team_phase_configs_select" on public.team_phase_configs for select using (true);
create policy "team_phase_configs_insert" on public.team_phase_configs for insert with check (true);
create policy "team_phase_configs_update" on public.team_phase_configs for update using (true);
create policy "team_phase_configs_delete" on public.team_phase_configs for delete using (true);

create trigger trg_team_phase_configs_updated_at
  before update on public.team_phase_configs
  for each row execute function public.set_updated_at();

comment on table public.team_phase_configs is 'Per test-phase month: opportunity name flags and line item targets for metric calculation';

-- team_phase_priorities: per-team editable priorities for auto-generated test phase months
create table if not exists public.team_phase_priorities (
  id          uuid        primary key default gen_random_uuid(),
  team_id     uuid        not null references public.teams(id) on delete cascade,
  month_index integer     not null,
  priority    text        not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique(team_id, month_index)
);

create index idx_team_phase_priorities_team on public.team_phase_priorities(team_id);

alter table public.team_phase_priorities enable row level security;
create policy "team_phase_priorities_select" on public.team_phase_priorities for select using (true);
create policy "team_phase_priorities_insert" on public.team_phase_priorities for insert with check (true);
create policy "team_phase_priorities_update" on public.team_phase_priorities for update using (true);
create policy "team_phase_priorities_delete" on public.team_phase_priorities for delete using (true);

create trigger trg_team_phase_priorities_updated_at
  before update on public.team_phase_priorities
  for each row execute function public.set_updated_at();

comment on table public.team_phase_priorities is 'Per-team priorities for each auto-generated test phase month';

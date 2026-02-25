-- team_phase_labels: per-team editable labels for auto-generated test phase months
create table if not exists public.team_phase_labels (
  id          uuid        primary key default gen_random_uuid(),
  team_id     uuid        not null references public.teams(id) on delete cascade,
  month_index integer     not null,
  label       text        not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique(team_id, month_index)
);

create index idx_team_phase_labels_team on public.team_phase_labels(team_id);

alter table public.team_phase_labels enable row level security;
create policy "team_phase_labels_select" on public.team_phase_labels for select using (true);
create policy "team_phase_labels_insert" on public.team_phase_labels for insert with check (true);
create policy "team_phase_labels_update" on public.team_phase_labels for update using (true);
create policy "team_phase_labels_delete" on public.team_phase_labels for delete using (true);

create trigger trg_team_phase_labels_updated_at
  before update on public.team_phase_labels
  for each row execute function public.set_updated_at();

comment on table public.team_phase_labels is 'Per-team labels for each auto-generated test phase month';

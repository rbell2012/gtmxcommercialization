-- member_team_history: tracks which team a member belonged to over time
create table if not exists public.member_team_history (
  id         uuid        primary key default gen_random_uuid(),
  member_id  uuid        not null references public.members(id) on delete cascade,
  team_id    uuid        references public.teams(id) on delete set null,
  started_at timestamptz not null default now(),
  ended_at   timestamptz
);

create index idx_member_team_history_member on public.member_team_history(member_id);
create index idx_member_team_history_team   on public.member_team_history(team_id);

alter table public.member_team_history enable row level security;
create policy "mth_select" on public.member_team_history for select using (true);
create policy "mth_insert" on public.member_team_history for insert with check (true);
create policy "mth_update" on public.member_team_history for update using (true);
create policy "mth_delete" on public.member_team_history for delete using (true);

comment on table public.member_team_history is 'Historical record of member-to-team assignments';

-- backfill: one open-ended history row per active member with a current team
insert into public.member_team_history (member_id, team_id, started_at)
select id, team_id, created_at
from public.members
where is_active = true;

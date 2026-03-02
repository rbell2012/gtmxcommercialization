-- team_goals_history: monthly snapshot of a team's goal/accelerator config
create table if not exists public.team_goals_history (
  id               uuid        primary key default gen_random_uuid(),
  team_id          uuid        not null references public.teams(id) on delete cascade,
  month            text        not null,  -- "YYYY-MM"
  goals_parity     boolean     not null default false,
  team_goals       jsonb       not null default '{}'::jsonb,
  enabled_goals    jsonb       not null default '{}'::jsonb,
  accelerator_config jsonb     not null default '{}'::jsonb,
  team_goals_by_level jsonb    not null default '{}'::jsonb,
  goal_scope_config  jsonb     not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  unique (team_id, month)
);

create index idx_team_goals_history_team on public.team_goals_history(team_id);

alter table public.team_goals_history enable row level security;
create policy "tgh_select" on public.team_goals_history for select using (true);
create policy "tgh_insert" on public.team_goals_history for insert with check (true);
create policy "tgh_update" on public.team_goals_history for update using (true);
create policy "tgh_delete" on public.team_goals_history for delete using (true);

comment on table public.team_goals_history is 'Monthly snapshots of team goal and accelerator configuration';

-- member_goals_history: monthly snapshot of a member's goals and level
create table if not exists public.member_goals_history (
  id               uuid        primary key default gen_random_uuid(),
  member_id        uuid        not null references public.members(id) on delete cascade,
  month            text        not null,  -- "YYYY-MM"
  goals            jsonb       not null default '{}'::jsonb,
  level            text,
  created_at       timestamptz not null default now(),
  unique (member_id, month)
);

create index idx_member_goals_history_member on public.member_goals_history(member_id);

alter table public.member_goals_history enable row level security;
create policy "mgh_select" on public.member_goals_history for select using (true);
create policy "mgh_insert" on public.member_goals_history for insert with check (true);
create policy "mgh_update" on public.member_goals_history for update using (true);
create policy "mgh_delete" on public.member_goals_history for delete using (true);

comment on table public.member_goals_history is 'Monthly snapshots of member goals and level';

-- backfill: snapshot current state for the current month
insert into public.team_goals_history (team_id, month, goals_parity, team_goals, enabled_goals, accelerator_config, team_goals_by_level, goal_scope_config)
select
  id,
  to_char(now(), 'YYYY-MM'),
  coalesce(goals_parity, false),
  jsonb_build_object(
    'calls', coalesce(team_goal_calls, 0),
    'ops', coalesce(team_goal_ops, 0),
    'demos', coalesce(team_goal_demos, 0),
    'wins', coalesce(team_goal_wins, 0),
    'feedback', coalesce(team_goal_feedback, 0),
    'activity', coalesce(team_goal_activity, 0)
  ),
  jsonb_build_object(
    'calls', coalesce(goal_enabled_calls, false),
    'ops', coalesce(goal_enabled_ops, false),
    'demos', coalesce(goal_enabled_demos, false),
    'wins', coalesce(goal_enabled_wins, false),
    'feedback', coalesce(goal_enabled_feedback, false),
    'activity', coalesce(goal_enabled_activity, false)
  ),
  coalesce(accelerator_config, '{}'::jsonb),
  coalesce(team_goals_by_level, '{}'::jsonb),
  coalesce(goal_scope_config, '{}'::jsonb)
from public.teams
where archived_at is null;

insert into public.member_goals_history (member_id, month, goals, level)
select
  id,
  to_char(now(), 'YYYY-MM'),
  jsonb_build_object(
    'calls', coalesce(goal_calls, 0),
    'ops', coalesce(goal_ops, 0),
    'demos', coalesce(goal_demos, 0),
    'wins', coalesce(goal_wins, 0),
    'feedback', coalesce(goal_feedback, 0),
    'activity', coalesce(goal_activity, 0)
  ),
  level
from public.members
where is_active = true;

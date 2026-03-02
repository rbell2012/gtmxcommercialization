-- Add wins and activity goal columns to members
alter table public.members
  add column if not exists goal_wins integer not null default 0,
  add column if not exists goal_activity integer not null default 0;

-- Add wins and activity goal columns to teams
alter table public.teams
  add column if not exists team_goal_wins integer not null default 0,
  add column if not exists team_goal_activity integer not null default 0,
  add column if not exists goal_enabled_wins boolean not null default false,
  add column if not exists goal_enabled_activity boolean not null default false;

-- Add activity column to weekly_funnels
alter table public.weekly_funnels
  add column if not exists activity integer not null default 0;

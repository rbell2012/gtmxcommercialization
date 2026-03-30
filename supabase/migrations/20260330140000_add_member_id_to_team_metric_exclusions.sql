-- Optional attribution: null = all reps on team; set = rule applies only to that member.

alter table public.team_metric_exclusions
  add column if not exists member_id uuid null references public.members(id) on delete set null;

create index if not exists idx_team_metric_exclusions_member on public.team_metric_exclusions(member_id);

alter table public.team_metric_exclusions
  drop constraint if exists team_metric_exclusions_unique;

-- Team-wide rules (one per combo); Postgres allows multiple NULLs in a unique index, so use partial indexes:
create unique index if not exists team_metric_exclusions_unique_team_wide
  on public.team_metric_exclusions (team_id, metric, field, value, month_key, kind)
  where member_id is null;

create unique index if not exists team_metric_exclusions_unique_per_member
  on public.team_metric_exclusions (team_id, metric, field, value, month_key, kind, member_id)
  where member_id is not null;

comment on column public.team_metric_exclusions.member_id is
  'When set, exclusion/inclusion applies only to this member''s funnel counts and hovers; null = entire team.';

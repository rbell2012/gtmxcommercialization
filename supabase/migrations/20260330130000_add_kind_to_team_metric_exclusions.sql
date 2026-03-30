-- Manual edits: exclusion (default) vs inclusion (+1 when no matching row in month).

alter table public.team_metric_exclusions
  add column if not exists kind text not null default 'exclusion';

alter table public.team_metric_exclusions
  drop constraint if exists team_metric_exclusions_kind_check;

alter table public.team_metric_exclusions
  add constraint team_metric_exclusions_kind_check check (kind in ('exclusion', 'inclusion'));

alter table public.team_metric_exclusions
  drop constraint if exists team_metric_exclusions_unique;

alter table public.team_metric_exclusions
  add constraint team_metric_exclusions_unique unique (team_id, metric, field, value, month_key, kind);

comment on column public.team_metric_exclusions.kind is
  'exclusion: drop matching rows from funnel counts; inclusion: add +1 for the month when no row matches (no double count).';

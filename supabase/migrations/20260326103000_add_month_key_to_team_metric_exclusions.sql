alter table public.team_metric_exclusions
  add column if not exists month_key text not null default to_char(now(), 'YYYY-MM');

alter table public.team_metric_exclusions
  drop constraint if exists team_metric_exclusions_team_id_metric_field_value_key;

alter table public.team_metric_exclusions
  add constraint team_metric_exclusions_unique unique (team_id, metric, field, value, month_key);

comment on column public.team_metric_exclusions.month_key is
  'Month scope (YYYY-MM) for exclusion matching.';

alter table public.team_phase_configs
  add column if not exists prospecting_notes jsonb not null default '[]'::jsonb;

comment on column public.team_phase_configs.prospecting_notes is 'Per-phase account prospecting notes filters; when set, only rows whose account_prospecting_notes contains any configured value are counted.';

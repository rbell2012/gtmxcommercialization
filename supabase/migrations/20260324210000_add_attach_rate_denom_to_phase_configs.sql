alter table public.team_phase_configs
  add column if not exists attach_rate_denom text not null default 'flagged_wins';

comment on column public.team_phase_configs.attach_rate_denom is 'Pilot attach rate denominator: flagged_wins (default) or all_wins (unfiltered by opportunity flags).';

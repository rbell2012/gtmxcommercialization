-- Add per-team Total TAM columns to the teams table
alter table public.teams
  add column if not exists total_tam integer not null default 0,
  add column if not exists tam_submitted boolean not null default false;

-- Migrate existing global TAM value into all active teams
update public.teams
set total_tam = coalesce((select total_tam from public.tam_config limit 1), 0),
    tam_submitted = coalesce((select submitted from public.tam_config limit 1), false)
where archived_at is null;

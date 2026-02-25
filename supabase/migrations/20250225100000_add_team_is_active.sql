-- Add is_active flag to teams for showing/hiding in navigation
alter table public.teams
  add column if not exists is_active boolean not null default true;

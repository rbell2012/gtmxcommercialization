-- Soft-delete support: archive teams instead of deleting them
alter table public.teams
  add column archived_at timestamptz default null;

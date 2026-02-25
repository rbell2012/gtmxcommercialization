-- Add start_date and end_date to teams
alter table public.teams
  add column if not exists start_date date,
  add column if not exists end_date   date;

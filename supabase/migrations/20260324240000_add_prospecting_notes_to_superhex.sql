alter table public.superhex
  add column if not exists prospecting_notes text null;

comment on column public.superhex.prospecting_notes is 'Account-level prospecting notes used for per-phase metric filtering.';

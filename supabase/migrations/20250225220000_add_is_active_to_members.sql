-- Soft-delete support: archived members persist on their team with all data intact
alter table public.members
  add column if not exists is_active boolean not null default true;

create index if not exists idx_members_is_active on public.members(is_active);

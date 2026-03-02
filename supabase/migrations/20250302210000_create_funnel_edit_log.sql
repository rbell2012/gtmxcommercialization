-- ============================================================
-- Funnel edit log: tracks who re-opened a submitted funnel week
-- ============================================================

create table if not exists public.funnel_edit_log (
  id          uuid        primary key default gen_random_uuid(),
  member_id   uuid        not null references public.members(id) on delete cascade,
  week_key    text        not null,
  edited_by   text        not null,
  edited_at   timestamptz not null default now()
);

create index idx_funnel_edit_log_member on public.funnel_edit_log(member_id);
create index idx_funnel_edit_log_week   on public.funnel_edit_log(week_key);

alter table public.funnel_edit_log enable row level security;
create policy "funnel_edit_log_select" on public.funnel_edit_log for select using (true);
create policy "funnel_edit_log_insert" on public.funnel_edit_log for insert with check (true);

comment on table public.funnel_edit_log is 'Tracks who re-opened a submitted funnel week for editing';

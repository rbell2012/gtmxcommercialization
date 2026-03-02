-- ============================================================
-- Audit log: automatic change tracking via Postgres triggers
-- ============================================================

create table if not exists public.audit_log (
  id          uuid        primary key default gen_random_uuid(),
  table_name  text        not null,
  record_id   text        not null,
  action      text        not null,
  old_data    jsonb,
  new_data    jsonb,
  changed_at  timestamptz not null default now()
);

create index idx_audit_log_table_record on public.audit_log (table_name, record_id);
create index idx_audit_log_changed_at   on public.audit_log (changed_at);

alter table public.audit_log enable row level security;
create policy "audit_log_select" on public.audit_log for select using (true);
create policy "audit_log_insert" on public.audit_log for insert with check (true);

comment on table public.audit_log is 'Automatic change history for core tables';

-- ==================== generic trigger function ====================

create or replace function public.audit_trigger_fn()
returns trigger as $$
begin
  insert into public.audit_log (table_name, record_id, action, old_data, new_data)
  values (
    TG_TABLE_NAME,
    coalesce(NEW.id, OLD.id)::text,
    TG_OP,
    case when TG_OP in ('UPDATE', 'DELETE') then to_jsonb(OLD) else null end,
    case when TG_OP in ('INSERT', 'UPDATE') then to_jsonb(NEW) else null end
  );
  return coalesce(NEW, OLD);
end;
$$ language plpgsql;

-- ==================== attach triggers to core tables ====================

create trigger trg_audit_teams
  after insert or update or delete on public.teams
  for each row execute function public.audit_trigger_fn();

create trigger trg_audit_members
  after insert or update or delete on public.members
  for each row execute function public.audit_trigger_fn();

create trigger trg_audit_weekly_funnels
  after insert or update or delete on public.weekly_funnels
  for each row execute function public.audit_trigger_fn();

create trigger trg_audit_win_entries
  after insert or update or delete on public.win_entries
  for each row execute function public.audit_trigger_fn();

create trigger trg_audit_test_phases
  after insert or update or delete on public.test_phases
  for each row execute function public.audit_trigger_fn();

create trigger trg_audit_mission
  after insert or update or delete on public.mission
  for each row execute function public.audit_trigger_fn();

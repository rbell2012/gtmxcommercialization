-- ============================================================
-- Restructure metrics tables for account-level + event-level data
-- - Drops + recreates: superhex, metrics_demos, metrics_ops, metrics_wins, metrics_feedback
-- - Creates new: metrics_activity, metrics_calls, metrics_connects, metrics_chorus
-- - Drops removed: metrics_touched_accounts, metrics_main_detailed
-- ============================================================

-- ==================== DROP REMOVED TABLES ====================

drop table if exists public.metrics_touched_accounts cascade;
drop table if exists public.metrics_main_detailed cascade;

-- ==================== DROP + RECREATE RESTRUCTURED TABLES ====================

drop table if exists public.superhex cascade;
drop table if exists public.metrics_demos cascade;
drop table if exists public.metrics_ops cascade;
drop table if exists public.metrics_wins cascade;
drop table if exists public.metrics_feedback cascade;

-- superhex: now account-level (one row per account per rep)
create table public.superhex (
  id                  uuid        primary key default gen_random_uuid(),
  salesforce_accountid text,
  account_name        text,
  rep_name            text        not null,
  total_activities    integer     not null default 0,
  first_activity_date date,
  last_activity_date  date,
  total_calls         integer     not null default 0,
  first_call_date     date,
  last_call_date      date,
  total_connects      integer     not null default 0,
  first_connect_date  date,
  chorus_link         text,
  chorus_date         date,
  total_demos         integer     not null default 0,
  first_demo_date     date,
  op_name             text,
  op_date             date,
  op_stage            text,
  is_won              boolean     not null default false,
  win_date            date,
  feedback            text,
  feedback_date       date,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index idx_superhex_rep on public.superhex(rep_name);
create index idx_superhex_account on public.superhex(salesforce_accountid);

alter table public.superhex enable row level security;
create policy "superhex_select" on public.superhex for select using (true);
create policy "superhex_insert" on public.superhex for insert with check (true);
create policy "superhex_update" on public.superhex for update using (true);
create policy "superhex_delete" on public.superhex for delete using (true);

-- metrics_demos: individual demo events
create table public.metrics_demos (
  id                  uuid        primary key default gen_random_uuid(),
  demo_date           date,
  demo_source         text,
  salesforce_accountid text,
  rep_name            text        not null,
  account_name        text,
  subject             text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index idx_metrics_demos_rep on public.metrics_demos(rep_name);
create index idx_metrics_demos_date on public.metrics_demos(demo_date);

alter table public.metrics_demos enable row level security;
create policy "metrics_demos_select" on public.metrics_demos for select using (true);
create policy "metrics_demos_insert" on public.metrics_demos for insert with check (true);
create policy "metrics_demos_update" on public.metrics_demos for update using (true);
create policy "metrics_demos_delete" on public.metrics_demos for delete using (true);

-- metrics_ops: opportunity records
create table public.metrics_ops (
  id                        uuid    primary key default gen_random_uuid(),
  op_date                   date,
  opportunity_name          text,
  opportunity_stage         text,
  salesforce_accountid      text,
  rep_name                  text    not null,
  gtmx_team                 text,
  account_prospecting_notes text,
  opportunity_type          text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create index idx_metrics_ops_rep on public.metrics_ops(rep_name);
create index idx_metrics_ops_date on public.metrics_ops(op_date);

alter table public.metrics_ops enable row level security;
create policy "metrics_ops_select" on public.metrics_ops for select using (true);
create policy "metrics_ops_insert" on public.metrics_ops for insert with check (true);
create policy "metrics_ops_update" on public.metrics_ops for update using (true);
create policy "metrics_ops_delete" on public.metrics_ops for delete using (true);

-- metrics_wins: win records
create table public.metrics_wins (
  id                        uuid    primary key default gen_random_uuid(),
  win_date                  date,
  account_name              text,
  salesforce_accountid      text,
  rep_name                  text    not null,
  opportunity_name          text,
  opportunity_stage         text,
  gtmx_team                 text,
  account_prospecting_notes text,
  opportunity_type          text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create index idx_metrics_wins_rep on public.metrics_wins(rep_name);
create index idx_metrics_wins_date on public.metrics_wins(win_date);

alter table public.metrics_wins enable row level security;
create policy "metrics_wins_select" on public.metrics_wins for select using (true);
create policy "metrics_wins_insert" on public.metrics_wins for insert with check (true);
create policy "metrics_wins_update" on public.metrics_wins for update using (true);
create policy "metrics_wins_delete" on public.metrics_wins for delete using (true);

-- metrics_feedback: feedback events
create table public.metrics_feedback (
  id                  uuid        primary key default gen_random_uuid(),
  feedback_date       date,
  rep_name            text        not null,
  account_name        text,
  source              text,
  feedback            text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index idx_metrics_feedback_rep on public.metrics_feedback(rep_name);
create index idx_metrics_feedback_date on public.metrics_feedback(feedback_date);

alter table public.metrics_feedback enable row level security;
create policy "metrics_feedback_select" on public.metrics_feedback for select using (true);
create policy "metrics_feedback_insert" on public.metrics_feedback for insert with check (true);
create policy "metrics_feedback_update" on public.metrics_feedback for update using (true);
create policy "metrics_feedback_delete" on public.metrics_feedback for delete using (true);

-- ==================== NEW TABLES ====================

-- metrics_activity: individual activity events
create table public.metrics_activity (
  id                  uuid        primary key default gen_random_uuid(),
  activity_date       date,
  salesforce_accountid text,
  rep_name            text        not null,
  activity_type       text,
  subject             text,
  status              text,
  activity_outcome    text,
  activity_source     text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index idx_metrics_activity_rep on public.metrics_activity(rep_name);
create index idx_metrics_activity_date on public.metrics_activity(activity_date);

alter table public.metrics_activity enable row level security;
create policy "metrics_activity_select" on public.metrics_activity for select using (true);
create policy "metrics_activity_insert" on public.metrics_activity for insert with check (true);
create policy "metrics_activity_update" on public.metrics_activity for update using (true);
create policy "metrics_activity_delete" on public.metrics_activity for delete using (true);

-- metrics_calls: individual call events
create table public.metrics_calls (
  id                  uuid        primary key default gen_random_uuid(),
  call_date           date,
  salesforce_accountid text,
  rep_name            text        not null,
  call_type           text,
  subject             text,
  status              text,
  call_outcome        text,
  call_source         text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index idx_metrics_calls_rep on public.metrics_calls(rep_name);
create index idx_metrics_calls_date on public.metrics_calls(call_date);

alter table public.metrics_calls enable row level security;
create policy "metrics_calls_select" on public.metrics_calls for select using (true);
create policy "metrics_calls_insert" on public.metrics_calls for insert with check (true);
create policy "metrics_calls_update" on public.metrics_calls for update using (true);
create policy "metrics_calls_delete" on public.metrics_calls for delete using (true);

-- metrics_connects: individual connect events
create table public.metrics_connects (
  id                  uuid        primary key default gen_random_uuid(),
  connect_date        date,
  salesforce_accountid text,
  rep_name            text        not null,
  connect_type        text,
  subject             text,
  status              text,
  connect_outcome     text,
  connect_source      text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index idx_metrics_connects_rep on public.metrics_connects(rep_name);
create index idx_metrics_connects_date on public.metrics_connects(connect_date);

alter table public.metrics_connects enable row level security;
create policy "metrics_connects_select" on public.metrics_connects for select using (true);
create policy "metrics_connects_insert" on public.metrics_connects for insert with check (true);
create policy "metrics_connects_update" on public.metrics_connects for update using (true);
create policy "metrics_connects_delete" on public.metrics_connects for delete using (true);

-- metrics_chorus: chorus recordings
create table public.metrics_chorus (
  id                  uuid        primary key default gen_random_uuid(),
  account_name        text,
  salesforce_accountid text,
  comments            text,
  chorus_link         text,
  rep_name            text        not null,
  chorus_date         date,
  rn                  integer,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index idx_metrics_chorus_rep on public.metrics_chorus(rep_name);
create index idx_metrics_chorus_date on public.metrics_chorus(chorus_date);

alter table public.metrics_chorus enable row level security;
create policy "metrics_chorus_select" on public.metrics_chorus for select using (true);
create policy "metrics_chorus_insert" on public.metrics_chorus for insert with check (true);
create policy "metrics_chorus_update" on public.metrics_chorus for update using (true);
create policy "metrics_chorus_delete" on public.metrics_chorus for delete using (true);

-- ==================== updated_at triggers ====================

create trigger trg_superhex_updated_at          before update on public.superhex          for each row execute function public.set_updated_at();
create trigger trg_metrics_demos_updated_at     before update on public.metrics_demos     for each row execute function public.set_updated_at();
create trigger trg_metrics_ops_updated_at       before update on public.metrics_ops       for each row execute function public.set_updated_at();
create trigger trg_metrics_wins_updated_at      before update on public.metrics_wins      for each row execute function public.set_updated_at();
create trigger trg_metrics_feedback_updated_at  before update on public.metrics_feedback  for each row execute function public.set_updated_at();
create trigger trg_metrics_activity_updated_at  before update on public.metrics_activity  for each row execute function public.set_updated_at();
create trigger trg_metrics_calls_updated_at     before update on public.metrics_calls     for each row execute function public.set_updated_at();
create trigger trg_metrics_connects_updated_at  before update on public.metrics_connects  for each row execute function public.set_updated_at();
create trigger trg_metrics_chorus_updated_at    before update on public.metrics_chorus    for each row execute function public.set_updated_at();

-- ==================== realtime ====================

alter publication supabase_realtime add table public.superhex;
alter publication supabase_realtime add table public.metrics_activity;
alter publication supabase_realtime add table public.metrics_calls;
alter publication supabase_realtime add table public.metrics_connects;
alter publication supabase_realtime add table public.metrics_demos;
alter publication supabase_realtime add table public.metrics_ops;
alter publication supabase_realtime add table public.metrics_wins;
alter publication supabase_realtime add table public.metrics_feedback;

-- ==================== comments ====================

comment on table public.superhex            is 'Account-level metrics per rep (Superhex) — replaces old weekly-aggregate superhex and metrics_main_detailed';
comment on table public.metrics_demos       is 'Individual demo events per rep';
comment on table public.metrics_ops         is 'Opportunity records per rep';
comment on table public.metrics_wins        is 'Win records per rep';
comment on table public.metrics_feedback    is 'Feedback events per rep';
comment on table public.metrics_activity    is 'Individual activity events per rep';
comment on table public.metrics_calls       is 'Individual call events per rep';
comment on table public.metrics_connects    is 'Individual connect events per rep';
comment on table public.metrics_chorus      is 'Chorus recordings per rep';

-- ============================================================
-- Metrics tables for external data imports
-- ============================================================

-- ==================== metrics_tam ====================

create table if not exists public.metrics_tam (
  id         uuid        primary key default gen_random_uuid(),
  source     text        not null default '',
  rep_name   text        not null default '',
  tam        integer     not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.metrics_tam enable row level security;
create policy "metrics_tam_select" on public.metrics_tam for select using (true);
create policy "metrics_tam_insert" on public.metrics_tam for insert with check (true);
create policy "metrics_tam_update" on public.metrics_tam for update using (true);
create policy "metrics_tam_delete" on public.metrics_tam for delete using (true);

-- ==================== metrics_touched_accounts ====================

create table if not exists public.metrics_touched_accounts (
  id               uuid        primary key default gen_random_uuid(),
  source           text        not null default '',
  rep_name         text        not null default '',
  touched_accounts integer     not null default 0,
  tam              integer     not null default 0,
  touch_rate       numeric     not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.metrics_touched_accounts enable row level security;
create policy "metrics_touched_accounts_select" on public.metrics_touched_accounts for select using (true);
create policy "metrics_touched_accounts_insert" on public.metrics_touched_accounts for insert with check (true);
create policy "metrics_touched_accounts_update" on public.metrics_touched_accounts for update using (true);
create policy "metrics_touched_accounts_delete" on public.metrics_touched_accounts for delete using (true);

-- ==================== metrics_demos ====================

create table if not exists public.metrics_demos (
  id            uuid        primary key default gen_random_uuid(),
  activity_week text        not null default '',
  rep_name      text        not null default '',
  demos         integer     not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.metrics_demos enable row level security;
create policy "metrics_demos_select" on public.metrics_demos for select using (true);
create policy "metrics_demos_insert" on public.metrics_demos for insert with check (true);
create policy "metrics_demos_update" on public.metrics_demos for update using (true);
create policy "metrics_demos_delete" on public.metrics_demos for delete using (true);

-- ==================== metrics_ops ====================

create table if not exists public.metrics_ops (
  id                     uuid        primary key default gen_random_uuid(),
  opportunity_close_week text        not null default '',
  opportunity_name       text        not null default '',
  full_name              text        not null default '',
  gtmx_team              text        not null default '',
  opportunity_iswon      boolean     not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

alter table public.metrics_ops enable row level security;
create policy "metrics_ops_select" on public.metrics_ops for select using (true);
create policy "metrics_ops_insert" on public.metrics_ops for insert with check (true);
create policy "metrics_ops_update" on public.metrics_ops for update using (true);
create policy "metrics_ops_delete" on public.metrics_ops for delete using (true);

-- ==================== metrics_wins ====================

create table if not exists public.metrics_wins (
  id            uuid        primary key default gen_random_uuid(),
  activity_week text        not null default '',
  date_added    text        not null default '',
  rep_name      text        not null default '',
  name          text        not null default '',
  gtmx_team     text        not null default '',
  source        text        not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.metrics_wins enable row level security;
create policy "metrics_wins_select" on public.metrics_wins for select using (true);
create policy "metrics_wins_insert" on public.metrics_wins for insert with check (true);
create policy "metrics_wins_update" on public.metrics_wins for update using (true);
create policy "metrics_wins_delete" on public.metrics_wins for delete using (true);

-- ==================== metrics_feedback ====================

create table if not exists public.metrics_feedback (
  id                 uuid        primary key default gen_random_uuid(),
  activity_week      text        not null default '',
  date_added         text        not null default '',
  rep_name           text        not null default '',
  source             text        not null default '',
  feedback_completed integer     not null default 0,
  chorus_comments    text        not null default '',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table public.metrics_feedback enable row level security;
create policy "metrics_feedback_select" on public.metrics_feedback for select using (true);
create policy "metrics_feedback_insert" on public.metrics_feedback for insert with check (true);
create policy "metrics_feedback_update" on public.metrics_feedback for update using (true);
create policy "metrics_feedback_delete" on public.metrics_feedback for delete using (true);

-- ==================== updated_at triggers ====================

create trigger trg_metrics_tam_updated_at              before update on public.metrics_tam              for each row execute function public.set_updated_at();
create trigger trg_metrics_touched_accounts_updated_at before update on public.metrics_touched_accounts for each row execute function public.set_updated_at();
create trigger trg_metrics_demos_updated_at            before update on public.metrics_demos            for each row execute function public.set_updated_at();
create trigger trg_metrics_ops_updated_at              before update on public.metrics_ops              for each row execute function public.set_updated_at();
create trigger trg_metrics_wins_updated_at             before update on public.metrics_wins             for each row execute function public.set_updated_at();
create trigger trg_metrics_feedback_updated_at         before update on public.metrics_feedback         for each row execute function public.set_updated_at();

-- ==================== comments ====================

comment on table public.metrics_tam              is 'TAM (Total Addressable Market) per rep from external sources';
comment on table public.metrics_touched_accounts is 'Touched accounts with touch rate per rep';
comment on table public.metrics_demos            is 'Demo counts per rep per activity week';
comment on table public.metrics_ops              is 'Opportunity records with close week and win status';
comment on table public.metrics_wins             is 'Win records per rep per activity week';
comment on table public.metrics_feedback         is 'Feedback completion and chorus comments per rep';

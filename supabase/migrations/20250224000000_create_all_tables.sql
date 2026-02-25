-- ============================================================
-- GTMx Commercialization — full schema
-- Migrates all localStorage state into Supabase tables.
-- ============================================================

-- ==================== SETTINGS ====================

-- teams
create table if not exists public.teams (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null,
  owner      text        not null default '',
  lead_rep   text        not null default '',
  sort_order integer     not null default 0,
  is_active  boolean     not null default true,
  start_date date,
  end_date   date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.teams enable row level security;
create policy "teams_select" on public.teams for select using (true);
create policy "teams_insert" on public.teams for insert with check (true);
create policy "teams_update" on public.teams for update using (true);
create policy "teams_delete" on public.teams for delete using (true);

-- members
create table if not exists public.members (
  id           uuid        primary key default gen_random_uuid(),
  team_id      uuid        references public.teams(id) on delete set null,
  name         text        not null,
  goal         integer     not null default 30,
  ducks_earned integer     not null default 0,
  is_active    boolean     not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index idx_members_team on public.members(team_id);

alter table public.members enable row level security;
create policy "members_select" on public.members for select using (true);
create policy "members_insert" on public.members for insert with check (true);
create policy "members_update" on public.members for update using (true);
create policy "members_delete" on public.members for delete using (true);

-- ==================== MANAGER INPUTS ====================

-- test_phases
create table if not exists public.test_phases (
  id         uuid        primary key default gen_random_uuid(),
  month      text        not null,
  label      text        not null,
  progress   integer     not null default 0,
  sort_order integer     not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.test_phases enable row level security;
create policy "test_phases_select" on public.test_phases for select using (true);
create policy "test_phases_insert" on public.test_phases for insert with check (true);
create policy "test_phases_update" on public.test_phases for update using (true);
create policy "test_phases_delete" on public.test_phases for delete using (true);

-- mission (single-row)
create table if not exists public.mission (
  id         uuid        primary key default gen_random_uuid(),
  content    text        not null default '',
  submitted  boolean     not null default false,
  updated_at timestamptz not null default now()
);

alter table public.mission enable row level security;
create policy "mission_select" on public.mission for select using (true);
create policy "mission_insert" on public.mission for insert with check (true);
create policy "mission_update" on public.mission for update using (true);

-- seed the single row
insert into public.mission (content, submitted) values ('', false);

-- tam_config (single-row)
create table if not exists public.tam_config (
  id         uuid        primary key default gen_random_uuid(),
  total_tam  integer     not null default 0,
  submitted  boolean     not null default false,
  updated_at timestamptz not null default now()
);

alter table public.tam_config enable row level security;
create policy "tam_config_select" on public.tam_config for select using (true);
create policy "tam_config_insert" on public.tam_config for insert with check (true);
create policy "tam_config_update" on public.tam_config for update using (true);

-- seed the single row
insert into public.tam_config (total_tam, submitted) values (0, false);

-- custom_roles
create table if not exists public.custom_roles (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null unique,
  created_at timestamptz not null default now()
);

alter table public.custom_roles enable row level security;
create policy "custom_roles_select" on public.custom_roles for select using (true);
create policy "custom_roles_insert" on public.custom_roles for insert with check (true);
create policy "custom_roles_delete" on public.custom_roles for delete using (true);

-- ==================== PLAYER'S SECTION ====================

-- weekly_funnels
create table if not exists public.weekly_funnels (
  id           uuid        primary key default gen_random_uuid(),
  member_id    uuid        not null references public.members(id) on delete cascade,
  week_key     text        not null,
  role         text,
  tam          integer     not null default 0,
  calls        integer     not null default 0,
  connects     integer     not null default 0,
  demos        integer     not null default 0,
  wins         integer     not null default 0,
  submitted    boolean     not null default false,
  submitted_at timestamptz,
  unique(member_id, week_key)
);

create index idx_weekly_funnels_member on public.weekly_funnels(member_id);
create index idx_weekly_funnels_week   on public.weekly_funnels(week_key);

alter table public.weekly_funnels enable row level security;
create policy "weekly_funnels_select" on public.weekly_funnels for select using (true);
create policy "weekly_funnels_insert" on public.weekly_funnels for insert with check (true);
create policy "weekly_funnels_update" on public.weekly_funnels for update using (true);
create policy "weekly_funnels_delete" on public.weekly_funnels for delete using (true);

-- win_entries
create table if not exists public.win_entries (
  id         uuid        primary key default gen_random_uuid(),
  member_id  uuid        not null references public.members(id) on delete cascade,
  restaurant text        not null,
  story      text,
  date       date        not null default current_date,
  created_at timestamptz not null default now()
);

create index idx_win_entries_member on public.win_entries(member_id);

alter table public.win_entries enable row level security;
create policy "win_entries_select" on public.win_entries for select using (true);
create policy "win_entries_insert" on public.win_entries for insert with check (true);
create policy "win_entries_update" on public.win_entries for update using (true);
create policy "win_entries_delete" on public.win_entries for delete using (true);

-- ==================== ACTIVATION / ADOPTION (future) ====================

create table if not exists public.activation_adoption_entries (
  id           uuid        primary key default gen_random_uuid(),
  member_id    uuid        references public.members(id) on delete set null,
  team_id      uuid        references public.teams(id) on delete set null,
  metric_name  text        not null,
  metric_value numeric,
  week_key     text,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.activation_adoption_entries enable row level security;
create policy "aa_select" on public.activation_adoption_entries for select using (true);
create policy "aa_insert" on public.activation_adoption_entries for insert with check (true);
create policy "aa_update" on public.activation_adoption_entries for update using (true);
create policy "aa_delete" on public.activation_adoption_entries for delete using (true);

-- ==================== GTMx IMPACT (future) ====================

create table if not exists public.gtmx_impact_entries (
  id           uuid        primary key default gen_random_uuid(),
  team_id      uuid        references public.teams(id) on delete set null,
  metric_name  text        not null,
  metric_value numeric,
  period       text,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.gtmx_impact_entries enable row level security;
create policy "gi_select" on public.gtmx_impact_entries for select using (true);
create policy "gi_insert" on public.gtmx_impact_entries for insert with check (true);
create policy "gi_update" on public.gtmx_impact_entries for update using (true);
create policy "gi_delete" on public.gtmx_impact_entries for delete using (true);

-- ==================== updated_at trigger ====================

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_teams_updated_at      before update on public.teams      for each row execute function public.set_updated_at();
create trigger trg_members_updated_at    before update on public.members    for each row execute function public.set_updated_at();
create trigger trg_test_phases_updated_at before update on public.test_phases for each row execute function public.set_updated_at();
create trigger trg_mission_updated_at    before update on public.mission    for each row execute function public.set_updated_at();
create trigger trg_tam_config_updated_at before update on public.tam_config for each row execute function public.set_updated_at();
create trigger trg_aa_updated_at         before update on public.activation_adoption_entries for each row execute function public.set_updated_at();
create trigger trg_gi_updated_at         before update on public.gtmx_impact_entries        for each row execute function public.set_updated_at();

-- ==================== comments ====================

comment on table public.teams                       is 'Pilot teams managed in Settings';
comment on table public.members                     is 'Team members (team_id null = unassigned)';
comment on table public.test_phases                 is 'Manager-defined test phases with progress';
comment on table public.mission                     is 'Single-row mission/purpose of the test';
comment on table public.tam_config                  is 'Single-row Total TAM configuration';
comment on table public.custom_roles                is 'User-added weekly roles beyond the 3 defaults';
comment on table public.weekly_funnels              is 'Per-member per-week funnel metrics';
comment on table public.win_entries                 is 'Individual win records per member';
comment on table public.activation_adoption_entries is 'Future: activation/adoption metrics';
comment on table public.gtmx_impact_entries         is 'Future: GTMx impact metrics';

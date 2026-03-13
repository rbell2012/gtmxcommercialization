-- Sales teams reference table
create table metrics_sales_teams (
  id uuid primary key default gen_random_uuid(),
  manager_name text not null,
  manager_title text not null default '',
  location_reference text not null default '',
  team_size integer not null default 0,
  avg_monthly_wins numeric not null default 0,
  team_members text not null default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Projected bookings and per-project forecasts
create table metrics_projected_bookings (
  id uuid primary key default gen_random_uuid(),
  month text not null,
  team_id uuid references teams(id),
  projected_bookings integer,
  new_business_attach integer,
  growth_wins integer,
  created_at timestamptz default now(),
  unique(month, team_id)
);

-- Join table: project <-> sales team assignments
create table project_team_assignments (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id),
  sales_team_id uuid not null references metrics_sales_teams(id),
  created_at timestamptz default now(),
  unique(team_id, sales_team_id)
);

alter table metrics_sales_teams enable row level security;
create policy "Allow all on metrics_sales_teams" on metrics_sales_teams for all using (true) with check (true);

alter table metrics_projected_bookings enable row level security;
create policy "Allow all on metrics_projected_bookings" on metrics_projected_bookings for all using (true) with check (true);

alter table project_team_assignments enable row level security;
create policy "Allow all on project_team_assignments" on project_team_assignments for all using (true) with check (true);

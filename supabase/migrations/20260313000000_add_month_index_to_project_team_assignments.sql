-- Make pilot-region assignments per test-phase instead of global per project.
alter table project_team_assignments
  add column month_index integer not null default 0;

-- Drop the old global unique constraint and replace with a per-phase one.
alter table project_team_assignments
  drop constraint if exists project_team_assignments_team_id_sales_team_id_key;

alter table project_team_assignments
  add constraint project_team_assignments_team_sales_month_unique
  unique (team_id, sales_team_id, month_index);

alter table public.metrics_sales_teams
  add column if not exists department_name text;

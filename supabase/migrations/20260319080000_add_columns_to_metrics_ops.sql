-- Add created_date and account_name to metrics_ops

alter table public.metrics_ops add column if not exists created_date date;
alter table public.metrics_ops add column if not exists account_name text;

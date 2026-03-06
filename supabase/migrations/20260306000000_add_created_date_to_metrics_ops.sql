-- Add created_date column to metrics_ops
alter table public.metrics_ops add column if not exists created_date date;

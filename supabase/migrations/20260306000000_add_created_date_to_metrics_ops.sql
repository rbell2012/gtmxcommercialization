-- Add op_created_date column to metrics_ops
alter table public.metrics_ops add column if not exists op_created_date date;

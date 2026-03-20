-- Add created_date column to metrics_wins

alter table public.metrics_wins add column if not exists created_date date;

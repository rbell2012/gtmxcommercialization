-- Add line_items column to metrics_ops and metrics_wins

alter table public.metrics_ops  add column if not exists line_items text;
alter table public.metrics_wins add column if not exists line_items text;

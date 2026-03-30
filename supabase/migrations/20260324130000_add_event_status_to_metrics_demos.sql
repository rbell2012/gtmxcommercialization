alter table public.metrics_demos
  add column if not exists event_status text;

comment on column public.metrics_demos.event_status is 'Pipeline/source-specific status for the demo event (e.g. completed vs scheduled); optional.';

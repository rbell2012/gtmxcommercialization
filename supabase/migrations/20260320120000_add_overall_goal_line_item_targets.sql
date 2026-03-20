-- JSON array of line item product names to aggregate from metrics_ops.line_items (pilot regions view).
alter table public.teams
  add column if not exists overall_goal_line_item_targets text;

comment on column public.teams.overall_goal_line_item_targets is
  'JSON string array of exact line item names to sum from metrics_ops.line_items when showing pilot regions.';

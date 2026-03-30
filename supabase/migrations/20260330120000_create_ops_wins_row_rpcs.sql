-- Bulk row RPCs for metrics_ops and metrics_wins.
-- Mirrors existing get_*_rows RPC pattern so we can pass large rep lists in POST body.

create or replace function get_ops_rows(rep_names text[] default null)
returns table (
  id text,
  rep_name text,
  op_date date,
  op_created_date date,
  opportunity_name text,
  opportunity_stage text,
  win_stage_date date,
  opportunity_type text,
  opportunity_software_mrr numeric,
  account_prospecting_notes text,
  line_items text
) language sql stable as $$
  select
    o.id::text,
    o.rep_name,
    o.op_date,
    o.op_created_date,
    o.opportunity_name,
    o.opportunity_stage,
    o.win_stage_date,
    o.opportunity_type,
    o.opportunity_software_mrr,
    o.account_prospecting_notes,
    o.line_items
  from metrics_ops o
  where rep_names is null
    or array_length(rep_names, 1) is null
    or lower(o.rep_name) = any (select lower(x) from unnest(rep_names) as x);
$$;

create or replace function get_wins_rows(rep_names text[] default null)
returns table (
  id text,
  rep_name text,
  win_date date,
  account_name text,
  opportunity_name text,
  opportunity_stage text,
  opportunity_type text,
  opportunity_software_mrr numeric,
  account_prospecting_notes text,
  line_items text
) language sql stable as $$
  select
    w.id::text,
    w.rep_name,
    w.win_date,
    w.account_name,
    w.opportunity_name,
    w.opportunity_stage,
    w.opportunity_type,
    w.opportunity_software_mrr,
    w.account_prospecting_notes,
    w.line_items
  from metrics_wins w
  where rep_names is null
    or array_length(rep_names, 1) is null
    or lower(w.rep_name) = any (select lower(x) from unnest(rep_names) as x);
$$;

grant execute on function get_ops_rows(text[]) to anon, authenticated;
grant execute on function get_wins_rows(text[]) to anon, authenticated;

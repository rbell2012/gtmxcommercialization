-- Bulk metric row RPCs used by TeamsContext loadMetrics.
-- These bypass PostgREST max_rows truncation and allow rep filtering.

create or replace function get_activity_rows(rep_names text[] default null)
returns table (
  rep_name text,
  activity_date date,
  salesforce_accountid text
) language sql stable as $$
  select a.rep_name, a.activity_date, a.salesforce_accountid
  from metrics_activity a
  where rep_names is null
    or array_length(rep_names, 1) is null
    or lower(a.rep_name) = any (select lower(x) from unnest(rep_names) as x);
$$;

create or replace function get_call_rows(rep_names text[] default null)
returns table (
  rep_name text,
  call_date date,
  salesforce_accountid text
) language sql stable as $$
  select c.rep_name, c.call_date, c.salesforce_accountid
  from metrics_calls c
  where rep_names is null
    or array_length(rep_names, 1) is null
    or lower(c.rep_name) = any (select lower(x) from unnest(rep_names) as x);
$$;

create or replace function get_connect_rows(rep_names text[] default null)
returns table (
  rep_name text,
  connect_date date,
  salesforce_accountid text
) language sql stable as $$
  select c.rep_name, c.connect_date, c.salesforce_accountid
  from metrics_connects c
  where rep_names is null
    or array_length(rep_names, 1) is null
    or lower(c.rep_name) = any (select lower(x) from unnest(rep_names) as x);
$$;

create or replace function get_demo_rows(rep_names text[] default null)
returns table (
  rep_name text,
  demo_date date,
  account_name text,
  event_status text
) language sql stable as $$
  select d.rep_name, d.demo_date, d.account_name, d.event_status
  from metrics_demos d
  where rep_names is null
    or array_length(rep_names, 1) is null
    or lower(d.rep_name) = any (select lower(x) from unnest(rep_names) as x);
$$;

create or replace function get_superhex_rows(rep_names text[] default null)
returns table (
  rep_name text,
  salesforce_accountid text,
  account_name text,
  prospecting_notes text,
  total_activities integer,
  first_activity_date date,
  first_call_date date,
  first_connect_date date,
  first_demo_date date,
  last_activity_date date
) language sql stable as $$
  select
    s.rep_name,
    s.salesforce_accountid,
    s.account_name,
    s.prospecting_notes,
    s.total_activities,
    s.first_activity_date,
    s.first_call_date,
    s.first_connect_date,
    s.first_demo_date,
    s.last_activity_date
  from superhex s
  where rep_names is null
    or array_length(rep_names, 1) is null
    or lower(s.rep_name) = any (select lower(x) from unnest(rep_names) as x);
$$;

grant execute on function get_activity_rows(text[]) to anon, authenticated;
grant execute on function get_call_rows(text[]) to anon, authenticated;
grant execute on function get_connect_rows(text[]) to anon, authenticated;
grant execute on function get_demo_rows(text[]) to anon, authenticated;
grant execute on function get_superhex_rows(text[]) to anon, authenticated;

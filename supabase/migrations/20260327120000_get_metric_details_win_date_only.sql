-- Align get_metric_details wins month attribution with app logic: use
-- metrics_wins.win_date only. metrics_ops.win_stage_date can move in bulk
-- (e.g. SFDC stage sync) and inflate the wrong calendar month.

create or replace function get_metric_details(rep_names text[] default null)
returns table (
  metric_type text,
  rep_name text,
  month_key text,
  name_value text,
  win_type text,
  cnt bigint
) language sql stable as $$
  with filtered_ops as (
    select o.*
    from metrics_ops o
    where o.op_created_date is not null
      and (
        rep_names is null
        or array_length(rep_names, 1) is null
        or lower(o.rep_name) = any (
          select lower(x) from unnest(rep_names) as x
        )
      )
  ),
  filtered_wins as (
    select
      w.*,
      w.win_date as effective_date
    from metrics_wins w
    where w.win_date is not null
      and (
        rep_names is null
        or array_length(rep_names, 1) is null
        or lower(w.rep_name) = any (
          select lower(x) from unnest(rep_names) as x
        )
      )
      and (
        (w.opportunity_stage is null and w.opportunity_type is null)
        or (
          w.opportunity_stage is not null
          and substring(w.opportunity_stage from '^\d+') is not null
          and (
            case
              when w.opportunity_type = 'Existing Business (Upsell)'
                then cast(substring(w.opportunity_stage from '^\d+') as integer) >= 14
              else cast(substring(w.opportunity_stage from '^\d+') as integer) >= 16
            end
          )
        )
      )
  )
  select
    'ops'::text as metric_type,
    o.rep_name,
    to_char(o.op_created_date, 'YYYY-MM') as month_key,
    o.opportunity_name as name_value,
    case
      when coalesce(o.opportunity_type, '') = '' or o.opportunity_type = 'Existing Business (Upsell)' then 'growth'
      else 'nb'
    end as win_type,
    count(*) as cnt
  from filtered_ops o
  where o.opportunity_name is not null and o.opportunity_name <> ''
  group by o.rep_name, to_char(o.op_created_date, 'YYYY-MM'), o.opportunity_name,
    case
      when coalesce(o.opportunity_type, '') = '' or o.opportunity_type = 'Existing Business (Upsell)' then 'growth'
      else 'nb'
    end

  union all

  select
    'demos'::text as metric_type,
    d.rep_name,
    to_char(d.demo_date, 'YYYY-MM') as month_key,
    d.account_name as name_value,
    null::text as win_type,
    count(*) as cnt
  from metrics_demos d
  where d.demo_date is not null
    and d.account_name is not null
    and d.account_name <> ''
    and (
      rep_names is null
      or array_length(rep_names, 1) is null
      or lower(d.rep_name) = any (
        select lower(x) from unnest(rep_names) as x
      )
    )
    and lower(coalesce(d.event_status, '')) = 'completed'
  group by d.rep_name, to_char(d.demo_date, 'YYYY-MM'), d.account_name

  union all

  select
    'wins'::text as metric_type,
    w.rep_name,
    to_char(w.effective_date, 'YYYY-MM') as month_key,
    coalesce(w.account_name, w.opportunity_name) as name_value,
    case
      when coalesce(w.opportunity_type, '') = '' or w.opportunity_type = 'Existing Business (Upsell)' then 'growth'
      else 'nb'
    end as win_type,
    count(*) as cnt
  from filtered_wins w
  where w.effective_date is not null
    and coalesce(w.account_name, w.opportunity_name) is not null
    and coalesce(w.account_name, w.opportunity_name) <> ''
  group by w.rep_name, to_char(w.effective_date, 'YYYY-MM'), coalesce(w.account_name, w.opportunity_name),
    case
      when coalesce(w.opportunity_type, '') = '' or w.opportunity_type = 'Existing Business (Upsell)' then 'growth'
      else 'nb'
    end
$$;

grant execute on function get_metric_details(text[]) to anon, authenticated;

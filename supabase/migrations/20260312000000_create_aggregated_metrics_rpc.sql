-- Pre-aggregate event metrics for efficient client-side loading.
-- Returns day-level counts per rep for each metric type, plus account/opportunity
-- names for ops/demos/wins.  Wins are filtered by stage qualification
-- (isWinStage logic) and use effective dating via metrics_ops.win_stage_date.

create or replace function get_aggregated_metrics()
returns table (
  metric_type text,
  rep_name    text,
  date_value  date,
  cnt         bigint,
  acct_name   text
) language sql stable as $$

  -- activity
  select 'activity'::text, a.rep_name, a.activity_date, count(*), null::text
  from metrics_activity a
  where a.activity_date is not null
  group by a.rep_name, a.activity_date

  union all

  -- calls
  select 'calls'::text, c.rep_name, c.call_date, count(*), null::text
  from metrics_calls c
  where c.call_date is not null
  group by c.rep_name, c.call_date

  union all

  -- connects
  select 'connects'::text, c.rep_name, c.connect_date, count(*), null::text
  from metrics_connects c
  where c.connect_date is not null
  group by c.rep_name, c.connect_date

  union all

  -- demos (include account_name for metricAccountNames)
  select 'demos'::text, d.rep_name, d.demo_date, count(*), d.account_name
  from metrics_demos d
  where d.demo_date is not null
  group by d.rep_name, d.demo_date, d.account_name

  union all

  -- ops (include opportunity_name for metricAccountNames; use op_created_date)
  select 'ops'::text, o.rep_name, o.op_created_date, count(*), o.opportunity_name
  from metrics_ops o
  where o.op_created_date is not null
  group by o.rep_name, o.op_created_date, o.opportunity_name

  union all

  -- wins: filtered by isWinStage logic, effective-dated via ops.win_stage_date.
  -- Uses substring(... from '^\d+') to safely extract the leading integer from
  -- stage values like "16. Closed - Onboarded".  Non-numeric stages (e.g.
  -- "Closed Won") are excluded since parseInt in JS returns NaN → not a win.
  select 'wins'::text, w.rep_name,
    coalesce(o.win_stage_date, w.win_date) as date_value,
    count(*), w.account_name
  from metrics_wins w
  left join metrics_ops o on o.id = w.id
  where w.win_date is not null
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
  group by w.rep_name, coalesce(o.win_stage_date, w.win_date), w.account_name

  union all

  -- feedback
  select 'feedback'::text, f.rep_name, f.feedback_date, count(*), null::text
  from metrics_feedback f
  where f.feedback_date is not null
  group by f.rep_name, f.feedback_date

$$;

grant execute on function get_aggregated_metrics() to anon, authenticated;

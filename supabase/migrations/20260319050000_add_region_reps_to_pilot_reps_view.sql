create or replace view public.pilot_reps_this_month as

-- region reps only (from metrics_sales_teams via project_team_assignments)
select
  null::uuid     as member_id,
  trim(rep_name) as member_name,
  null           as level,
  t.id           as team_id,
  t.name         as team_name,
  t.start_date   as team_start_date,
  t.end_date     as team_end_date,
  'region_rep'   as rep_source
from public.teams t
join public.project_team_assignments pta on pta.team_id = t.id
join public.metrics_sales_teams st       on st.id = pta.sales_team_id
cross join lateral unnest(string_to_array(st.team_members, ',')) as rep_name
where
  t.is_active = true
  and t.archived_at is null
  and (t.start_date is null or t.start_date <= date_trunc('month', current_date) + interval '1 month - 1 day')
  and (t.end_date   is null or t.end_date   >= date_trunc('month', current_date))
  -- match current test phase
  and pta.month_index = (
    (date_part('year', current_date)::int  * 12 + date_part('month', current_date)::int)
  - (date_part('year', t.start_date)::int * 12 + date_part('month', t.start_date)::int)
  )
  -- remove excluded reps
  and (
    pta.excluded_members is null
    or trim(rep_name) != all(
      array(select trim(e) from unnest(string_to_array(pta.excluded_members, ',')) as e)
    )
  )
  and trim(rep_name) != '';

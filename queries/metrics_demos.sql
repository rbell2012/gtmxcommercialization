-- Snowflake export for /public/data/metrics_demos.json
-- Source: gtmx_dashboard.ipynb cells 10 + 11 + 12 + 24.
-- all_reps_in_tests source precedence:
--   1) ALL_REPS_IN_TESTS_TMP (session temp table created by snowflake_sync.py bridge)
--   2) TOAST.SOURCE_MANUAL.ALL_REPS_IN_TESTS (Google Sheet-loaded)

WITH all_reps_in_tests AS (
    SELECT member_name, team_name, team_start_date, team_end_date
    FROM ALL_REPS_IN_TESTS_TMP
    UNION ALL
    SELECT
        member_name,
        team_name,
        CAST(team_start_date AS DATE) AS team_start_date,
        CAST(team_end_date AS DATE) AS team_end_date
    FROM TOAST.SOURCE_MANUAL.ALL_REPS_IN_TESTS
),
activity_users AS (
    SELECT DISTINCT
        employee.salesforce_userid,
        employee.full_name
    FROM TOAST.ANALYTICS_CORE.EMPLOYEE_CURRENT AS employee
    WHERE manager_employee_id = '108763'
),
target_accounts AS (
    SELECT
        account_id,
        salesforce_accountid,
        customer_name
    FROM TOAST.ANALYTICS_CORE.ACCOUNT
),
demo_events_raw AS (
    SELECT
        event.account_id
        , event.event_owner_userid AS owner_id
        , CAST(event.activity_date AS DATE) AS demo_date
        , 'GTM.EVENT' AS demo_source
        , event.subject
        , event.event_status
    FROM TOAST.GTM.EVENT AS event
    WHERE event.is_canceled = FALSE
      AND event.is_no_show = FALSE
      AND event.subject NOT ILIKE '%Booked%'
      AND event.subject NOT ILIKE '%Chorus%'
      AND event.subject NOT ILIKE '%Auto Created based on Stage%'
      AND event.event_status NOT ILIKE '%No show%'
      AND event.event_status NOT ILIKE '%Cancelled%'
      AND event.event_status NOT ILIKE '%Scheduled%'
      AND (
          event.subject ILIKE '%Guest Pro%'
          OR event.subject ILIKE '%Demo%'
          OR event.subject ILIKE '%Boost%'
          OR event.subject ILIKE '%Offers%'
          OR event.subject ILIKE '%Marketing Test%'
      )

    UNION ALL

    SELECT
        task.salesforce_accountid AS account_id
        , task.task_ownerid AS owner_id
        , CAST(COALESCE(task.completed_date, task.created_date) AS DATE) AS demo_date
        , 'TASK_ACTIVITY' AS demo_source
        , task.subject
        , task.status AS event_status
    FROM TOAST.ANALYTICS_CORE.TASK_ACTIVITY AS task
    WHERE task.subject ILIKE '%demo%'
      AND task.subject NOT ILIKE '%schedule%'
      AND task.subject NOT ILIKE '%Chorus%'
      AND task.subject NOT ILIKE '%Email:%'
      AND task.subject NOT ILIKE 'Reply:%'
      AND task.status ILIKE '%completed%'
      AND task.type ILIKE '%call%'

    UNION ALL

    SELECT
        task.salesforce_accountid AS account_id
        , task.task_ownerid AS owner_id
        , CAST(COALESCE(task.completed_date, task.created_date) AS DATE) AS demo_date
        , 'TASK_ACTIVITY' AS demo_source
        , task.subject
        , task.status AS event_status
    FROM TOAST.ANALYTICS_CORE.TASK_ACTIVITY AS task
    WHERE task.subject ILIKE '%marketing test%'
      AND task.subject NOT ILIKE '%schedule%'
      AND task.status ILIKE '%completed%'
      AND task.type ILIKE '%call%'
),
all_gtmx_demos AS (
    SELECT DISTINCT
        MD5(CONCAT_WS('|', target_accounts.salesforce_accountid, demo_events_raw.demo_date, activity_users.full_name)) AS id
        , demo_events_raw.demo_date
        , demo_events_raw.demo_source
        , target_accounts.salesforce_accountid
        , activity_users.full_name AS rep_name
        , target_accounts.customer_name AS account_name
        , demo_events_raw.subject
        , demo_events_raw.event_status
    FROM demo_events_raw
    INNER JOIN activity_users
        ON demo_events_raw.owner_id = activity_users.salesforce_userid
    INNER JOIN target_accounts
        ON demo_events_raw.account_id = target_accounts.salesforce_accountid
    WHERE demo_events_raw.demo_date >= '2025-07-01'::DATE
),
all_demos_broad AS (
    SELECT DISTINCT
        event.account_id AS account_id
        , event.event_owner_userid AS owner_id
        , emp.full_name AS rep_name
        , CAST(event.activity_date AS DATE) AS demo_date
        , 'GTM.EVENT' AS demo_source
        , event.subject
        , event.event_status
        , acct.salesforce_accountid
        , acct.customer_name AS account_name
    FROM TOAST.GTM.EVENT AS event
    LEFT JOIN TOAST.ANALYTICS_CORE.EMPLOYEE_CURRENT AS emp
        ON event.event_owner_userid = emp.salesforce_userid
    LEFT JOIN TOAST.ANALYTICS_CORE.ACCOUNT AS acct
        ON event.account_id = acct.salesforce_accountid
    WHERE event.is_canceled = FALSE
      AND event.is_no_show = FALSE
      AND event.subject NOT ILIKE '%Booked%'
      AND event.subject NOT ILIKE '%Chorus%'
      AND event.subject NOT ILIKE '%Auto Created based on Stage%'
      AND event.event_status NOT ILIKE '%No show%'
      AND event.event_status NOT ILIKE '%Cancelled%'
      AND event.event_status NOT ILIKE '%Scheduled%'
      AND (
          event.subject ILIKE '%Guest Pro%'
          OR event.subject ILIKE '%Demo%'
          OR event.subject ILIKE '%Boost%'
          OR event.subject ILIKE '%Offers%'
          OR event.subject ILIKE '%Marketing Test%'
      )
      AND CAST(event.activity_date AS DATE) >= DATE '2025-07-01'

    UNION ALL

    SELECT DISTINCT
        task.salesforce_accountid AS account_id
        , task.task_ownerid AS owner_id
        , emp.full_name AS rep_name
        , CAST(COALESCE(task.completed_date, task.created_date) AS DATE) AS demo_date
        , 'TASK_ACTIVITY' AS demo_source
        , task.subject
        , task.status AS event_status
        , acct.salesforce_accountid
        , acct.customer_name AS account_name
    FROM TOAST.ANALYTICS_CORE.TASK_ACTIVITY AS task
    LEFT JOIN TOAST.ANALYTICS_CORE.EMPLOYEE_CURRENT AS emp
        ON task.task_ownerid = emp.salesforce_userid
    LEFT JOIN TOAST.ANALYTICS_CORE.ACCOUNT AS acct
        ON task.salesforce_accountid = acct.salesforce_accountid
    WHERE task.subject ILIKE '%demo%'
      AND task.subject NOT ILIKE '%schedule%'
      AND task.subject NOT ILIKE '%Chorus%'
      AND task.subject NOT ILIKE '%Email:%'
      AND task.subject NOT ILIKE 'Reply:%'
      AND task.status ILIKE '%completed%'
      AND task.type ILIKE '%call%'
      AND CAST(COALESCE(task.completed_date, task.created_date) AS DATE) >= DATE '2025-07-01'
),
demos_from_pilot_test_reps AS (
    SELECT DISTINCT
        MD5(CONCAT_WS('|', demos.salesforce_accountid, demos.demo_date, demos.rep_name)) AS id
        , demos.demo_date
        , demos.demo_source
        , demos.salesforce_accountid
        , demos.rep_name
        , demos.account_name
        , demos.subject
        , demos.event_status
    FROM all_demos_broad AS demos
    INNER JOIN all_reps_in_tests AS reps
        ON demos.rep_name = reps.member_name
    WHERE demos.demo_date >= reps.team_start_date
      AND demos.demo_date <= reps.team_end_date
)
SELECT *
FROM (
    SELECT * FROM all_gtmx_demos
    UNION ALL
    SELECT * FROM demos_from_pilot_test_reps
) demos_rows
QUALIFY ROW_NUMBER() OVER (
    PARTITION BY demos_rows.id
    ORDER BY demos_rows.demo_date DESC
) = 1
ORDER BY demos_rows.demo_date DESC;

-- Snowflake export for /public/data/superhex.json
-- Assembled from gtmx_dashboard.ipynb: cells 9, 10, 13 (all_gtmx_ops), 17 (all_wins, not 27+mad_max),
-- 21–23, 25, 29. feedback_latest / all_gtmx_feedback (cell 28) omitted — feedback columns NULL until Sheets path is replaced.
--
WITH
account_prospecting_notes AS (
    SELECT
        salesforce_accountid,
        account_prospecting_notes
    FROM TOAST.ANALYTICS_CORE.ACCOUNT
    WHERE
        account_prospecting_notes IS NOT NULL
        AND account_prospecting_notes != ''
)
,
all_ops AS (
-----------------------------------------------------------------------
    -- clause 1: op name contains #GTMX
    SELECT
        MD5(o.salesforce_opportunityid) AS id
        , o.opportunity_close_date AS op_date
        , o.opportunity_name
        , o.opportunity_stage
        , o.salesforce_accountid
        , acct.account_name
        , opp_owner.full_name AS rep_name
        , CASE
            WHEN opp_owner.manager_employee_id ILIKE '108763'
                THEN TRUE
            ELSE FALSE
          END AS gtmx_team
        , acct.account_prospecting_notes
        , o.opportunity_type
        , o.opportunity_created_date
    FROM TOAST.GTM.OPPORTUNITY AS o
    LEFT JOIN TOAST.ANALYTICS_CORE.EMPLOYEE_CURRENT AS opp_owner
        ON o.salesforce_opportunityownerid
            = opp_owner.salesforce_userid
    LEFT JOIN TOAST.ANALYTICS_CORE.CUSTOMER AS acct
        ON o.salesforce_accountid = acct.salesforce_accountid
    WHERE COALESCE(o.opportunity_name, '') ILIKE '%#GTMX%'
      AND COALESCE(o.opportunity_name, '') NOT ILIKE '%downsell%'
      AND o.opportunity_created_date >= DATE '2025-07-01'
      AND o.opportunity_software_mrr >= 0

    UNION ALL
-----------------------------------------------------------------------
    -- clause 2: op name contains #Guestpro
    SELECT
        MD5(o.salesforce_opportunityid) AS id
        , o.opportunity_close_date AS op_date
        , o.opportunity_name
        , o.opportunity_stage
        , o.salesforce_accountid
        , acct.account_name
        , opp_owner.full_name AS rep_name
        , CASE
            WHEN opp_owner.manager_employee_id ILIKE '108763'
                THEN TRUE
            ELSE FALSE
          END AS gtmx_team
        , acct.account_prospecting_notes
        , o.opportunity_type
        , o.opportunity_created_date
    FROM TOAST.GTM.OPPORTUNITY AS o
    LEFT JOIN TOAST.ANALYTICS_CORE.EMPLOYEE_CURRENT AS opp_owner
        ON o.salesforce_opportunityownerid
            = opp_owner.salesforce_userid
    LEFT JOIN TOAST.ANALYTICS_CORE.CUSTOMER AS acct
        ON o.salesforce_accountid = acct.salesforce_accountid
    WHERE COALESCE(o.opportunity_name, '') ILIKE '%#Guestpro%'
      AND COALESCE(o.opportunity_name, '') NOT ILIKE '%downsell%'
      AND o.opportunity_created_date >= DATE '2025-07-01'
      AND o.opportunity_software_mrr >= 0

    UNION ALL
-----------------------------------------------------------------------
    -- clause 3: owner on Bridget's team (108763)
    SELECT
        MD5(o.salesforce_opportunityid) AS id
        , o.opportunity_close_date AS op_date
        , o.opportunity_name
        , o.opportunity_stage
        , o.salesforce_accountid
        , acct.account_name
        , opp_owner.full_name AS rep_name
        , TRUE AS gtmx_team
        , acct.account_prospecting_notes
        , o.opportunity_type
        , o.opportunity_created_date
    FROM TOAST.GTM.OPPORTUNITY AS o
    INNER JOIN TOAST.ANALYTICS_CORE.EMPLOYEE_CURRENT AS opp_owner
        ON o.salesforce_opportunityownerid
            = opp_owner.salesforce_userid
    LEFT JOIN TOAST.ANALYTICS_CORE.CUSTOMER AS acct
        ON o.salesforce_accountid = acct.salesforce_accountid
    WHERE opp_owner.manager_employee_id ILIKE '108763'
      AND o.opportunity_created_date >= DATE '2025-09-01'
      AND COALESCE(o.opportunity_name, '') NOT ILIKE '%downsell%'
      AND o.opportunity_software_mrr >= 0

    UNION ALL
-----------------------------------------------------------------------
    -- clause 4: sterno prospecting notes contain 2025CateringTest and op owner is on bridget's team
    SELECT
        MD5(o.salesforce_opportunityid) AS id
        , o.opportunity_close_date AS op_date
        , o.opportunity_name
        , o.opportunity_stage
        , o.salesforce_accountid
        , acct.account_name
        , opp_owner.full_name AS rep_name
        , CASE
            WHEN opp_owner.manager_employee_id ILIKE '108763'
                THEN TRUE
            ELSE FALSE
          END AS gtmx_team
        , acct.account_prospecting_notes
        , o.opportunity_type
        , o.opportunity_created_date
    FROM TOAST.GTM.OPPORTUNITY AS o
    INNER JOIN TOAST.ANALYTICS_CORE.EMPLOYEE_CURRENT AS opp_owner
        ON o.salesforce_opportunityownerid
            = opp_owner.salesforce_userid
    INNER JOIN TOAST.ANALYTICS_CORE.CUSTOMER AS acct
        ON o.salesforce_accountid = acct.salesforce_accountid
    WHERE acct.account_prospecting_notes
        ILIKE '%2025CateringTest%'
      AND o.opportunity_close_date
        BETWEEN DATE '2026-02-01' AND DATE '2026-02-28'
      AND o.opportunity_type IN (
        'Existing Business (Upsell)', 'New Business')
      AND opp_owner.full_name IN (
        'Ross Armstrong', 'Morgan Weeks')
),

all_gtmx_ops AS (
    SELECT DISTINCT
        ID AS "id"
        , OP_DATE AS "op_date"
        , OPPORTUNITY_NAME AS "opportunity_name"
        , OPPORTUNITY_STAGE AS "opportunity_stage"
        , SALESFORCE_ACCOUNTID AS "salesforce_accountid"
        , ACCOUNT_NAME AS "account_name"
        , REP_NAME AS "rep_name"
        , GTMX_TEAM AS "gtmx_team"
        , ACCOUNT_PROSPECTING_NOTES AS "account_prospecting_notes"
        , OPPORTUNITY_TYPE AS "opportunity_type"
        , OPPORTUNITY_CREATED_DATE AS "op_created_date"
    FROM all_ops
    WHERE OPPORTUNITY_NAME != 'Amendment for contract #00764124'
)
,
all_reps_in_tests AS (
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
all_ops_broad AS (
    SELECT
        o.SALESFORCE_OPPORTUNITYID AS salesforce_opportunityid
        , o.OPPORTUNITY_CLOSE_DATE AS op_date
        , o.OPPORTUNITY_CREATED_DATE AS op_created_date
        , o.OPPORTUNITY_NAME AS opportunity_name
        , o.OPPORTUNITY_STAGE AS opportunity_stage
        , o.SALESFORCE_ACCOUNTID AS salesforce_accountid
        , opp_owner.FULL_NAME AS rep_name
        , acct.ACCOUNT_NAME AS account_name
        , acct.ACCOUNT_PROSPECTING_NOTES AS account_prospecting_notes
        , o.OPPORTUNITY_TYPE AS opportunity_type
        , o.OPPORTUNITY_ISWON AS opportunity_iswon
        , o.OPPORTUNITY_SOFTWARE_MRR AS opportunity_software_mrr
        , MD5(o.SALESFORCE_OPPORTUNITYID) AS id
    FROM TOAST.GTM.OPPORTUNITY AS o
    LEFT JOIN TOAST.ANALYTICS_CORE.EMPLOYEE_CURRENT AS opp_owner
        ON o.SALESFORCE_OPPORTUNITYOWNERID = opp_owner.SALESFORCE_USERID
    LEFT JOIN TOAST.ANALYTICS_CORE.CUSTOMER AS acct
        ON o.SALESFORCE_ACCOUNTID = acct.SALESFORCE_ACCOUNTID
    WHERE o.OPPORTUNITY_CREATED_DATE >= DATE '2025-07-01'
      AND COALESCE(o.OPPORTUNITY_NAME, '') NOT ILIKE '%downsell%'
      AND o.OPPORTUNITY_SOFTWARE_MRR >= 0
),
opp_line_items AS (
    SELECT
        li.SALESFORCE_OPPORTUNITYID AS salesforce_opportunityid
        , LISTAGG(
            li.PRODUCT_NAME || ' ($' || ROUND(li.TOTAL_PRICE, 2)::VARCHAR || ')',
            ', '
        ) WITHIN GROUP (ORDER BY li.PRODUCT_NAME) AS line_items
    FROM TOAST.GTM.OPPORTUNITY_LINE_ITEM_FACT AS li
    WHERE li.LINEITEM_CREATED_DATE >= DATE '2025-07-01'
    GROUP BY li.SALESFORCE_OPPORTUNITYID
),
all_pilot_rep_ops AS (
    SELECT DISTINCT
        ops.id
        , ops.op_date
        , ops.op_created_date
        , ops.opportunity_name
        , ops.opportunity_stage
        , ops.account_name
        , ops.salesforce_accountid
        , ops.rep_name
        , reps.team_name AS gtmx_team
        , ops.account_prospecting_notes
        , ops.opportunity_type
        , ops.opportunity_software_mrr
        , li.line_items
    FROM all_ops_broad AS ops
    INNER JOIN all_reps_in_tests AS reps
        ON ops.rep_name = reps.member_name
    LEFT JOIN opp_line_items AS li
        ON ops.salesforce_opportunityid = li.salesforce_opportunityid
    WHERE ops.op_created_date >= reps.team_start_date
      AND ops.op_created_date <= reps.team_end_date
),
all_gtmx_and_pilot_ops AS (
    SELECT
        g.id
        , g.op_date
        , g.op_created_date
        , g.opportunity_name
        , g.opportunity_stage
        , g.account_name
        , g.salesforce_accountid
        , g.rep_name
        , CAST(g.gtmx_team AS VARCHAR) AS gtmx_team
        , g.account_prospecting_notes
        , g.opportunity_type
        , b.opportunity_software_mrr
        , li.line_items
        , 2 AS source_priority
    FROM all_gtmx_ops g
    LEFT JOIN all_ops_broad b
        ON g.id = b.id
    LEFT JOIN opp_line_items li
        ON b.salesforce_opportunityid = li.salesforce_opportunityid

    UNION ALL

    SELECT
        id
        , op_date
        , op_created_date
        , opportunity_name
        , opportunity_stage
        , account_name
        , salesforce_accountid
        , rep_name
        , gtmx_team
        , account_prospecting_notes
        , opportunity_type
        , opportunity_software_mrr
        , line_items
        , 1 AS source_priority
    FROM all_pilot_rep_ops
)
,
all_gtmx_activity AS (
SELECT
    salesforce_taskid AS "id"
    , COALESCE(task.completed_date, task.created_date)::DATE
        AS "activity_date"
    , task.salesforce_accountid AS "salesforce_accountid"
    , employee.full_name AS "rep_name"
    , task.type AS "activity_type"
    , task.subject AS "subject"
    , task.status AS "status"
    , task.activity_outcome AS "activity_outcome"
    , 'TASK_ACTIVITY' AS "activity_source"
FROM TOAST.ANALYTICS_CORE.TASK_ACTIVITY AS task
INNER JOIN TOAST.ANALYTICS_CORE.EMPLOYEE_CURRENT AS employee
    ON task.task_ownerid = employee.salesforce_userid
WHERE employee.manager_employee_id = '108763'
  AND COALESCE(task.completed_date, task.created_date)
      >= '2025-07-01'::DATE

UNION ALL

SELECT
    activity_id AS "id"
    , event.activity_date::DATE AS "activity_date"
    , event.account_id AS "salesforce_accountid"
    , employee.full_name AS "rep_name"
    , event.type AS "activity_type"
    , event.subject AS "subject"
    , event.event_status AS "status"
    , NULL AS "activity_outcome"
    , 'GTM.EVENT' AS "activity_source"
FROM TOAST.GTM.EVENT AS event
INNER JOIN TOAST.ANALYTICS_CORE.EMPLOYEE_CURRENT AS employee
    ON event.event_owner_userid = employee.salesforce_userid
WHERE employee.manager_employee_id = '108763'
  AND event.activity_date >= '2025-07-01'::DATE

),
all_gtmx_calls AS (
--- approved with bridget 3/5
SELECT
    id
    , activity_date as call_date
    , salesforce_accountid
    , rep_name
    , activity_type as call_type
    , subject
    , status
    , activity_outcome as call_outcome
    , activity_source as call_source
FROM all_gtmx_activity
WHERE activity_type ILIKE '%Call%'
  AND activity_type NOT ILIKE '%email%'
  AND activity_type NOT ILIKE '%text%'
  AND subject NOT ILIKE '%other%'
  AND subject NOT ILIKE '%chorus%'
),
all_gtmx_connects AS (
SELECT
    id
    , activity_date as connect_date
    , salesforce_accountid
    , rep_name
    , activity_type as connect_type
    , subject
    , status
    , activity_outcome as connect_outcome
    , activity_source as connect_source
FROM all_gtmx_activity
WHERE activity_outcome ILIKE '%Connect%'
    AND activity_outcome NOT ILIKE '%Gatekeeper%'
),
all_gtmx_chorus AS (
SELECT
    MD5(CONCAT_WS('|'
        , REGEXP_SUBSTR(task.comments, 'https://chorus\\.ai/meeting/[A-Za-z0-9]+')
        , employee.full_name)) AS "id"
    , acct.customer_name AS "account_name"
    , task.salesforce_accountid AS "salesforce_accountid"
    , task.comments AS "comments"
    , REGEXP_SUBSTR(task.comments, 'https://chorus\\.ai/meeting/[A-Za-z0-9]+')
        AS "chorus_link"
    , employee.full_name AS "rep_name"
    , COALESCE(task.completed_date, task.created_date)::DATE
        AS "chorus_date"
    ,
    ROW_NUMBER() OVER (
        PARTITION BY task.salesforce_accountid
        ORDER BY COALESCE(task.completed_date, task.created_date) DESC
    ) AS "rn"
FROM TOAST.ANALYTICS_CORE.TASK_ACTIVITY AS task
INNER JOIN TOAST.ANALYTICS_CORE.EMPLOYEE_CURRENT AS employee
    ON task.task_ownerid = employee.salesforce_userid
LEFT JOIN TOAST.ANALYTICS_CORE.ACCOUNT AS acct
    ON task.salesforce_accountid = acct.salesforce_accountid
WHERE
    employee.manager_employee_id = '108763'
    AND task.type ILIKE '%Call%'
    AND task.status ILIKE '%completed%'
    AND task.subject ILIKE '%chorus%'
    AND task.comments IS NOT NULL
    AND task.comments != ''
    AND COALESCE(task.completed_date, task.created_date)::DATE
        > '2025-07-01'::DATE
QUALIFY "rn" = 1
),
all_gtmx_demos AS (
WITH activity_users AS (
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
----------------------------------------------------------------------------
demo_events_raw AS (
-- Simplified: all GTM.EVENT demos matching key subjects
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
----------------------------------------------------------------------------
-- #3 completed call activities where subject CONTAINS demo but not chorus
    SELECT
        task.salesforce_accountid AS account_id
        , task.task_ownerid AS owner_id
        , CAST(COALESCE(task.completed_date, task.created_date) AS DATE)
            AS demo_date
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
----------------------------------------------------------------------------
-- #7 zoe uses an activity: marketing test subject
    SELECT
        task.salesforce_accountid AS account_id
        , task.task_ownerid AS owner_id 
        , CAST(COALESCE(task.completed_date, task.created_date) AS DATE)
            AS demo_date
        , 'TASK_ACTIVITY' AS demo_source
        , task.subject
        , task.status AS event_status
    FROM TOAST.ANALYTICS_CORE.TASK_ACTIVITY AS task
    WHERE task.subject ILIKE '%marketing test%'
      AND task.subject NOT ILIKE '%schedule%'
      AND task.status ILIKE '%completed%'
      AND task.type ILIKE '%call%'

)

SELECT DISTINCT
    MD5(CONCAT_WS('|'
        , target_accounts.salesforce_accountid
        , demo_events_raw.demo_date
        , activity_users.full_name)) AS "id"
    , demo_events_raw.demo_date AS "demo_date"
    , demo_events_raw.demo_source AS "demo_source"
    , target_accounts.salesforce_accountid AS "salesforce_accountid"
    , activity_users.full_name AS "rep_name"
    , target_accounts.customer_name AS "account_name"
    , demo_events_raw.subject AS "subject"
    , demo_events_raw.event_status AS "event_status"
FROM demo_events_raw
INNER JOIN activity_users
    ON demo_events_raw.owner_id
        = activity_users.salesforce_userid
INNER JOIN target_accounts
    ON demo_events_raw.account_id
        = target_accounts.salesforce_accountid
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
      AND event.event_status NOT ILIKE '%Scheuled%'
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
),
all_gtmx_and_pilot_demos AS (
    SELECT * FROM all_gtmx_demos
    UNION ALL
    SELECT * FROM demos_from_pilot_test_reps
),
all_wins AS (
    SELECT
    MD5(o.salesforce_opportunityid) AS "id"
    , o.opportunity_close_date AS "win_date"
    , o.opportunity_name AS "opportunity_name"
    , o.opportunity_stage AS "opportunity_stage"
    , acct.account_name AS "account_name"
    , o.salesforce_accountid AS "salesforce_accountid"
    , opp_owner.full_name AS "rep_name"
    , CASE
        WHEN opp_owner.manager_employee_id ILIKE '108763'
        THEN TRUE
        ELSE FALSE
      END AS "gtmx_team"
    , acct.account_prospecting_notes AS "account_prospecting_notes"
    , o.opportunity_type AS "opportunity_type"
    , o.opportunity_created_date AS "created_date"
    , o.opportunity_software_mrr AS "opportunity_software_mrr"
    , o.salesforce_opportunityid AS "salesforce_opportunityid"
FROM TOAST.GTM.OPPORTUNITY AS o
LEFT JOIN TOAST.ANALYTICS_CORE.EMPLOYEE_CURRENT AS opp_owner
    ON o.salesforce_opportunityownerid = opp_owner.salesforce_userid
LEFT JOIN TOAST.ANALYTICS_CORE.CUSTOMER AS acct
    ON o.salesforce_accountid = acct.salesforce_accountid
WHERE (
    -- won op name contains gtmx
    (
        COALESCE(o.opportunity_name, '') ILIKE '%#GTMX%'
        AND COALESCE(o.opportunity_name, '') NOT ILIKE '%downsell%'
        AND o.opportunity_created_date >= DATE '2025-07-01'
        AND o.opportunity_iswon = TRUE
        AND o.opportunity_stage NOT ILIKE '%Closed - Lost%'
        AND (
            o.opportunity_stage ILIKE '%16%'
            OR o.opportunity_stage ILIKE '%17%'
            OR o.opportunity_stage ILIKE '%18%'
            OR o.opportunity_stage ILIKE '%19%'
            OR o.opportunity_stage ILIKE '%20%'
            OR o.opportunity_stage ILIKE '%Won%'
        )
        AND o.opportunity_software_mrr >= 0
    ) 
    OR
        -- won op name contains guestpro
    (
        COALESCE(o.opportunity_name, '') ILIKE '%#Guestpro%'
        AND COALESCE(o.opportunity_name, '') NOT ILIKE '%downsell%'
        AND o.opportunity_created_date >= DATE '2025-07-01'
        AND o.opportunity_iswon = TRUE
        AND o.opportunity_stage NOT ILIKE '%Closed - Lost%'
        AND o.opportunity_software_mrr >= 0
    )
    -- won op has a owner who's on Bridget Grebenick's (108763) team
    OR (
        opp_owner.manager_employee_id ILIKE '108763'
        AND o.opportunity_created_date >= DATE '2025-09-01'
        AND o.opportunity_iswon = TRUE
        AND o.opportunity_stage NOT ILIKE '%Closed - Lost%'
        AND COALESCE(o.opportunity_name, '') NOT ILIKE '%downsell%'
        AND o.opportunity_software_mrr >= 0
    )
    -- sterno: op prospecting notes contain test metric
    OR (
        acct.account_prospecting_notes ILIKE '%2025CateringTest%'
        AND opp_owner.manager_employee_id ILIKE '108763'
        AND o.opportunity_created_date >= DATE '2025-09-01'
        AND o.opportunity_iswon = TRUE
    )
)
    -- global exclusions
    AND o.opportunity_name != 'Amendment for contract #00764124'
)

, all_accounts AS (
    SELECT DISTINCT salesforce_accountid
    FROM all_gtmx_activity
    WHERE salesforce_accountid IS NOT NULL

    UNION

    SELECT DISTINCT salesforce_accountid
    FROM all_gtmx_chorus
    WHERE salesforce_accountid IS NOT NULL

    UNION

    SELECT DISTINCT salesforce_accountid
    FROM all_gtmx_and_pilot_demos
    WHERE salesforce_accountid IS NOT NULL

    UNION

    SELECT DISTINCT salesforce_accountid
    FROM all_gtmx_and_pilot_ops
    WHERE salesforce_accountid IS NOT NULL

    UNION

    SELECT DISTINCT salesforce_accountid
    FROM all_wins
    WHERE salesforce_accountid IS NOT NULL
)

, account_names AS (
    SELECT
        salesforce_accountid
        , account_name
    FROM (
        SELECT
            salesforce_accountid
            , account_name
            , ROW_NUMBER() OVER (
                PARTITION BY salesforce_accountid
                ORDER BY account_name
            ) AS rn
        FROM (
            SELECT salesforce_accountid, account_name
            FROM all_gtmx_chorus
            UNION ALL
            SELECT salesforce_accountid, account_name
            FROM all_gtmx_and_pilot_demos
            UNION ALL
            SELECT salesforce_accountid, account_name
            FROM all_wins
        )
        WHERE account_name IS NOT NULL
          AND account_name != ''
    )
    WHERE rn = 1
)

, rep_names AS (
    SELECT
        salesforce_accountid
        , rep_name
    FROM (
        SELECT
            salesforce_accountid
            , rep_name
            , ROW_NUMBER() OVER (
                PARTITION BY salesforce_accountid
                ORDER BY activity_date DESC
            ) AS rn
        FROM all_gtmx_activity
    )
    WHERE rn = 1
)

, activity_agg AS (
    SELECT
        salesforce_accountid
        , COUNT(*) AS total_activities
        , MIN(activity_date) AS first_activity_date
        , MAX(activity_date) AS last_activity_date
    FROM all_gtmx_activity
    GROUP BY salesforce_accountid
)

, calls_agg AS (
    SELECT
        salesforce_accountid
        , COUNT(*) AS total_calls
        , MIN(call_date) AS first_call_date
        , MAX(call_date) AS last_call_date
    FROM all_gtmx_calls
    GROUP BY salesforce_accountid
)

, connects_agg AS (
    SELECT
        salesforce_accountid
        , COUNT(*) AS total_connects
        , MIN(connect_date) AS first_connect_date
        , MAX(connect_date) AS last_connect_date
    FROM all_gtmx_connects
    GROUP BY salesforce_accountid
)

, chorus_latest AS (
    SELECT
        salesforce_accountid
        , chorus_link
        , chorus_date
    FROM all_gtmx_chorus
)

, demos_agg AS (
    SELECT
        salesforce_accountid
        , COUNT(*) AS total_demos
        , MIN(demo_date) AS first_demo_date
        , MAX(demo_date) AS last_demo_date
    FROM all_gtmx_and_pilot_demos
    GROUP BY salesforce_accountid
)

, ops_latest AS (
    SELECT
        salesforce_accountid
        , opportunity_name AS op_name
        , op_date
        , opportunity_stage AS op_stage
    FROM (
        SELECT
            salesforce_accountid
            , opportunity_name
            , op_date
            , opportunity_stage
            , ROW_NUMBER() OVER (
                PARTITION BY salesforce_accountid
                ORDER BY op_date DESC
            ) AS rn
        FROM all_gtmx_and_pilot_ops
    )
    WHERE rn = 1
)

, wins_agg AS (
    SELECT
        salesforce_accountid
        , TRUE AS is_won
        , MIN(win_date) AS win_date
    FROM all_wins
    GROUP BY salesforce_accountid
)

SELECT
    MD5(CONCAT_WS('|'
        , all_accounts.salesforce_accountid
        , rep_names.rep_name)) AS id
    , all_accounts.salesforce_accountid AS salesforce_accountid
    , account_names.account_name AS account_name
    , rep_names.rep_name AS rep_name
    , activity_agg.total_activities AS total_activities
    , activity_agg.first_activity_date AS first_activity_date
    , activity_agg.last_activity_date AS last_activity_date
    , calls_agg.total_calls AS total_calls
    , calls_agg.first_call_date AS first_call_date
    , calls_agg.last_call_date AS last_call_date
    , connects_agg.total_connects AS total_connects
    , connects_agg.first_connect_date AS first_connect_date
    , chorus_latest.chorus_link AS chorus_link
    , chorus_latest.chorus_date AS chorus_date
    , demos_agg.total_demos AS total_demos
    , demos_agg.first_demo_date AS first_demo_date
    , ops_latest.op_name AS op_name
    , ops_latest.op_date AS op_date
    , ops_latest.op_stage AS op_stage
    , COALESCE(wins_agg.is_won, FALSE) AS is_won
    , wins_agg.win_date AS win_date
    , CAST(NULL AS VARCHAR) AS feedback
    , apn.account_prospecting_notes AS prospecting_notes
    , CAST(NULL AS DATE) AS feedback_date
FROM all_accounts
LEFT JOIN account_names
    ON all_accounts.salesforce_accountid
        = account_names.salesforce_accountid
LEFT JOIN rep_names
    ON all_accounts.salesforce_accountid
        = rep_names.salesforce_accountid
LEFT JOIN activity_agg
    ON all_accounts.salesforce_accountid
        = activity_agg.salesforce_accountid
LEFT JOIN calls_agg
    ON all_accounts.salesforce_accountid
        = calls_agg.salesforce_accountid
LEFT JOIN connects_agg
    ON all_accounts.salesforce_accountid
        = connects_agg.salesforce_accountid
LEFT JOIN chorus_latest
    ON all_accounts.salesforce_accountid
        = chorus_latest.salesforce_accountid
LEFT JOIN demos_agg
    ON all_accounts.salesforce_accountid
        = demos_agg.salesforce_accountid
LEFT JOIN ops_latest
    ON all_accounts.salesforce_accountid
        = ops_latest.salesforce_accountid
LEFT JOIN wins_agg
    ON all_accounts.salesforce_accountid
        = wins_agg.salesforce_accountid
LEFT JOIN account_prospecting_notes AS apn
    ON all_accounts.salesforce_accountid
        = apn.salesforce_accountid
ORDER BY
    activity_agg.last_activity_date DESC NULLS LAST

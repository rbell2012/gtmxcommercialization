-- Snowflake export for /public/data/metrics_ops.json
-- Inlined: gtmx_dashboard.ipynb cells 13 (all_gtmx_ops), 14 (all_ops_broad), 15 (opp_line_items), 26 (dedup).
--
-- Includes notebook cell 16 all_pilot_rep_ops via all_reps_in_tests.
-- all_reps_in_tests source precedence:
--   1) ALL_REPS_IN_TESTS_TMP (session temp table created by snowflake_sync.py bridge)
--   2) TOAST.SOURCE_MANUAL.ALL_REPS_IN_TESTS (Google Sheet-loaded)
--
-- win_stage_date: not on TOAST.GTM.OPPORTUNITY in notebook — emitted as NULL (frontend uses opportunity_stage + isWinStage).

WITH all_ops AS (
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
),

all_ops_broad AS (
    SELECT
        o.SALESFORCE_OPPORTUNITYID AS "salesforce_opportunityid",
        o.OPPORTUNITY_CLOSE_DATE AS "op_date",
        o.OPPORTUNITY_CREATED_DATE AS "op_created_date",
        o.OPPORTUNITY_NAME AS "opportunity_name",
        o.OPPORTUNITY_STAGE AS "opportunity_stage",
        o.SALESFORCE_ACCOUNTID AS "salesforce_accountid",
        opp_owner.FULL_NAME AS "rep_name",
        acct.ACCOUNT_NAME AS "account_name",
        acct.ACCOUNT_PROSPECTING_NOTES
            AS "account_prospecting_notes",
        o.OPPORTUNITY_TYPE AS "opportunity_type",
        o.OPPORTUNITY_ISWON AS "opportunity_iswon",
        o.OPPORTUNITY_SOFTWARE_MRR AS "opportunity_software_mrr",
        MD5(o.SALESFORCE_OPPORTUNITYID) AS "id"
    FROM TOAST.GTM.OPPORTUNITY AS o
    LEFT JOIN TOAST.ANALYTICS_CORE.EMPLOYEE_CURRENT AS opp_owner
        ON
            o.SALESFORCE_OPPORTUNITYOWNERID
            = opp_owner.SALESFORCE_USERID
    LEFT JOIN TOAST.ANALYTICS_CORE.CUSTOMER AS acct
        ON o.SALESFORCE_ACCOUNTID = acct.SALESFORCE_ACCOUNTID
    WHERE
        o.OPPORTUNITY_CREATED_DATE >= DATE '2025-07-01'
        AND COALESCE(o.OPPORTUNITY_NAME, '') NOT ILIKE '%downsell%'
        AND o.OPPORTUNITY_SOFTWARE_MRR >= 0
),
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

opp_line_items AS (
    SELECT
        li.SALESFORCE_OPPORTUNITYID AS "salesforce_opportunityid",
        LISTAGG(
            li.PRODUCT_NAME || ' ($'
            || ROUND(li.TOTAL_PRICE, 2)::VARCHAR || ')',
            ', '
        ) WITHIN GROUP (
            ORDER BY li.PRODUCT_NAME
        ) AS "line_items"
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

combined AS (
    SELECT
        ops."id" AS id
        , ops."op_date" AS op_date
        , ops."op_created_date" AS op_created_date
        , ops."opportunity_name" AS opportunity_name
        , ops."opportunity_stage" AS opportunity_stage
        , ops."account_name" AS account_name
        , ops."salesforce_accountid" AS salesforce_accountid
        , ops."rep_name" AS rep_name
        , CAST(ops."gtmx_team" AS VARCHAR) AS gtmx_team
        , ops."account_prospecting_notes" AS account_prospecting_notes
        , ops."opportunity_type" AS opportunity_type
        , broad."opportunity_software_mrr" AS opportunity_software_mrr
        , li."line_items" AS line_items
        , 2 AS source_priority
    FROM all_gtmx_ops ops
    LEFT JOIN all_ops_broad broad
        ON ops."id" = broad."id"
    LEFT JOIN opp_line_items li
        ON broad."salesforce_opportunityid" = li."salesforce_opportunityid"

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

SELECT
    id
    , rep_name
    , op_date
    , op_created_date
    , opportunity_name
    , opportunity_stage
    , CAST(NULL AS DATE) AS win_stage_date
    , opportunity_type
    , opportunity_software_mrr
    , account_prospecting_notes
    , line_items
    , account_name
    , salesforce_accountid
FROM combined
WHERE id IS NOT NULL
QUALIFY ROW_NUMBER() OVER (
    PARTITION BY id
    ORDER BY source_priority ASC
) = 1
ORDER BY op_date DESC NULLS LAST;

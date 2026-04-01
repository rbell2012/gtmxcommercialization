-- Upsert to Supabase win_snapshots via snowflake_sync.py
-- Source: gtmx_dashboard.ipynb cells 17 + 18 (mad_max_wins unioned).
-- Prereq: scripts/snowflake_sync.py sheet pre-step populates
-- TOAST.SOURCE_MANUAL.FROM_GOOGLE_SHEET_MAD_MAX.

-- this should handle catering and guest pro wins
-- still need boost via sheet

WITH core_wins AS (
    SELECT
        MD5(o.salesforce_opportunityid) AS "id"
        , acct.account_name AS "account_name"
        , o.salesforce_accountid AS "salesforce_accountid"
        , o.opportunity_close_date AS "win_date"
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
),
mad_max_wins AS (
    SELECT
        MD5(CONCAT_WS('|'
            , rep_name
            , date_added
            , CASE
                WHEN rn > 1 THEN customer_name || ' ' || CAST(rn AS VARCHAR)
                ELSE customer_name
              END)) AS id
        , CASE
            WHEN date_added IS NOT NULL AND date_added != '' THEN TO_DATE(date_added, 'MM-DD-YYYY')
          END AS win_date
        , CASE
            WHEN rn > 1 THEN customer_name || ' ' || CAST(rn AS VARCHAR)
            ELSE customer_name
          END AS account_name
        , salesforce_accountid
    FROM (
        SELECT
            date_added
            , gtmx AS rep_name
            , customer_name || ' [extra]' AS customer_name
            , salesforce_accountid
            , ROW_NUMBER() OVER (
                PARTITION BY gtmx, customer_name
                ORDER BY date_added
            ) AS rn
        FROM TOAST.SOURCE_MANUAL.FROM_GOOGLE_SHEET_MAD_MAX
        WHERE status ILIKE '%Boost Committed%'
           OR status ILIKE '%Offers Activated%'
           OR status ILIKE '%Multiple Offers%'

        UNION ALL

        SELECT
            date_added
            , gtmx AS rep_name
            , customer_name
            , salesforce_accountid
            , ROW_NUMBER() OVER (
                PARTITION BY gtmx, customer_name
                ORDER BY date_added
            ) AS rn
        FROM TOAST.SOURCE_MANUAL.FROM_GOOGLE_SHEET_MAD_MAX
        WHERE status ILIKE '%Multiple Offers%'
    ) raw
)
SELECT * FROM core_wins
UNION ALL
SELECT
    id,
    account_name,
    salesforce_accountid,
    win_date
FROM mad_max_wins
ORDER BY
    "win_date" DESC;

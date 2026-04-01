-- Snowflake export → upsert to Supabase metrics_sales_teams (not a static JSON file in some pipelines; included for snowflake_sync.py)
-- Source: gtmx_dashboard.ipynb cell 19 (verbatim; %%sql magic line removed)

WITH sales_employees AS (
    SELECT
        employee_id
        , full_name
        , job_family_name
        , manager_employee_id
        , position_title
        , location_reference
        , department_name
    FROM TOAST.ANALYTICS_CORE.EMPLOYEE_CURRENT
    WHERE IS_ACTIVE ILIKE 'true'
      AND JOB_FAMILY_NAME ILIKE '%sales%'
    --   AND manager_title NOT ilike '%president%'
      AND location_reference NOT ilike '%Australia%'
      AND location_reference NOT ilike '%canada%'
      AND location_reference NOT ilike '%india%'
      AND location_reference NOT ilike '%GTM AI Solutions%'
      AND location_reference NOT ilike '%Operations%'
      AND location_reference NOT ilike '%INTL%'
      AND location_reference NOT ilike '%international%'
      AND location_reference NOT ilike '%key account%'
      AND location_reference NOT ilike '%leadership%'
      AND location_reference NOT ilike '%Solutions%'
      AND location_reference NOT ilike '%ventures%'
      AND location_reference NOT ilike '%acquisition%'
      AND location_reference NOT ilike '%onboarding%'
      AND location_reference NOT ilike '%engineering%'
      AND location_reference NOT ilike '%enablement%'
      AND location_reference NOT ilike '%Strategic Cuisines%'
      AND location_reference NOT ilike '%UK%'
    --   AND location_reference NOT ilike '%%'
)

, monthly_wins AS (
    SELECT
        emp.manager_employee_id
        , DATE_TRUNC('month', opp.opportunity_close_date)
            AS win_month
        , COUNT(*) AS wins
    FROM TOAST.GTM.OPPORTUNITY AS opp
    INNER JOIN TOAST.ANALYTICS_CORE.EMPLOYEE_CURRENT AS emp
        ON opp.salesforce_opportunityownerid
            = emp.salesforce_userid
    WHERE opp.opportunity_iswon = TRUE
      AND opp.opportunity_close_date
          >= DATEADD('month', -12, CURRENT_DATE)
    GROUP BY
        emp.manager_employee_id
        , win_month
)

, avg_monthly_wins AS (
    SELECT
        manager_employee_id
        , FLOOR(AVG(wins)) AS "avg_monthly_wins"
    FROM monthly_wins
    GROUP BY manager_employee_id
)

SELECT
    MD5(CONCAT_WS('|'
        , managers.full_name
        , managers.location_reference)) AS "id"
    , managers.full_name AS "manager_name"
    , managers.position_title AS "manager_title"
    , managers.location_reference AS "location_reference"
    , COUNT(reports.employee_id) AS "team_size"
    , COALESCE(avg_monthly_wins."avg_monthly_wins", 0)
        AS "avg_monthly_wins"
    , LISTAGG(reports.full_name, ', ')
        WITHIN GROUP (ORDER BY reports.full_name)
        AS "team_members"
    , managers.department_name AS "department_name"
FROM sales_employees AS managers
INNER JOIN sales_employees AS reports
    ON managers.employee_id = reports.manager_employee_id
LEFT JOIN avg_monthly_wins
    ON managers.employee_id
        = avg_monthly_wins.manager_employee_id
GROUP BY
    managers.location_reference
    , managers.full_name
    , managers.position_title
    , avg_monthly_wins."avg_monthly_wins"
    , managers.department_name
ORDER BY
    "location_reference" ASC
    , "manager_title" ASC
    , "manager_name" ASC;

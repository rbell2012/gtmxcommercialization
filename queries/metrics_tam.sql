-- Snowflake export for /public/data/metrics_tam.json
-- Source: gtmx_dashboard.ipynb cell 20.
-- Prereq: scripts/snowflake_sync.py sheet pre-step populates:
--   TOAST.SOURCE_MANUAL.FROM_GOOGLE_SHEET_MAD_MAX
--   TOAST.SOURCE_MANUAL.FROM_GOOGLE_SHEET_STERNO

WITH gtmx_team_roster AS (
    SELECT DISTINCT full_name AS rep_name
    FROM TOAST.ANALYTICS_CORE.EMPLOYEE_CURRENT
    WHERE manager_employee_id = '108763'
)
SELECT
    MD5(CONCAT_WS('|', source, rep_name)) AS id
    , source
    , rep_name
    , SUM(tam) AS tam
FROM (
    SELECT
        'Mad Max' AS source
        , CASE
            WHEN gtmx IN (SELECT rep_name FROM gtmx_team_roster) THEN gtmx
            ELSE 'Other'
          END AS rep_name
        , COUNT(DISTINCT customer_name) AS tam
    FROM TOAST.SOURCE_MANUAL.FROM_GOOGLE_SHEET_MAD_MAX
    WHERE status NOT ILIKE '%dnq%'
      AND status NOT ILIKE '%mid market%'
      AND status NOT ILIKE '%ent%'
    GROUP BY gtmx

    UNION ALL

    SELECT
        'Sterno' AS source
        , CASE
            WHEN ACCOUNT_OWNER IN (SELECT rep_name FROM gtmx_team_roster) THEN ACCOUNT_OWNER
            ELSE 'Other'
          END AS rep_name
        , COUNT(DISTINCT ACCOUNT_NAME) AS tam
    FROM TOAST.SOURCE_MANUAL.FROM_GOOGLE_SHEET_STERNO
    WHERE OUTCOME NOT ILIKE '%disqualified%'
    GROUP BY ACCOUNT_OWNER

    UNION ALL

    SELECT
        'Guest Pro' AS source
        , 'Lo Picton' AS rep_name
        , 2400 AS tam
)
GROUP BY source, rep_name
ORDER BY source, rep_name;

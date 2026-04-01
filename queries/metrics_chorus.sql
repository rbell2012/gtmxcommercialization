-- Snowflake export for /public/data/metrics_chorus.json
-- Source: gtmx_dashboard.ipynb cell 25 (verbatim)

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
ORDER BY "chorus_date" DESC;

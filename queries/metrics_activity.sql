-- Snowflake export for /public/data/metrics_activity.json
-- Source: gtmx_dashboard.ipynb cell 21 (verbatim)

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

ORDER BY "activity_date" DESC;

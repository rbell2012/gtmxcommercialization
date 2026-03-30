-- Fix cleanup_stale_rows:
-- 1) Use uuid[] comparison so Hex/Sheets uppercase UUIDs match DB lowercase ids (avoids wiping entire tables).
-- 2) For metrics_sales_teams, skip rows still referenced by project_team_assignments (FK).

CREATE OR REPLACE FUNCTION public.cleanup_stale_rows(
  p_table_name text,
  p_valid_ids text[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer;
  v_allowed text[] := ARRAY[
    'superhex',
    'metrics_tam',
    'metrics_activity',
    'metrics_calls',
    'metrics_connects',
    'metrics_demos',
    'metrics_chorus',
    'metrics_ops',
    'metrics_wins',
    'metrics_feedback',
    'metrics_sales_teams'
  ];
BEGIN
  IF NOT (p_table_name = ANY(v_allowed)) THEN
    RAISE EXCEPTION 'Table % is not in the allowed list', p_table_name;
  END IF;

  IF p_table_name = 'metrics_sales_teams' THEN
    EXECUTE format(
      'DELETE FROM %I WHERE id != ALL($1::uuid[]) AND id NOT IN (SELECT sales_team_id FROM project_team_assignments)',
      p_table_name
    ) USING p_valid_ids;
  ELSE
    EXECUTE format(
      'DELETE FROM %I WHERE id != ALL($1::uuid[])',
      p_table_name
    ) USING p_valid_ids;
  END IF;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

COMMENT ON FUNCTION public.cleanup_stale_rows(text, text[]) IS
  'Deletes rows whose id is not in p_valid_ids for whitelisted tables; uuid cast normalizes case; sales_teams skips FK-referenced rows.';

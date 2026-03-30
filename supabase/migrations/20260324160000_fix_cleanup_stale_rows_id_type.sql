-- cleanup_stale_rows: support tables where id is uuid OR text (legacy metrics_activity/calls/connects).
-- Uses information_schema to pick id != ALL($1::uuid[]) vs id != ALL($1).

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
  v_id_type text;
  v_id_cast text;
  v_fk_filter text;
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

  SELECT c.data_type INTO v_id_type
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = p_table_name
    AND c.column_name = 'id';

  IF v_id_type IS NULL THEN
    RAISE EXCEPTION 'Table % does not have an id column', p_table_name;
  END IF;

  v_id_cast := CASE WHEN v_id_type = 'uuid' THEN '$1::uuid[]' ELSE '$1' END;
  v_fk_filter := CASE
    WHEN p_table_name = 'metrics_sales_teams' THEN
      'AND id NOT IN (SELECT sales_team_id FROM project_team_assignments)'
    ELSE ''
  END;

  EXECUTE format(
    'DELETE FROM %I WHERE id != ALL(%s) %s',
    p_table_name,
    v_id_cast,
    v_fk_filter
  ) USING p_valid_ids;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

COMMENT ON FUNCTION public.cleanup_stale_rows(text, text[]) IS
  'Deletes rows whose id is not in p_valid_ids; id column may be uuid or text; sales_teams skips FK-referenced rows.';

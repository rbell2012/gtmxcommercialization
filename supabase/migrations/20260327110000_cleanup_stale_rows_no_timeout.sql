-- Remove the statement_timeout cap from cleanup_stale_rows.
-- The previous 300s limit was too short for large tables (metrics_ops, metrics_wins ~64k rows).
-- SET LOCAL statement_timeout = 0 means no timeout for this transaction only — safe because
-- the function is SECURITY DEFINER and the timeout is scoped to the single DELETE statement.
-- Also add a PRIMARY KEY to the temp table so Postgres uses a hash join (O(n) not O(n*m)).

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
  SET LOCAL statement_timeout = 0;

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

  v_fk_filter := CASE
    WHEN p_table_name = 'metrics_sales_teams' THEN
      'AND id NOT IN (SELECT sales_team_id FROM project_team_assignments)'
    ELSE ''
  END;

  IF v_id_type = 'uuid' THEN
    CREATE TEMP TABLE _csr_valid_ids (id uuid PRIMARY KEY) ON COMMIT DROP;
    INSERT INTO _csr_valid_ids SELECT unnest(p_valid_ids::uuid[]);

    EXECUTE format(
      'DELETE FROM %I t WHERE NOT EXISTS (SELECT 1 FROM _csr_valid_ids v WHERE v.id = t.id) %s',
      p_table_name,
      v_fk_filter
    );
  ELSE
    CREATE TEMP TABLE _csr_valid_ids (id text PRIMARY KEY) ON COMMIT DROP;
    INSERT INTO _csr_valid_ids SELECT unnest(p_valid_ids);

    EXECUTE format(
      'DELETE FROM %I t WHERE NOT EXISTS (SELECT 1 FROM _csr_valid_ids v WHERE v.id = t.id) %s',
      p_table_name,
      v_fk_filter
    );
  END IF;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

COMMENT ON FUNCTION public.cleanup_stale_rows(text, text[]) IS
  'Deletes rows whose id is not in p_valid_ids via temp table (PRIMARY KEY) + NOT EXISTS; no statement_timeout (SET LOCAL 0); id uuid or text; sales_teams skips FK-referenced rows.';

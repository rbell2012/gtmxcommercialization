-- RPC for Google Apps Script sync: delete rows not present in the current sheet export.
-- Called as POST /rest/v1/rpc/cleanup_stale_rows with { p_table_name, p_valid_ids }.

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

  -- id columns are uuid; sheet/RPC sends text[] from JSON
  EXECUTE format(
    'DELETE FROM %I WHERE NOT (id::text = ANY($1))',
    p_table_name
  ) USING p_valid_ids;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

COMMENT ON FUNCTION public.cleanup_stale_rows(text, text[]) IS
  'Deletes rows whose id is not in p_valid_ids for whitelisted metrics/superhex tables; used by Sheets sync.';

GRANT EXECUTE ON FUNCTION public.cleanup_stale_rows(text, text[]) TO anon;
GRANT EXECUTE ON FUNCTION public.cleanup_stale_rows(text, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_stale_rows(text, text[]) TO service_role;

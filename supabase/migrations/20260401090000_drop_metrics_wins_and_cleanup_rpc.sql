-- Post-cutover cleanup:
-- - metrics_wins is replaced by metrics_ops + win_snapshots
-- - cleanup_stale_rows RPC is no longer used by the sync script

drop function if exists public.cleanup_stale_rows(text, text[]);

alter publication supabase_realtime drop table if exists public.metrics_wins;

drop table if exists public.metrics_wins cascade;

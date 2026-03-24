-- Zero out stale persisted wins in weekly_funnels.
-- Wins should be derived from metrics_wins via TeamsContext merge logic.
update public.weekly_funnels
set wins = 0
where wins <> 0;

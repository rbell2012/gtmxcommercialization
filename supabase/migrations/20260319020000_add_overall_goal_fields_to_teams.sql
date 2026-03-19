-- Overall Goal configuration for wins + pricing metrics
ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS overall_goal_wins_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS overall_goal_wins integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overall_goal_total_price_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS overall_goal_total_price numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overall_goal_discount_threshold_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS overall_goal_discount_threshold numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overall_goal_realized_price_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS overall_goal_realized_price numeric NOT NULL DEFAULT 0;

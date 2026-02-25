-- ============================================================
-- Expand goals system: 6 metrics with parity toggle
-- ============================================================

-- Add ops column to weekly_funnels (accounts & feedback already exist)
ALTER TABLE public.weekly_funnels ADD COLUMN IF NOT EXISTS ops integer not null default 0;

-- Convert feedback from text to integer if needed
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'weekly_funnels'
      AND column_name = 'feedback'
      AND data_type = 'text'
  ) THEN
    ALTER TABLE public.weekly_funnels ALTER COLUMN feedback TYPE integer USING 0;
    ALTER TABLE public.weekly_funnels ALTER COLUMN feedback SET DEFAULT 0;
  END IF;
END $$;

-- Per-metric goals on members
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS goal_accounts integer not null default 0;
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS goal_calls    integer not null default 0;
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS goal_ops      integer not null default 0;
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS goal_demos    integer not null default 0;
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS goal_wins     integer not null default 30;
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS goal_feedback integer not null default 0;

-- Migrate existing single goal → goal_wins
UPDATE public.members SET goal_wins = goal WHERE goal != 30;

-- Parity toggle and team-level goals on teams
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS goals_parity       boolean not null default false;
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS team_goal_accounts integer not null default 0;
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS team_goal_calls    integer not null default 0;
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS team_goal_ops      integer not null default 0;
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS team_goal_demos    integer not null default 0;
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS team_goal_wins     integer not null default 0;
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS team_goal_feedback integer not null default 0;

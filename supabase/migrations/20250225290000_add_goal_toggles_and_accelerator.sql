ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS goal_enabled_accounts boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS goal_enabled_contacts_added boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS goal_enabled_calls boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS goal_enabled_ops boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS goal_enabled_demos boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS goal_enabled_wins boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS goal_enabled_feedback boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS accelerator_config jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Add accelerator mode and basic accelerator config to teams and team_goals_history

ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS accelerator_mode text NOT NULL DEFAULT 'basic',
  ADD COLUMN IF NOT EXISTS basic_accelerator_config jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE team_goals_history
  ADD COLUMN IF NOT EXISTS accelerator_mode text NOT NULL DEFAULT 'basic',
  ADD COLUMN IF NOT EXISTS basic_accelerator_config jsonb NOT NULL DEFAULT '{}'::jsonb;

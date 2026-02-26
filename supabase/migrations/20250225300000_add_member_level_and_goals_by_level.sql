ALTER TABLE members ADD COLUMN IF NOT EXISTS level text;

ALTER TABLE teams ADD COLUMN IF NOT EXISTS team_goals_by_level jsonb NOT NULL DEFAULT '{}'::jsonb;

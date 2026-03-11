ALTER TABLE teams
  ADD COLUMN relief_month_members jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE team_goals_history
  ADD COLUMN relief_month_members jsonb NOT NULL DEFAULT '[]'::jsonb;

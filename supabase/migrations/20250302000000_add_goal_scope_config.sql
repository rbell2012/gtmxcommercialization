ALTER TABLE teams
ADD COLUMN IF NOT EXISTS goal_scope_config jsonb DEFAULT '{"calls":"individual","ops":"individual","demos":"individual","wins":"individual","feedback":"individual","activity":"individual"}'::jsonb;

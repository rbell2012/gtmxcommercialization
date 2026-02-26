ALTER TABLE weekly_funnels DROP COLUMN IF EXISTS accounts;
ALTER TABLE weekly_funnels DROP COLUMN IF EXISTS contacts_added;
ALTER TABLE members DROP COLUMN IF EXISTS goal_accounts;
ALTER TABLE members DROP COLUMN IF EXISTS goal_contacts_added;
ALTER TABLE teams DROP COLUMN IF EXISTS team_goal_accounts;
ALTER TABLE teams DROP COLUMN IF EXISTS team_goal_contacts_added;
ALTER TABLE teams DROP COLUMN IF EXISTS goal_enabled_accounts;
ALTER TABLE teams DROP COLUMN IF EXISTS goal_enabled_contacts_added;

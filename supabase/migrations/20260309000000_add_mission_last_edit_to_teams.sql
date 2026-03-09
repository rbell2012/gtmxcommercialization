ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS mission_last_edit timestamptz DEFAULT NULL;

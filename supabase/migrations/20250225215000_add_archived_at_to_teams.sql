-- Soft-delete support for teams: archived teams are hidden from the UI
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS archived_at timestamptz DEFAULT NULL;

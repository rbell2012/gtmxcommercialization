-- Add missing is_active column to teams table.
-- Existing rows default to true (active).
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

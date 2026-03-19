-- Add structured "Signals" fields to teams table
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS top_objections text[] NOT NULL DEFAULT ARRAY['','',''];
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS biggest_risks text[] NOT NULL DEFAULT ARRAY['','',''];
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS onboarding_process text NOT NULL DEFAULT '';
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS signals_submitted boolean NOT NULL DEFAULT false;
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS signals_last_edit timestamptz DEFAULT NULL;

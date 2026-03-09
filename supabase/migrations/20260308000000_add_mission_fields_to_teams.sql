-- Add structured mission fields to teams table
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS executive_sponsor text NOT NULL DEFAULT '';
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS executive_proxy text NOT NULL DEFAULT '';
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS revenue_lever text NOT NULL DEFAULT '';
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS business_goal text NOT NULL DEFAULT '';
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS what_we_are_testing text NOT NULL DEFAULT '';

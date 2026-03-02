-- Add total_ops column to superhex table (before total_demos logically)
ALTER TABLE public.superhex ADD COLUMN total_ops integer NOT NULL DEFAULT 0;

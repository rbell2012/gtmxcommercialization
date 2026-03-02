-- Add total_feedback column to superhex table (after total_wins logically)
ALTER TABLE public.superhex ADD COLUMN total_feedback integer NOT NULL DEFAULT 0;

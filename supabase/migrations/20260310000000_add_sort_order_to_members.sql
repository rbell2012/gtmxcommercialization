ALTER TABLE public.members ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) - 1 AS rn
  FROM public.members
)
UPDATE public.members m
  SET sort_order = ranked.rn
  FROM ranked
  WHERE m.id = ranked.id;

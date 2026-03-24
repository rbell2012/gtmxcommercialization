-- Align Carly King, Shane Hughes, Zoe Lang Mad Max history with team start 2025-12-01.
-- Replaces Oct/Nov 2025 entries with a single open assignment from 2025-12-01.

DELETE FROM public.member_team_history
WHERE team_id = (SELECT id FROM public.teams WHERE name ILIKE '%Mad Max%')
  AND member_id IN (
    SELECT id FROM public.members WHERE name IN ('Carly King', 'Shane Hughes', 'Zoe Lang')
  );

INSERT INTO public.member_team_history (id, member_id, team_id, started_at, ended_at)
SELECT
  gen_random_uuid(),
  m.id,
  t.id,
  '2025-12-01T00:00:00+00:00'::timestamptz,
  NULL
FROM public.members m
CROSS JOIN public.teams t
WHERE m.name IN ('Carly King', 'Shane Hughes', 'Zoe Lang')
  AND t.name ILIKE '%Mad Max%';

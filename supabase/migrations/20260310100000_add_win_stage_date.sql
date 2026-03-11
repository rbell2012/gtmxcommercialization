-- Add win_stage_date to metrics_ops: records when opportunity_stage first
-- reached the win-qualifying threshold (depends on opportunity_type).
-- Stage format is "N. Label" (e.g. "16. Closed - Onboarded").

ALTER TABLE public.metrics_ops
  ADD COLUMN IF NOT EXISTS win_stage_date date;

-- Backfill: both stage and type are null → counts as win
UPDATE public.metrics_ops
SET win_stage_date = op_date
WHERE win_stage_date IS NULL
  AND opportunity_stage IS NULL
  AND opportunity_type IS NULL;

-- Backfill: Existing Business (Upsell) qualifies at stage 14+
UPDATE public.metrics_ops
SET win_stage_date = op_date
WHERE win_stage_date IS NULL
  AND opportunity_stage IS NOT NULL
  AND opportunity_type = 'Existing Business (Upsell)'
  AND (substring(opportunity_stage from '^\d+'))::int >= 14;

-- Backfill: New Business (and any other non-null type) qualifies at stage 16+
UPDATE public.metrics_ops
SET win_stage_date = op_date
WHERE win_stage_date IS NULL
  AND opportunity_stage IS NOT NULL
  AND (opportunity_type IS DISTINCT FROM 'Existing Business (Upsell)')
  AND (substring(opportunity_stage from '^\d+'))::int >= 16;

-- Trigger function: auto-sets win_stage_date on qualifying inserts/updates
CREATE OR REPLACE FUNCTION public.set_win_stage_date()
RETURNS trigger AS $$
DECLARE
  stage_num int;
  threshold int;
BEGIN
  IF NEW.win_stage_date IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Both stage and type null → qualifies as a win
  IF NEW.opportunity_stage IS NULL AND NEW.opportunity_type IS NULL THEN
    NEW.win_stage_date := CURRENT_DATE;
    RETURN NEW;
  END IF;

  IF NEW.opportunity_stage IS NULL THEN
    RETURN NEW;
  END IF;

  BEGIN
    stage_num := (substring(NEW.opportunity_stage from '^\d+'))::int;
  EXCEPTION WHEN OTHERS THEN
    RETURN NEW;
  END;

  IF stage_num IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.opportunity_type = 'Existing Business (Upsell)' THEN
    threshold := 14;
  ELSE
    threshold := 16;
  END IF;

  IF stage_num >= threshold THEN
    NEW.win_stage_date := CURRENT_DATE;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_metrics_ops_win_stage_date
  BEFORE INSERT OR UPDATE ON public.metrics_ops
  FOR EACH ROW EXECUTE FUNCTION public.set_win_stage_date();

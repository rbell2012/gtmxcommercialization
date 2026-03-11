-- Harden set_win_stage_date() to preserve existing win_stage_date on UPDATE.
-- Protects against pipeline upserts that don't carry the column forward.

CREATE OR REPLACE FUNCTION public.set_win_stage_date()
RETURNS trigger AS $$
DECLARE
  stage_num int;
  threshold int;
BEGIN
  -- On UPDATE, preserve the existing win_stage_date if already set
  IF TG_OP = 'UPDATE' AND OLD.win_stage_date IS NOT NULL THEN
    NEW.win_stage_date := OLD.win_stage_date;
    RETURN NEW;
  END IF;

  IF NEW.win_stage_date IS NOT NULL THEN
    RETURN NEW;
  END IF;

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

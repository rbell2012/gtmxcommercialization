ALTER TABLE metrics_feedback
  ADD COLUMN IF NOT EXISTS comments text,
  ADD COLUMN IF NOT EXISTS chorus_link text,
  ADD COLUMN IF NOT EXISTS chorus_date date;

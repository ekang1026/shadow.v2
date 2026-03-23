-- Migration 003: Add headcount_error column
-- When LinkedIn scraping fails or returns no data, the company still passes through
-- to the review queue with headcount_error=true so reviewers see "N/A" instead of
-- the company being silently dropped.
ALTER TABLE company_snapshots ADD COLUMN IF NOT EXISTS headcount_error boolean DEFAULT false;

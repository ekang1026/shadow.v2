-- Migration 003: Add all PitchBook columns with pb_ prefix
-- Distinguishes PitchBook-sourced data from scraped/enriched data

-- Rename existing 'headcount' to 'headcount' (keep for LinkedIn-scraped value)
-- Add pb_employees for PitchBook's employee count (less reliable)

ALTER TABLE company_snapshots
  ADD COLUMN IF NOT EXISTS pb_company_id TEXT,
  ADD COLUMN IF NOT EXISTS pb_active_investors TEXT,
  ADD COLUMN IF NOT EXISTS pb_legal_name TEXT,
  ADD COLUMN IF NOT EXISTS pb_description TEXT,
  ADD COLUMN IF NOT EXISTS pb_employees INTEGER,
  ADD COLUMN IF NOT EXISTS pb_financing_status TEXT,
  ADD COLUMN IF NOT EXISTS pb_hq_city TEXT,
  ADD COLUMN IF NOT EXISTS pb_hq_state TEXT,
  ADD COLUMN IF NOT EXISTS pb_keywords TEXT,
  ADD COLUMN IF NOT EXISTS pb_last_financing_date TEXT,
  ADD COLUMN IF NOT EXISTS pb_last_financing_size NUMERIC,
  ADD COLUMN IF NOT EXISTS pb_valuation_date TEXT,
  ADD COLUMN IF NOT EXISTS pb_primary_contact TEXT,
  ADD COLUMN IF NOT EXISTS pb_primary_contact_email TEXT,
  ADD COLUMN IF NOT EXISTS pb_primary_contact_phone TEXT,
  ADD COLUMN IF NOT EXISTS pb_primary_contact_title TEXT,
  ADD COLUMN IF NOT EXISTS pb_profile_url TEXT;

-- Add comment for clarity
COMMENT ON COLUMN company_snapshots.pb_employees IS 'Employee count from PitchBook (less reliable than LinkedIn scrape)';
COMMENT ON COLUMN company_snapshots.headcount IS 'Employee count from LinkedIn scrape (trusted source)';
COMMENT ON COLUMN company_snapshots.pb_description IS 'Company description from PitchBook';
COMMENT ON COLUMN company_snapshots.what_they_do IS 'Company description from LLM analysis';

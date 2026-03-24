-- Migration 005: Add Crust Data enrichment JSONB column
-- Stores the full Crust Data API response for HVT companies
-- One API call per company, ~170+ fields stored as structured JSON

ALTER TABLE company_snapshots
  ADD COLUMN IF NOT EXISTS crustdata_enrichment JSONB,
  ADD COLUMN IF NOT EXISTS crustdata_enriched_at TIMESTAMPTZ;

COMMENT ON COLUMN company_snapshots.crustdata_enrichment IS 'Full Crust Data API response (headcount, web traffic, founders, competitors, etc.)';
COMMENT ON COLUMN company_snapshots.crustdata_enriched_at IS 'When Crust Data enrichment was last run';

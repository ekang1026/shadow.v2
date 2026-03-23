-- Migration 005: Add structured competitors JSON column
-- Stores competitor research results from LLM pipeline
-- Format: [{"name": "CompanyX", "source": "website_positioning", "rationale": "..."}, ...]

ALTER TABLE company_snapshots
  ADD COLUMN IF NOT EXISTS competitors JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS competitor_confidence TEXT;

COMMENT ON COLUMN company_snapshots.competitors IS 'Structured competitor data from LLM research: [{name, source, rationale}]';
COMMENT ON COLUMN company_snapshots.competitor_confidence IS 'HIGH, MIXED, or LOW confidence in competitor identification';

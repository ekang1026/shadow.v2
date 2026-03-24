-- Migration 006: Add TAM (Total Addressable Market) columns
-- Populated by LLM survey during Script 4

ALTER TABLE company_snapshots
  ADD COLUMN IF NOT EXISTS icp_description TEXT,
  ADD COLUMN IF NOT EXISTS icp_evidence TEXT,
  ADD COLUMN IF NOT EXISTS us_tam_customer_count INTEGER,
  ADD COLUMN IF NOT EXISTS us_tam_customer_count_source TEXT,
  ADD COLUMN IF NOT EXISTS estimated_annual_contract_value INTEGER,
  ADD COLUMN IF NOT EXISTS estimated_annual_contract_value_evidence TEXT,
  ADD COLUMN IF NOT EXISTS estimated_tam_usd BIGINT;

COMMENT ON COLUMN company_snapshots.icp_description IS 'Ideal Customer Profile - specific customer persona (e.g., "Audiologist clinics", "RIAs and broker-dealers")';
COMMENT ON COLUMN company_snapshots.us_tam_customer_count IS 'Estimated number of target customers in the US';
COMMENT ON COLUMN company_snapshots.estimated_annual_contract_value IS 'Estimated annual contract value (ACV) in USD';
COMMENT ON COLUMN company_snapshots.estimated_tam_usd IS 'Estimated US TAM = customer_count x ACV';

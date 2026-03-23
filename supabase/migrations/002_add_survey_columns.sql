-- Migration: Add LLM survey columns to company_snapshots
-- Run this in Supabase SQL Editor

-- Full survey JSON for audit trail / evidence fields
ALTER TABLE company_snapshots ADD COLUMN IF NOT EXISTS llm_survey jsonb;

-- Structured survey fields for querying and filtering
ALTER TABLE company_snapshots ADD COLUMN IF NOT EXISTS offering_type text[];
ALTER TABLE company_snapshots ADD COLUMN IF NOT EXISTS customer_type text[];
ALTER TABLE company_snapshots ADD COLUMN IF NOT EXISTS market_focus text;
ALTER TABLE company_snapshots ADD COLUMN IF NOT EXISTS naics_3digit_code text;
ALTER TABLE company_snapshots ADD COLUMN IF NOT EXISTS naics_3digit_name text;
ALTER TABLE company_snapshots ADD COLUMN IF NOT EXISTS product_category text;
ALTER TABLE company_snapshots ADD COLUMN IF NOT EXISTS revenue_model text[];
ALTER TABLE company_snapshots ADD COLUMN IF NOT EXISTS is_subsidiary boolean DEFAULT false;
ALTER TABLE company_snapshots ADD COLUMN IF NOT EXISTS vertical_type text;
ALTER TABLE company_snapshots ADD COLUMN IF NOT EXISTS multi_vertical_type text;
ALTER TABLE company_snapshots ADD COLUMN IF NOT EXISTS disfavored_vertical text;
ALTER TABLE company_snapshots ADD COLUMN IF NOT EXISTS customers_listed boolean;
ALTER TABLE company_snapshots ADD COLUMN IF NOT EXISTS customers_named text[];
ALTER TABLE company_snapshots ADD COLUMN IF NOT EXISTS success_indicators_present boolean;
ALTER TABLE company_snapshots ADD COLUMN IF NOT EXISTS success_indicators text[];
ALTER TABLE company_snapshots ADD COLUMN IF NOT EXISTS agentic_features_present boolean;
ALTER TABLE company_snapshots ADD COLUMN IF NOT EXISTS agentic_feature_types text[];

-- Migration 004: Add Google Ads competitor column
ALTER TABLE company_snapshots
  ADD COLUMN IF NOT EXISTS google_ad_competitors TEXT[];

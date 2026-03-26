-- Migration 008: API usage tracking table
CREATE TABLE IF NOT EXISTS api_usage (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  api_name TEXT NOT NULL,           -- 'anthropic', 'crustdata', 'apollo', 'hubspot'
  endpoint TEXT,                     -- specific endpoint called
  company_name TEXT,                 -- which company this was for (if applicable)
  input_tokens INTEGER,              -- for Anthropic
  output_tokens INTEGER,             -- for Anthropic
  estimated_cost_usd NUMERIC(10,6),  -- estimated cost in USD
  credits_used INTEGER DEFAULT 1,    -- for credit-based APIs (Crust Data, Apollo)
  success BOOLEAN DEFAULT TRUE,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for dashboard queries
CREATE INDEX IF NOT EXISTS idx_api_usage_created_at ON api_usage(created_at);
CREATE INDEX IF NOT EXISTS idx_api_usage_api_name ON api_usage(api_name);

-- Migration 007: Pipeline runs table for ingestion history
-- Drop if exists to reset schema
DROP TABLE IF EXISTS pipeline_runs;

CREATE TABLE pipeline_runs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now(),
  run_type TEXT DEFAULT 'pitchbook_ingest',
  file_name TEXT,
  status TEXT DEFAULT 'running',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  stats JSONB DEFAULT '{}',
  error_log TEXT,
  company_ids UUID[] DEFAULT '{}'
);

-- RLS
ALTER TABLE pipeline_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated users" ON pipeline_runs
  FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX idx_pipeline_runs_created ON pipeline_runs (created_at DESC);

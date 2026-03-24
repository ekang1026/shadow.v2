-- Migration 007: Add pipeline_runs table for ingestion history tracking

CREATE TABLE IF NOT EXISTS pipeline_runs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  run_type TEXT NOT NULL,
  file_name TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  status TEXT DEFAULT 'running',
  stats JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_runs_started_at ON pipeline_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_run_type ON pipeline_runs(run_type);

COMMENT ON TABLE pipeline_runs IS 'Tracks all pipeline executions (ingests, scrapes, LLM runs, enrichments)';

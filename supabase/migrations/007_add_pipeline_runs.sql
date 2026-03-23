-- Migration 007: Pipeline runs table + fix RLS on pipeline_metadata

-- Pipeline runs table for tracking all ingestion history
CREATE TABLE IF NOT EXISTS pipeline_runs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  run_type TEXT NOT NULL,
  file_name TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  status TEXT DEFAULT 'running',
  stats JSONB DEFAULT '{}'::jsonb,
  error_message TEXT
);

ALTER TABLE pipeline_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow authenticated read pipeline_runs" ON pipeline_runs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert pipeline_runs" ON pipeline_runs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated update pipeline_runs" ON pipeline_runs FOR UPDATE TO authenticated USING (true);

-- Fix pipeline_metadata RLS — add write policies
CREATE POLICY "Allow authenticated insert metadata" ON pipeline_metadata FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated update metadata" ON pipeline_metadata FOR UPDATE TO authenticated USING (true);

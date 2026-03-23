-- Migration 006: Pipeline metadata table for tracking run history
CREATE TABLE IF NOT EXISTS pipeline_metadata (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed initial record for pitchbook ingest
INSERT INTO pipeline_metadata (key, value)
VALUES ('pitchbook_last_ingest', '{"last_run_at": null, "stats": null}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- RLS
ALTER TABLE pipeline_metadata ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow authenticated read" ON pipeline_metadata FOR SELECT TO authenticated USING (true);

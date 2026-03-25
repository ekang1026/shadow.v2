-- Migration 008: Enhance website_snapshots for deep scraping and change detection

ALTER TABLE website_snapshots
  ADD COLUMN IF NOT EXISTS url TEXT,
  ADD COLUMN IF NOT EXISTS pages_scraped JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS content_by_page JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS previous_hash TEXT,
  ADD COLUMN IF NOT EXISTS diff_added TEXT,
  ADD COLUMN IF NOT EXISTS diff_removed TEXT;

COMMENT ON COLUMN website_snapshots.url IS 'Company website URL that was scraped';
COMMENT ON COLUMN website_snapshots.pages_scraped IS 'Array of page paths scraped, e.g. ["/", "/about", "/pricing"]';
COMMENT ON COLUMN website_snapshots.content_by_page IS 'JSON object mapping page path to content text';
COMMENT ON COLUMN website_snapshots.previous_hash IS 'Content hash from previous snapshot for comparison';
COMMENT ON COLUMN website_snapshots.diff_added IS 'New text found compared to previous snapshot';
COMMENT ON COLUMN website_snapshots.diff_removed IS 'Text removed compared to previous snapshot';
COMMENT ON COLUMN website_snapshots.raw_content IS 'Combined text from all scraped pages';

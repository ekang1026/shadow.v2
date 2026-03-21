-- Shadow Database Schema
-- All tables for Grayline Partners sourcing application

-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- ============================================================
-- Table 1: companies (master registry)
-- ============================================================
create table companies (
  id uuid primary key default uuid_generate_v4(),
  pitchbook_id text unique not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  status text default 'pending' check (status in ('pending', 'HVT', 'PM', 'PS', 'PT', 'PL')),
  review_count integer default 0
);

create index idx_companies_status on companies(status);
create index idx_companies_pitchbook_id on companies(pitchbook_id);

-- Auto-update updated_at timestamp
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger companies_updated_at
  before update on companies
  for each row execute function update_updated_at();

-- ============================================================
-- Table 2: company_snapshots (firmographic data per ingestion)
-- ============================================================
create table company_snapshots (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references companies(id) on delete cascade,
  snapshot_date date not null,
  is_latest boolean default true,
  name text,
  website text,
  linkedin_url text,
  pitchbook_url text,
  ceo_name text,
  ceo_linkedin_url text,
  ceo_email text,
  ceo_phone text,
  founded_year integer,
  location text,
  headcount integer,
  headcount_growth_1yr float,
  headcount_growth_2yr float,
  total_capital_raised bigint,
  last_round_valuation bigint,
  last_round_amount_raised bigint,
  previous_investors text[],
  what_they_do text,
  passed_headcount_filter boolean default false,
  passed_llm_filter boolean default false
);

create index idx_snapshots_company_latest on company_snapshots(company_id, is_latest);
create index idx_snapshots_is_latest on company_snapshots(is_latest) where is_latest = true;

-- ============================================================
-- Table 3: review_history (audit trail of classifications)
-- ============================================================
create table review_history (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references companies(id) on delete cascade,
  classification text not null check (classification in ('HVT', 'PM', 'PS', 'PT', 'PL')),
  reviewed_at timestamptz default now(),
  requeue_date date
);

create index idx_review_history_company on review_history(company_id);

-- ============================================================
-- Table 4: website_snapshots (weekly HVT website monitoring)
-- ============================================================
create table website_snapshots (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references companies(id) on delete cascade,
  checked_at timestamptz default now(),
  content_hash text,
  change_detected boolean default false,
  change_summary text,
  raw_content text
);

create index idx_website_snapshots_company on website_snapshots(company_id);

-- ============================================================
-- Table 5: linkedin_posts (Crust Data LinkedIn activity)
-- ============================================================
create table linkedin_posts (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references companies(id) on delete cascade,
  post_type text check (post_type in ('company', 'ceo')),
  posted_by text,
  post_content text,
  post_url text,
  posted_at timestamptz,
  detected_at timestamptz default now()
);

create index idx_linkedin_posts_company on linkedin_posts(company_id);

-- ============================================================
-- Table 6: outreach_attempts (individual email records)
-- ============================================================
create table outreach_attempts (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid not null references companies(id) on delete cascade,
  gmail_draft_id text,
  drafted_at timestamptz,
  sent_at timestamptz,
  hubspot_email_id text,
  email_opened boolean default false,
  opened_at timestamptz
);

create index idx_outreach_attempts_company on outreach_attempts(company_id);

-- ============================================================
-- Table 7: outreach_summary (rolled-up outreach stats)
-- ============================================================
create table outreach_summary (
  id uuid primary key default uuid_generate_v4(),
  company_id uuid unique not null references companies(id) on delete cascade,
  outreach_count integer default 0,
  last_outreach_at timestamptz,
  days_since_last_activity integer,
  any_opens boolean default false,
  last_synced_at timestamptz
);

create index idx_outreach_summary_company on outreach_summary(company_id);

-- ============================================================
-- Row Level Security (RLS)
-- ============================================================
alter table companies enable row level security;
alter table company_snapshots enable row level security;
alter table review_history enable row level security;
alter table website_snapshots enable row level security;
alter table linkedin_posts enable row level security;
alter table outreach_attempts enable row level security;
alter table outreach_summary enable row level security;

-- Allow all authenticated users full access (internal tool)
create policy "Authenticated users have full access" on companies
  for all using (auth.role() = 'authenticated');

create policy "Authenticated users have full access" on company_snapshots
  for all using (auth.role() = 'authenticated');

create policy "Authenticated users have full access" on review_history
  for all using (auth.role() = 'authenticated');

create policy "Authenticated users have full access" on website_snapshots
  for all using (auth.role() = 'authenticated');

create policy "Authenticated users have full access" on linkedin_posts
  for all using (auth.role() = 'authenticated');

create policy "Authenticated users have full access" on outreach_attempts
  for all using (auth.role() = 'authenticated');

create policy "Authenticated users have full access" on outreach_summary
  for all using (auth.role() = 'authenticated');

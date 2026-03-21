-- Seed data for Shadow development
-- Run this in Supabase SQL Editor

DO $$
DECLARE
  c1 uuid := gen_random_uuid();
  c2 uuid := gen_random_uuid();
  c3 uuid := gen_random_uuid();
  c4 uuid := gen_random_uuid();
  c5 uuid := gen_random_uuid();
  c6 uuid := gen_random_uuid();
  c7 uuid := gen_random_uuid();
  c8 uuid := gen_random_uuid();
  c9 uuid := gen_random_uuid();
  c10 uuid := gen_random_uuid();
BEGIN

-- Insert 10 test companies
INSERT INTO companies (id, pitchbook_id, status, review_count) VALUES
  (c1, 'PB-001', 'pending', 0),
  (c2, 'PB-002', 'pending', 1),
  (c3, 'PB-003', 'pending', 2),
  (c4, 'PB-004', 'pending', 0),
  (c5, 'PB-005', 'pending', 3),
  (c6, 'PB-006', 'pending', 1),
  (c7, 'PB-007', 'pending', 0),
  (c8, 'PB-008', 'HVT', 1),
  (c9, 'PB-009', 'HVT', 2),
  (c10, 'PB-010', 'pending', 0)
ON CONFLICT (pitchbook_id) DO NOTHING;

-- Insert latest snapshots
INSERT INTO company_snapshots (company_id, snapshot_date, is_latest, name, website, linkedin_url, pitchbook_url, ceo_name, ceo_linkedin_url, ceo_email, ceo_phone, founded_year, location, headcount, headcount_growth_1yr, headcount_growth_2yr, total_capital_raised, last_round_valuation, last_round_amount_raised, previous_investors, what_they_do, passed_headcount_filter, passed_llm_filter) VALUES
  (c1, '2026-03-01', true,
   'Aether Analytics', 'https://aetheranalytics.com', 'https://linkedin.com/company/aether-analytics', 'https://pitchbook.com/profiles/aether-analytics',
   'Sarah Chen', 'https://linkedin.com/in/sarachen', NULL, NULL,
   2023, 'Austin, TX', 18, 0.45, NULL,
   5000000, 20000000, 3000000, ARRAY['Sequoia Scout', 'Y Combinator'],
   'AI-powered revenue analytics platform for mid-market SaaS companies. Provides predictive churn modeling and expansion revenue forecasting.',
   true, true),

  (c2, '2026-03-01', true,
   'BridgePoint Data', 'https://bridgepointdata.io', 'https://linkedin.com/company/bridgepoint-data', 'https://pitchbook.com/profiles/bridgepoint-data',
   'Marcus Williams', 'https://linkedin.com/in/marcuswilliams', NULL, NULL,
   2022, 'Denver, CO', 24, 0.33, 0.80,
   8000000, 35000000, 5000000, ARRAY['Foundry Group', 'Techstars'],
   'Data integration middleware for healthcare providers. Connects EHR systems with modern analytics tools using FHIR standards.',
   true, true),

  (c3, '2026-03-01', true,
   'Cascade Compliance', 'https://cascadecompliance.com', 'https://linkedin.com/company/cascade-compliance', 'https://pitchbook.com/profiles/cascade-compliance',
   'Jennifer Park', 'https://linkedin.com/in/jenniferpark', NULL, NULL,
   2024, 'Seattle, WA', 12, 0.50, NULL,
   2500000, NULL, 2500000, ARRAY['Madrona Ventures'],
   'Automated compliance monitoring for fintech companies. Tracks regulatory changes across 50 states and generates audit-ready reports.',
   true, true),

  (c4, '2026-03-01', true,
   'Drift Security', 'https://driftsecurity.io', 'https://linkedin.com/company/drift-security', 'https://pitchbook.com/profiles/drift-security',
   'Alex Petrov', 'https://linkedin.com/in/alexpetrov', NULL, NULL,
   2023, 'Boston, MA', 15, 0.25, NULL,
   4000000, 15000000, 4000000, ARRAY['General Catalyst', '.406 Ventures'],
   'Cloud security posture management for multi-cloud environments. Uses graph analysis to identify lateral movement paths and misconfigurations.',
   true, true),

  (c5, '2026-03-01', true,
   'Ember Robotics', 'https://emberrobotics.com', 'https://linkedin.com/company/ember-robotics', 'https://pitchbook.com/profiles/ember-robotics',
   'David Kim', 'https://linkedin.com/in/davidkim', NULL, NULL,
   2021, 'Pittsburgh, PA', 28, 0.12, 0.65,
   12000000, 50000000, 7000000, ARRAY['Lux Capital', 'Eclipse Ventures', 'Carnegie Mellon'],
   'Autonomous warehouse picking robots using computer vision. Handles irregular shaped items that traditional automation cannot.',
   true, true),

  (c6, '2026-03-01', true,
   'Finley Insurance', 'https://finleyinsurance.com', 'https://linkedin.com/company/finley-insurance', 'https://pitchbook.com/profiles/finley-insurance',
   'Rachel Torres', 'https://linkedin.com/in/racheltorres', NULL, NULL,
   2022, 'Chicago, IL', 20, 0.38, 0.90,
   6000000, 25000000, 4000000, ARRAY['Hyde Park Venture Partners', 'Valor Equity'],
   'Embedded insurance API for e-commerce platforms. Enables merchants to offer product protection and shipping insurance at checkout.',
   true, true),

  (c7, '2026-03-01', true,
   'Gradient Labs', 'https://gradientlabs.ai', 'https://linkedin.com/company/gradient-labs', 'https://pitchbook.com/profiles/gradient-labs',
   'Michael Zhang', 'https://linkedin.com/in/michaelzhang', NULL, NULL,
   2024, 'New York, NY', 10, 0.67, NULL,
   3000000, NULL, 3000000, ARRAY['First Round Capital'],
   'LLM fine-tuning platform for enterprise. Provides no-code tools to customize foundation models on proprietary data with built-in evaluation.',
   true, true),

  (c8, '2026-03-01', true,
   'HarborView Analytics', 'https://harborviewanalytics.com', 'https://linkedin.com/company/harborview', 'https://pitchbook.com/profiles/harborview-analytics',
   'Lisa Wang', 'https://linkedin.com/in/lisawang', 'lisa@harborviewanalytics.com', '(415) 555-0187',
   2022, 'San Francisco, CA', 22, 0.29, 0.70,
   10000000, 40000000, 6000000, ARRAY['a16z Scout', 'Greylock'],
   'Supply chain visibility platform for CPG brands. Real-time tracking from manufacturer to retail shelf with demand forecasting.',
   true, true),

  (c9, '2026-03-01', true,
   'Ironclad Payments', 'https://ironcladpay.com', 'https://linkedin.com/company/ironclad-payments', 'https://pitchbook.com/profiles/ironclad-payments',
   'James Foster', 'https://linkedin.com/in/jamesfoster', 'james@ironcladpay.com', '(212) 555-0234',
   2021, 'New York, NY', 26, 0.18, 0.55,
   15000000, 60000000, 8000000, ARRAY['Ribbit Capital', 'QED Investors'],
   'B2B payment orchestration for construction industry. Handles lien waivers, retainage, and progress billing in a single workflow.',
   true, true),

  (c10, '2026-03-01', true,
   'Juniper Health', 'https://juniperhealth.io', 'https://linkedin.com/company/juniper-health', 'https://pitchbook.com/profiles/juniper-health',
   'Emily Rodriguez', 'https://linkedin.com/in/emilyrodriguez', NULL, NULL,
   2023, 'Nashville, TN', 14, 0.40, NULL,
   3500000, 12000000, 3500000, ARRAY['Martin Ventures', 'Jumpstart Health'],
   'Patient engagement platform for behavioral health clinics. Automates appointment reminders, outcome tracking, and insurance verification.',
   true, true);

-- Outreach data for HVT companies
INSERT INTO outreach_summary (company_id, outreach_count, last_outreach_at, days_since_last_activity, any_opens) VALUES
  (c8, 3, '2026-03-10', 10, true),
  (c9, 2, '2026-02-28', 20, false);

-- Website snapshots for HVT companies
INSERT INTO website_snapshots (company_id, checked_at, content_hash, change_detected, change_summary) VALUES
  (c8, '2026-03-15', 'abc123', true, 'Added new Enterprise pricing tier and case study with Walmart. Appears to be moving upmarket.'),
  (c9, '2026-03-15', 'def456', false, NULL);

-- LinkedIn posts for HVT companies
INSERT INTO linkedin_posts (company_id, post_type, posted_by, post_content, post_url, posted_at) VALUES
  (c8, 'ceo', 'Lisa Wang', 'Excited to announce our Series A! Thrilled to partner with amazing investors to scale supply chain visibility.', 'https://linkedin.com/posts/lisawang-1', '2026-03-12'),
  (c8, 'company', 'HarborView Analytics', 'We are hiring! Looking for senior engineers to join our growing team in SF.', 'https://linkedin.com/posts/harborview-1', '2026-03-08'),
  (c9, 'ceo', 'James Foster', 'Construction payments are broken. We are fixing them.', 'https://linkedin.com/posts/jamesfoster-1', '2026-03-05');

-- Review history
INSERT INTO review_history (company_id, classification, reviewed_at) VALUES
  (c2, 'PS', '2025-12-15'),
  (c3, 'PT', '2025-11-20'),
  (c3, 'PT', '2026-01-10'),
  (c5, 'PS', '2025-09-01'),
  (c5, 'PT', '2025-12-01'),
  (c5, 'PS', '2026-03-01'),
  (c6, 'PT', '2026-01-15'),
  (c8, 'HVT', '2026-02-01'),
  (c9, 'HVT', '2025-10-15'),
  (c9, 'PS', '2025-07-01');

END $$;

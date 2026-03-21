export type CompanyStatus = "pending" | "HVT" | "PM" | "PS" | "PT" | "PL";
export type PostType = "company" | "ceo";

export interface Company {
  id: string;
  pitchbook_id: string;
  created_at: string;
  updated_at: string;
  status: CompanyStatus;
  review_count: number;
}

export interface CompanySnapshot {
  id: string;
  company_id: string;
  snapshot_date: string;
  is_latest: boolean;
  name: string | null;
  website: string | null;
  linkedin_url: string | null;
  pitchbook_url: string | null;
  ceo_name: string | null;
  ceo_linkedin_url: string | null;
  ceo_email: string | null;
  ceo_phone: string | null;
  founded_year: number | null;
  location: string | null;
  headcount: number | null;
  headcount_growth_1yr: number | null;
  headcount_growth_2yr: number | null;
  total_capital_raised: number | null;
  last_round_valuation: number | null;
  last_round_amount_raised: number | null;
  previous_investors: string[] | null;
  what_they_do: string | null;
  passed_headcount_filter: boolean;
  passed_llm_filter: boolean;
}

export interface ReviewHistory {
  id: string;
  company_id: string;
  classification: CompanyStatus;
  reviewed_at: string;
  requeue_date: string | null;
}

export interface WebsiteSnapshot {
  id: string;
  company_id: string;
  checked_at: string;
  content_hash: string | null;
  change_detected: boolean;
  change_summary: string | null;
  raw_content: string | null;
}

export interface LinkedInPost {
  id: string;
  company_id: string;
  post_type: PostType | null;
  posted_by: string | null;
  post_content: string | null;
  post_url: string | null;
  posted_at: string | null;
  detected_at: string;
}

export interface OutreachAttempt {
  id: string;
  company_id: string;
  gmail_draft_id: string | null;
  drafted_at: string | null;
  sent_at: string | null;
  hubspot_email_id: string | null;
  email_opened: boolean;
  opened_at: string | null;
}

export interface OutreachSummary {
  id: string;
  company_id: string;
  outreach_count: number;
  last_outreach_at: string | null;
  days_since_last_activity: number | null;
  any_opens: boolean;
  last_synced_at: string | null;
}

// Joined type for the Do for Review dashboard
export interface ReviewCompany extends Company {
  snapshot: CompanySnapshot;
}

// Joined type for the HVT dashboard
export interface HVTCompany extends Company {
  snapshot: CompanySnapshot;
  outreach: OutreachSummary | null;
  latest_website_change: WebsiteSnapshot | null;
  recent_posts: LinkedInPost[];
}

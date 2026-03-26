"""
Script 5 — Crust Data Enrichment
Enriches HVT companies with comprehensive data from Crust Data API.
Uses 2 API calls per company to stay under URL length limits.
"""

import logging
import time
from datetime import datetime
import httpx
from config import CRUSTDATA_API_KEY
from db import update_snapshot

logging.basicConfig(level=logging.INFO, format="%(asctime)s [CrustData] %(message)s")
log = logging.getLogger(__name__)

CRUSTDATA_BASE_URL = "https://api.crustdata.com"

# All fields in a single API call — fits within URL length limits
ALL_FIELDS = ",".join([
    "company_name",
    # Headcount
    "headcount.linkedin_headcount",
    "headcount.linkedin_headcount_total_growth_percent.mom",
    "headcount.linkedin_headcount_total_growth_percent.six_months",
    "headcount.linkedin_headcount_total_growth_percent.yoy",
    "headcount.linkedin_headcount_by_role_absolute",
    "headcount.linkedin_headcount_by_role_percent",
    "headcount.linkedin_headcount_by_region_absolute",
    "headcount.linkedin_headcount_by_region_percent",
    "headcount.linkedin_headcount_timeseries",
    # Web Traffic
    "web_traffic.monthly_visitors",
    "web_traffic.monthly_visitor_mom_pct",
    "web_traffic.monthly_visitor_qoq_pct",
    "web_traffic.traffic_source_social_pct",
    "web_traffic.traffic_source_search_pct",
    "web_traffic.traffic_source_direct_pct",
    "web_traffic.traffic_source_paid_referral_pct",
    "web_traffic.traffic_source_referral_pct",
    "web_traffic.monthly_visitors_timeseries",
    # Competitors
    "competitors.competitor_website_domains",
    "competitors.paid_seo_competitors_website_domains",
    "competitors.organic_seo_competitors_website_domains",
    # Founders
    "founders.profiles",
    "founders.founders_locations",
    "founders.founders_education_institute",
    "founders.founders_degree_name",
    "founders.founders_previous_companies",
    # People
    "decision_makers",
    "cxos",
    # Funding
    "funding_and_investment.crunchbase_total_investment_usd",
    "funding_and_investment.last_funding_round_type",
    "funding_and_investment.last_funding_round_investment_usd",
    "funding_and_investment.crunchbase_investors",
    "funding_and_investment.crunchbase_investors_info_list",
    "funding_and_investment.days_since_last_fundraise",
    "funding_and_investment.funding_milestones_timeseries",
    "funding_and_investment.acquired_by",
    "funding_and_investment.acquisitions",
    # SEO
    "seo.average_seo_organic_rank",
    "seo.monthly_paid_clicks",
    "seo.monthly_organic_clicks",
    "seo.average_ad_rank",
    "seo.total_organic_results",
    "seo.monthly_google_ads_budget",
    "seo.monthly_organic_value",
    "seo.total_ads_purchased",
    "seo.lost_ranked_seo_keywords",
    "seo.gained_ranked_seo_keywords",
    "seo.newly_ranked_seo_keywords",
    # Other
    "news_articles",
    "estimated_revenue_timeseries",
])


def enrich_company(domain: str) -> dict | None:
    """
    Pull all data for a company in a single API call.
    Returns the full response dict or None on failure.
    """
    if not CRUSTDATA_API_KEY:
        return None

    try:
        response = httpx.get(
            f"{CRUSTDATA_BASE_URL}/screener/company",
            params={"company_domain": domain, "fields": ALL_FIELDS},
            headers={"Authorization": f"Token {CRUSTDATA_API_KEY}", "Accept": "application/json"},
            timeout=60,
        )
        response.raise_for_status()
        data = response.json()
        if isinstance(data, list) and len(data) > 0:
            try:
                from usage_logger import log_crustdata_usage
                log_crustdata_usage("company_enrichment", domain)
            except Exception:
                pass
            return data[0]
        elif isinstance(data, dict) and "error" in data:
            log.warning(f"  API error: {data['error'][:100]}")
            try:
                from usage_logger import log_crustdata_usage
                log_crustdata_usage("company_enrichment", domain, success=False, error_message=str(data['error'])[:200])
            except Exception:
                pass
            return None
        return None
    except httpx.HTTPStatusError as e:
        log.warning(f"  API error ({e.response.status_code})")
        try:
            from usage_logger import log_crustdata_usage
            log_crustdata_usage("company_enrichment", domain, success=False, error_message=f"HTTP {e.response.status_code}")
        except Exception:
            pass
        return None
    except Exception as e:
        log.error(f"  Request failed: {e}")
        return None


def extract_domain(website: str) -> str | None:
    """Extract clean domain from website URL."""
    if not website:
        return None
    website = website.strip()
    for prefix in ["https://", "http://", "www."]:
        if website.lower().startswith(prefix):
            website = website[len(prefix):]
    website = website.split("/")[0]
    return website if website else None


def run(company_ids: list[str] = None) -> dict:
    """
    Enriches HVT companies (or specific company IDs) with Crust Data.
    Stores full API response as JSONB in crustdata_enrichment column.
    """
    from config import get_supabase

    sb = get_supabase()
    stats = {"enriched": 0, "skipped": 0, "errors": 0}

    if not CRUSTDATA_API_KEY:
        log.warning("CRUSTDATA_API_KEY not set — skipping enrichment")
        return stats

    if company_ids:
        companies_data = []
        for cid in company_ids:
            snap = sb.table("company_snapshots").select("*").eq("company_id", cid).eq("is_latest", True).execute()
            if snap.data:
                companies_data.append({"id": cid, "snapshot": snap.data[0]})
    else:
        hvt_companies = sb.table("companies").select("id,status").eq("status", "HVT").execute()
        companies_data = []
        for c in hvt_companies.data:
            snap = sb.table("company_snapshots").select("*").eq("company_id", c["id"]).eq("is_latest", True).execute()
            if snap.data:
                companies_data.append({"id": c["id"], "snapshot": snap.data[0]})

    log.info(f"Found {len(companies_data)} companies to enrich")

    for company in companies_data:
        snapshot = company["snapshot"]
        name = snapshot.get("name", "Unknown")

        # Skip if already enriched (unless explicitly requested)
        if snapshot.get("crustdata_enriched_at") and not company_ids:
            log.info(f"  Skipping {name} — already enriched")
            stats["skipped"] += 1
            continue

        website = snapshot.get("website", "")
        domain = extract_domain(website)
        if not domain:
            log.warning(f"  No domain for {name} — skipping")
            stats["skipped"] += 1
            continue

        try:
            log.info(f"Enriching: {name} ({domain})")
            data = enrich_company(domain)

            if data and "error" not in data:
                update_snapshot(snapshot["id"], {
                    "crustdata_enrichment": data,
                    "crustdata_enriched_at": datetime.utcnow().isoformat(),
                })

                # Update key snapshot fields
                update_fields = {}
                hc = data.get("headcount", {})
                if isinstance(hc, dict):
                    li_hc = hc.get("linkedin_headcount")
                    if li_hc:
                        update_fields["headcount"] = li_hc
                    growth = hc.get("linkedin_headcount_total_growth_percent", {})
                    if isinstance(growth, dict) and growth.get("yoy") is not None:
                        update_fields["headcount_growth_1yr"] = round(growth["yoy"], 1)

                dms = data.get("decision_makers", [])
                if isinstance(dms, list):
                    for dm in dms:
                        title = (dm.get("title") or "").lower()
                        if "ceo" in title or "chief executive" in title or "founder" in title:
                            update_fields["ceo_name"] = dm.get("name")
                            update_fields["ceo_linkedin_url"] = dm.get("linkedin_flagship_url") or dm.get("linkedin_profile_url")
                            break

                if update_fields:
                    update_snapshot(snapshot["id"], update_fields)

                stats["enriched"] += 1
                log.info(f"  ✓ Enriched: {name}")
            else:
                stats["errors"] += 1
                log.warning(f"  ✗ No data for {name}")

            time.sleep(1)

        except Exception as e:
            log.error(f"Error enriching {name}: {e}")
            stats["errors"] += 1

    log.info(f"Crust Data enrichment complete: {stats['enriched']} enriched, "
             f"{stats['skipped']} skipped, {stats['errors']} errors")
    return stats


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1:
        run(company_ids=sys.argv[1:])
    else:
        run()

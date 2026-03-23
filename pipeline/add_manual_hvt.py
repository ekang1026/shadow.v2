"""
Manual HVT Add — Takes a company website URL and runs the full pipeline:
1. Scrape website for content
2. Find LinkedIn URL from website
3. Scrape LinkedIn pre-paywall for headcount
4. Run LLM survey
5. Run competitor research
6. Save company with HVT status

Usage:
    python3 add_manual_hvt.py https://archiveintel.com

Returns JSON to stdout for the calling API.

TODO (future):
- When PitchBook login is configured, also pull all PitchBook data for the company
- When Crust Data API key is provided, enrich with Crust Data (CEO info, LinkedIn posts, etc.)
"""

import json
import logging
import re
import sys
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup

from config import ANTHROPIC_API_KEY, LLM_MODEL, get_supabase
from db import create_snapshot, update_snapshot

logging.basicConfig(level=logging.INFO, format="%(asctime)s [ManualHVT] %(message)s")
log = logging.getLogger(__name__)


def normalize_url(url: str) -> str:
    """Ensure URL has a scheme."""
    if not url.startswith("http"):
        url = f"https://{url}"
    return url


def extract_domain(url: str) -> str:
    """Extract clean domain from URL."""
    parsed = urlparse(normalize_url(url))
    domain = parsed.netloc.replace("www.", "")
    return domain


def extract_company_name(url: str, html_text: str) -> str:
    """Try to extract company name from website."""
    # Try <title> tag
    try:
        soup = BeautifulSoup(html_text, "html.parser")
        title = soup.find("title")
        if title and title.string:
            name = title.string.strip().split("|")[0].split("-")[0].split("::")[0].strip()
            if name and len(name) < 60:
                return name
    except:
        pass
    # Fallback to domain name
    domain = extract_domain(url)
    return domain.split(".")[0].title()


def find_linkedin_url(html_text: str, domain: str) -> str | None:
    """Find LinkedIn company URL from website HTML."""
    # Look for LinkedIn URLs in the page
    patterns = [
        r'https?://(?:www\.)?linkedin\.com/company/[a-zA-Z0-9_-]+/?',
    ]
    for pattern in patterns:
        matches = re.findall(pattern, html_text)
        if matches:
            # Return the first unique company LinkedIn URL
            return matches[0].rstrip("/")
    return None


def scrape_website(url: str) -> tuple[str, str]:
    """Scrape website and return (raw_html, clean_text)."""
    url = normalize_url(url)
    headers = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"}
    resp = requests.get(url, headers=headers, timeout=15)
    resp.raise_for_status()
    raw_html = resp.text

    soup = BeautifulSoup(raw_html, "html.parser")
    for tag in soup(["script", "style", "nav", "footer", "header", "noscript"]):
        tag.decompose()
    clean_text = soup.get_text(separator=" ", strip=True)[:10000]

    return raw_html, clean_text


def scrape_linkedin_prepaywall(linkedin_url: str) -> dict:
    """Scrape LinkedIn company page pre-paywall using headed browser."""
    try:
        sys.path.insert(0, "/Users/glp/Gray Line/Shadow")
        from automation.data_providers.linkedin.scraper import LinkedInScraper
        from automation.common.playwright_browser import PlaywrightBrowser, BrowserConfig

        scraper = LinkedInScraper()
        config = BrowserConfig(headless=False)
        browser_mgr = PlaywrightBrowser(config)

        with browser_mgr.launch() as (_, page):
            data = scraper.scrape_company_page(page, linkedin_url, logged_in=False)

        result = {}
        # Parse employee count from Company_size field
        company_size = data.get("Company_size") or data.get("Employee_count")
        if company_size:
            size_str = str(company_size)
            # Handle formats like "51-200 employees", "11-50", or just "5"
            numbers = re.findall(r'\d+', size_str.replace(",", ""))
            if numbers:
                # Use the first number as headcount estimate
                result["headcount"] = int(numbers[0])

        # Also try Employee_count directly
        emp_count = data.get("Employee_count")
        if emp_count and isinstance(emp_count, (int, float)):
            result["headcount"] = int(emp_count)
        elif emp_count and str(emp_count).isdigit():
            result["headcount"] = int(emp_count)

        result["extra"] = {
            "linkedin_industry": data.get("Industry") or data.get("Headline"),
            "linkedin_hq": data.get("Headquarters"),
            "linkedin_company_size": data.get("Company_size"),
            "linkedin_founded": data.get("Founded"),
            "linkedin_about": (data.get("About_us") or "")[:500],
            "linkedin_type": data.get("Type"),
            "linkedin_specialties": data.get("Specialties"),
        }

        return result

    except Exception as e:
        log.warning(f"LinkedIn scrape failed: {e}")
        return {}


def run_llm_survey(company_name: str, website_text: str) -> dict | None:
    """Run the LLM sourcing survey."""
    from anthropic import Anthropic
    from script4_llm import classify_company, load_sourcing_prompt

    client = Anthropic(api_key=ANTHROPIC_API_KEY)
    prompt_template = load_sourcing_prompt()
    return classify_company(client, prompt_template, company_name, website_text)


def run_competitor_research(company_name: str, website_text: str, survey: dict) -> tuple[list, str]:
    """Run competitor research."""
    from anthropic import Anthropic
    from script4_llm import research_competitors

    client = Anthropic(api_key=ANTHROPIC_API_KEY)
    return research_competitors(client, company_name, website_text, survey)


def add_hvt(url: str) -> dict:
    """
    Main function: add a company as HVT from a URL.
    Returns result dict with company info.
    """
    sb = get_supabase()
    url = normalize_url(url)
    domain = extract_domain(url)

    log.info(f"Adding manual HVT: {url}")

    # Step 1: Scrape website
    log.info("Step 1: Scraping website...")
    try:
        raw_html, website_text = scrape_website(url)
    except Exception as e:
        return {"success": False, "error": f"Failed to scrape website: {e}"}

    company_name = extract_company_name(url, raw_html)
    log.info(f"  Company name: {company_name}")

    # Step 2: Find LinkedIn URL
    log.info("Step 2: Finding LinkedIn URL...")
    linkedin_url = find_linkedin_url(raw_html, domain)
    log.info(f"  LinkedIn URL: {linkedin_url or 'Not found'}")

    # Step 3: Scrape LinkedIn pre-paywall
    linkedin_data = {}
    if linkedin_url:
        log.info("Step 3: Scraping LinkedIn pre-paywall...")
        linkedin_data = scrape_linkedin_prepaywall(linkedin_url)
        log.info(f"  Headcount: {linkedin_data.get('headcount', 'N/A')}")
    else:
        log.info("Step 3: Skipping LinkedIn (no URL found)")

    # Step 4: Run LLM survey
    log.info("Step 4: Running LLM survey...")
    survey = run_llm_survey(company_name, website_text)

    survey_fields = {}
    what_they_do = ""
    if survey:
        from script4_llm import extract_survey_fields, build_what_they_do
        survey_fields = extract_survey_fields(survey)
        what_they_do = build_what_they_do(survey)
        log.info(f"  Survey complete: {survey_fields.get('market_focus', 'N/A')}")
    else:
        log.warning("  LLM survey failed")

    # Step 5: Competitor research
    log.info("Step 5: Researching competitors...")
    competitors, comp_confidence = [], "LOW"
    if survey:
        competitors, comp_confidence = run_competitor_research(company_name, website_text, survey)
        log.info(f"  Competitors ({comp_confidence}): {', '.join(c['name'] for c in competitors)}")

    # Step 6: Create company and snapshot
    log.info("Step 6: Saving to database...")

    # Check if company already exists by domain
    existing = sb.table("companies").select("*").execute().data
    company_id = None
    for c in existing:
        # Check snapshots for matching website
        snaps = sb.table("company_snapshots").select("website").eq("company_id", c["id"]).eq("is_latest", True).execute().data
        if snaps and snaps[0].get("website"):
            existing_domain = extract_domain(snaps[0]["website"])
            if existing_domain == domain:
                company_id = c["id"]
                # Update status to HVT
                sb.table("companies").update({"status": "HVT"}).eq("id", company_id).execute()
                log.info(f"  Found existing company: {company_id}")
                break

    if not company_id:
        # Create new company
        result = sb.table("companies").insert({
            "pitchbook_id": f"MANUAL-{domain}",
            "status": "HVT",
        }).execute()
        company_id = result.data[0]["id"]
        log.info(f"  Created new company: {company_id}")

    # Build snapshot data
    snapshot_data = {
        "name": company_name,
        "website": url,
        "linkedin_url": linkedin_url,
        "what_they_do": what_they_do,
        "passed_llm_filter": True,
        "passed_headcount_filter": True,
        "competitors": competitors,
        "competitor_confidence": comp_confidence,
        "llm_survey": survey,
        **survey_fields,
    }

    # Add LinkedIn data
    if linkedin_data:
        snapshot_data["headcount"] = linkedin_data.get("headcount")
        extra = linkedin_data.get("extra", {})
        if extra.get("linkedin_about"):
            snapshot_data["what_they_do"] = snapshot_data.get("what_they_do") or extra["linkedin_about"]

    create_snapshot(company_id, snapshot_data)
    log.info(f"  Snapshot saved for {company_name}")

    result = {
        "success": True,
        "company_id": company_id,
        "company_name": company_name,
        "website": url,
        "linkedin_url": linkedin_url,
        "headcount": linkedin_data.get("headcount"),
        "competitors": [c["name"] for c in competitors],
        "competitor_confidence": comp_confidence,
        "survey_passed": survey is not None,
    }

    log.info(f"Done! {company_name} added as HVT.")
    return result


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 add_manual_hvt.py <website_url>")
        sys.exit(1)

    result = add_hvt(sys.argv[1])
    print(json.dumps(result, indent=2))

"""
Script 3 — Domain/Website Scraper + Google Ads Competitor Finder
Scrapes company websites for content that will be processed by the LLM in Script 4.
Also searches Google for AdWords competitors bidding on the company name.
"""

import logging
import time
import requests
from bs4 import BeautifulSoup
from db import get_companies_with_latest_snapshots, update_snapshot

logging.basicConfig(level=logging.INFO, format="%(asctime)s [Domain] %(message)s")
log = logging.getLogger(__name__)

# Elements to strip from pages (nav, footer, scripts, etc.)
STRIP_TAGS = ["script", "style", "nav", "footer", "header", "noscript", "iframe",
              "svg", "form", "button", "input"]

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}


def scrape_website(url: str, timeout: int = 15) -> str | None:
    """
    Fetch and extract clean text content from a website.
    Returns cleaned text or None on failure.
    """
    try:
        # Ensure URL has protocol
        if not url.startswith("http"):
            url = f"https://{url}"

        response = requests.get(url, headers=HEADERS, timeout=timeout, allow_redirects=True)
        response.raise_for_status()

        soup = BeautifulSoup(response.text, "html.parser")

        # Remove unwanted elements
        for tag in STRIP_TAGS:
            for el in soup.find_all(tag):
                el.decompose()

        # Extract text
        text = soup.get_text(separator="\n", strip=True)

        # Clean up: remove excessive whitespace and blank lines
        lines = [line.strip() for line in text.split("\n") if line.strip()]
        clean_text = "\n".join(lines)

        # Truncate to ~10k chars to keep LLM costs reasonable
        if len(clean_text) > 10000:
            clean_text = clean_text[:10000] + "\n\n[Content truncated]"

        return clean_text

    except requests.RequestException as e:
        log.warning(f"Failed to scrape {url}: {e}")
        return None


def find_google_ad_competitors(company_name: str, company_domain: str = "") -> list[dict]:
    """
    Search for competitors by checking Google Ads via SerpAPI (if key is set)
    or by scraping Bing ads (which doesn't block bots like Google does).

    Returns list of dicts: [{"name": "Competitor Inc", "url": "competitor.com", "ad_text": "..."}]
    """
    import os
    competitors = []
    own_domain = company_domain.replace("https://", "").replace("http://", "").replace("www.", "").split("/")[0].lower() if company_domain else ""

    # Excluded domains — not competitors, just data aggregators
    EXCLUDED_DOMAINS = {"tracxn.com", "alphasense.com", "crunchbase.com", "pitchbook.com",
                        "linkedin.com", "facebook.com", "twitter.com", "x.com",
                        "wikipedia.org", "bing.com", "google.com", "youtube.com",
                        "glassdoor.com", "indeed.com", "zoominfo.com", "bloomberg.com"}

    def is_excluded(domain: str) -> bool:
        domain = domain.lower().replace("www.", "")
        return any(excl in domain for excl in EXCLUDED_DOMAINS)

    # --- Method 1: Bing Ads (free, no API key needed) ---
    try:
        bing_url = f"https://www.bing.com/search?q={requests.utils.quote(company_name)}"
        resp = requests.get(bing_url, headers=HEADERS, timeout=10)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")

        # Bing ads are in <li class="b_ad"> or <ol id="b_results"> with class "b_ad"
        ad_elements = soup.find_all("li", class_="b_ad")
        # Also check for the ads container
        ads_container = soup.find("ul", id="b_results")
        if not ad_elements and ads_container:
            ad_elements = ads_container.find_all("li", class_="b_ad")

        # Alternative: look for "Ad" badge markers
        if not ad_elements:
            ad_markers = soup.find_all("span", string=lambda t: t and t.strip() in ("Ad", "Ads"))
            for marker in ad_markers:
                parent = marker
                for _ in range(8):
                    parent = parent.find_parent()
                    if not parent:
                        break
                    if parent.name == "li":
                        ad_elements.append(parent)
                        break

        for ad in ad_elements:
            links = ad.find_all("a", href=True)
            for link in links:
                href = link.get("href", "")
                text = link.get_text(strip=True)

                if not text or len(text) < 5 or not href.startswith("http"):
                    continue

                domain = href.split("//")[-1].split("/")[0].replace("www.", "").lower()

                if own_domain and own_domain in domain:
                    continue
                if is_excluded(domain):
                    continue
                if any(c["url"] == domain for c in competitors):
                    continue

                # Get ad description text
                ad_desc = ad.get_text(strip=True)[:200] if ad else ""

                competitors.append({
                    "name": text[:100],
                    "url": domain,
                    "ad_text": ad_desc[:200],
                })
                break  # One link per ad block

    except Exception as e:
        log.warning(f"Bing ads search failed for '{company_name}': {e}")

    # --- Method 2: SerpAPI for Google Ads (if API key is set) ---
    serpapi_key = os.getenv("SERPAPI_KEY", "")
    if serpapi_key and not competitors:
        try:
            serp_url = "https://serpapi.com/search.json"
            params = {
                "q": company_name,
                "api_key": serpapi_key,
                "engine": "google",
                "num": 10,
            }
            resp = requests.get(serp_url, params=params, timeout=15)
            resp.raise_for_status()
            data = resp.json()

            for ad in data.get("ads", []):
                domain = ad.get("displayed_link", "").replace("https://", "").replace("http://", "").split("/")[0].replace("www.", "").lower()
                if own_domain and own_domain in domain:
                    continue
                if is_excluded(domain):
                    continue
                if any(c["url"] == domain for c in competitors):
                    continue

                competitors.append({
                    "name": ad.get("title", "")[:100],
                    "url": domain,
                    "ad_text": ad.get("description", "")[:200],
                })
        except Exception as e:
            log.warning(f"SerpAPI search failed for '{company_name}': {e}")

    # Limit to top 5 competitors
    competitors = competitors[:5]
    if competitors:
        log.info(f"  Found {len(competitors)} ad competitors for '{company_name}'")
        for c in competitors:
            log.info(f"    → {c['name']} ({c['url']})")
    else:
        log.info(f"  No ad competitors found for '{company_name}'")

    return competitors


def run() -> dict:
    """
    Main entry point.
    Scrapes websites for companies that passed the headcount filter.
    Returns list of (company_id, snapshot_id, website_text) for Script 4.
    """
    stats = {"scraped": 0, "failed": 0, "skipped": 0}
    results = []

    # Get pending companies that passed headcount filter
    companies = get_companies_with_latest_snapshots(status="pending")
    log.info(f"Found {len(companies)} pending companies")

    for company in companies:
        snapshot = company.get("snapshot")
        if not snapshot:
            stats["skipped"] += 1
            continue

        # Only scrape companies that passed headcount filter
        if not snapshot.get("passed_headcount_filter"):
            stats["skipped"] += 1
            continue

        # Skip if already has LLM data
        if snapshot.get("what_they_do"):
            log.debug(f"Skipping {snapshot.get('name')} — already has LLM summary")
            stats["skipped"] += 1
            continue

        website = snapshot.get("website")
        if not website:
            log.debug(f"Skipping {snapshot.get('name')} — no website URL")
            stats["skipped"] += 1
            continue

        log.info(f"Scraping: {snapshot.get('name')} ({website})")
        text = scrape_website(website)

        if text:
            # Also search for Google Ads competitors
            company_name = snapshot.get("name", "Unknown")
            log.info(f"Searching Google Ads for competitors of: {company_name}")
            ad_competitors = find_google_ad_competitors(company_name, website)

            results.append({
                "company_id": company["id"],
                "snapshot_id": snapshot["id"],
                "name": company_name,
                "website": website,
                "text": text,
                "ad_competitors": ad_competitors,
            })
            stats["scraped"] += 1
        else:
            stats["failed"] += 1

    log.info(f"Domain scraping complete: {stats['scraped']} scraped, "
             f"{stats['failed']} failed, {stats['skipped']} skipped")
    return {"stats": stats, "results": results}


if __name__ == "__main__":
    output = run()
    print(f"\nScraped {len(output['results'])} websites successfully")

"""
Script 3 — Domain/Website Scraper + Google Ads Competitor Finder
Scrapes company websites for content that will be processed by the LLM in Script 4.
Also stores website snapshots for weekly change detection.
"""

import hashlib
import logging
import time
import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse
from db import get_companies_with_latest_snapshots, update_snapshot

logging.basicConfig(level=logging.INFO, format="%(asctime)s [Domain] %(message)s")
log = logging.getLogger(__name__)

# Elements to strip from pages
STRIP_TAGS = ["script", "style", "nav", "footer", "header", "noscript", "iframe",
              "svg", "form", "button", "input"]

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}

# Key pages to scrape beyond the homepage
KEY_PAGES = ["/about", "/pricing", "/product", "/features", "/solutions",
             "/customers", "/company", "/platform", "/why", "/team"]


def scrape_page(url: str, timeout: int = 15) -> str | None:
    """Fetch and extract clean text from a single page."""
    try:
        if not url.startswith("http"):
            url = f"https://{url}"

        response = requests.get(url, headers=HEADERS, timeout=timeout, allow_redirects=True)
        response.raise_for_status()

        soup = BeautifulSoup(response.text, "html.parser")
        for tag in STRIP_TAGS:
            for el in soup.find_all(tag):
                el.decompose()

        text = soup.get_text(separator="\n", strip=True)
        lines = [line.strip() for line in text.split("\n") if line.strip()]
        return "\n".join(lines)

    except requests.RequestException:
        return None


def scrape_website(url: str, timeout: int = 15) -> str | None:
    """Scrape homepage only. Returns cleaned text or None."""
    text = scrape_page(url, timeout)
    if text and len(text) > 10000:
        text = text[:10000] + "\n\n[Content truncated]"
    return text


def deep_scrape_website(url: str, timeout: int = 10) -> dict:
    """
    Scrape homepage + key subpages. Returns dict with:
    - pages: dict mapping page path to content text
    - combined: all text combined
    - pages_scraped: list of paths that returned content
    """
    if not url.startswith("http"):
        url = f"https://{url}"

    base = urlparse(url)
    base_url = f"{base.scheme}://{base.netloc}"

    pages = {}
    pages_scraped = []

    # Homepage
    homepage_text = scrape_page(url, timeout)
    if homepage_text:
        pages["/"] = homepage_text
        pages_scraped.append("/")

    # Key subpages
    for path in KEY_PAGES:
        page_url = urljoin(base_url, path)
        text = scrape_page(page_url, timeout=8)
        if text and len(text) > 200:  # Only keep if there's real content
            # Skip if it's just a redirect to homepage (same content)
            if homepage_text and text[:500] == homepage_text[:500]:
                continue
            pages[path] = text
            pages_scraped.append(path)
        time.sleep(0.3)  # Be polite

    # Combine all text
    combined = "\n\n".join(f"--- {path} ---\n{text}" for path, text in pages.items())
    if len(combined) > 15000:
        combined = combined[:15000] + "\n\n[Content truncated]"

    return {
        "pages": pages,
        "combined": combined,
        "pages_scraped": pages_scraped,
    }


def content_hash(text: str) -> str:
    """Generate a hash of the content for comparison."""
    # Normalize whitespace before hashing to avoid false positives
    normalized = " ".join(text.split()).lower()
    return hashlib.sha256(normalized.encode()).hexdigest()[:16]


def store_website_snapshot(company_id: str, url: str, scrape_result: dict, previous_snapshot: dict | None = None):
    """Store a website snapshot and detect changes vs previous."""
    from config import get_supabase
    sb = get_supabase()

    combined = scrape_result["combined"]
    current_hash = content_hash(combined)

    snapshot_data = {
        "company_id": company_id,
        "url": url,
        "content_hash": current_hash,
        "raw_content": combined[:50000],  # Cap at 50KB
        "pages_scraped": scrape_result["pages_scraped"],
        "content_by_page": {k: v[:10000] for k, v in scrape_result["pages"].items()},  # Cap per page
        "change_detected": False,
        "change_summary": None,
        "previous_hash": None,
        "diff_added": None,
        "diff_removed": None,
    }

    # Compare with previous snapshot
    if previous_snapshot:
        prev_hash = previous_snapshot.get("content_hash", "")
        snapshot_data["previous_hash"] = prev_hash

        if prev_hash and prev_hash != current_hash:
            snapshot_data["change_detected"] = True

            # Generate a simple diff
            prev_text = previous_snapshot.get("raw_content", "")
            if prev_text:
                prev_lines = set(prev_text.split("\n"))
                curr_lines = set(combined.split("\n"))
                added = curr_lines - prev_lines
                removed = prev_lines - curr_lines

                # Filter out very short lines (noise)
                added = [l for l in added if len(l) > 20]
                removed = [l for l in removed if len(l) > 20]

                snapshot_data["diff_added"] = "\n".join(list(added)[:50])[:5000] if added else None
                snapshot_data["diff_removed"] = "\n".join(list(removed)[:50])[:5000] if removed else None

                # Summarize changes
                summary_parts = []
                if added:
                    summary_parts.append(f"{len(added)} new lines")
                if removed:
                    summary_parts.append(f"{len(removed)} removed lines")
                snapshot_data["change_summary"] = "; ".join(summary_parts) if summary_parts else "Content changed"

                log.info(f"  Website change detected: {snapshot_data['change_summary']}")

    sb.table("website_snapshots").insert(snapshot_data).execute()
    return snapshot_data


def get_latest_website_snapshot(company_id: str) -> dict | None:
    """Get the most recent website snapshot for a company."""
    from config import get_supabase
    sb = get_supabase()
    result = sb.table("website_snapshots") \
        .select("*") \
        .eq("company_id", company_id) \
        .order("checked_at", desc=True) \
        .limit(1) \
        .execute()
    return result.data[0] if result.data else None


def find_google_ad_competitors(company_name: str, company_domain: str = "") -> list[dict]:
    """Search for competitors by checking Bing Ads."""
    import os
    competitors = []
    own_domain = company_domain.replace("https://", "").replace("http://", "").replace("www.", "").split("/")[0].lower() if company_domain else ""

    EXCLUDED_DOMAINS = {"tracxn.com", "alphasense.com", "crunchbase.com", "pitchbook.com",
                        "linkedin.com", "facebook.com", "twitter.com", "x.com",
                        "wikipedia.org", "bing.com", "google.com", "youtube.com",
                        "glassdoor.com", "indeed.com", "zoominfo.com", "bloomberg.com"}

    def is_excluded(domain: str) -> bool:
        domain = domain.lower().replace("www.", "")
        return any(excl in domain for excl in EXCLUDED_DOMAINS)

    try:
        bing_url = f"https://www.bing.com/search?q={requests.utils.quote(company_name)}"
        resp = requests.get(bing_url, headers=HEADERS, timeout=10)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")

        ad_elements = soup.find_all("li", class_="b_ad")
        ads_container = soup.find("ul", id="b_results")
        if not ad_elements and ads_container:
            ad_elements = ads_container.find_all("li", class_="b_ad")

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
                ad_desc = ad.get_text(strip=True)[:200] if ad else ""
                competitors.append({"name": text[:100], "url": domain, "ad_text": ad_desc[:200]})
                break

    except Exception as e:
        log.warning(f"Bing ads search failed for '{company_name}': {e}")

    serpapi_key = os.getenv("SERPAPI_KEY", "")
    if serpapi_key and not competitors:
        try:
            serp_url = "https://serpapi.com/search.json"
            params = {"q": company_name, "api_key": serpapi_key, "engine": "google", "num": 10}
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
                competitors.append({"name": ad.get("title", "")[:100], "url": domain, "ad_text": ad.get("description", "")[:200]})
        except Exception as e:
            log.warning(f"SerpAPI search failed for '{company_name}': {e}")

    competitors = competitors[:5]
    if competitors:
        log.info(f"  Found {len(competitors)} ad competitors for '{company_name}'")
    else:
        log.info(f"  No ad competitors found for '{company_name}'")

    return competitors


def run() -> dict:
    """
    Main entry point.
    Scrapes websites for companies that passed the headcount filter.
    Stores website snapshots for change detection.
    Returns list of (company_id, snapshot_id, website_text) for Script 4.
    """
    stats = {"scraped": 0, "failed": 0, "skipped": 0}
    results = []

    companies = get_companies_with_latest_snapshots(status="pending")
    log.info(f"Found {len(companies)} pending companies")

    for company in companies:
        snapshot = company.get("snapshot")
        if not snapshot:
            stats["skipped"] += 1
            continue

        if not snapshot.get("passed_headcount_filter"):
            stats["skipped"] += 1
            continue

        if snapshot.get("what_they_do"):
            stats["skipped"] += 1
            continue

        website = snapshot.get("website")
        if not website:
            stats["skipped"] += 1
            continue

        log.info(f"Scraping: {snapshot.get('name')} ({website})")

        # Deep scrape for storage
        scrape_result = deep_scrape_website(website)

        if scrape_result["combined"]:
            # Store the snapshot
            prev = get_latest_website_snapshot(company["id"])
            store_website_snapshot(company["id"], website, scrape_result, prev)

            # Search for competitors
            company_name = snapshot.get("name", "Unknown")
            log.info(f"Searching Google Ads for competitors of: {company_name}")
            ad_competitors = find_google_ad_competitors(company_name, website)

            results.append({
                "company_id": company["id"],
                "snapshot_id": snapshot["id"],
                "name": company_name,
                "website": website,
                "text": scrape_result["combined"],
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

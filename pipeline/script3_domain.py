"""
Script 3 — Domain/Website Scraper
Scrapes company websites for content that will be processed by the LLM in Script 4.
"""

import logging
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
            results.append({
                "company_id": company["id"],
                "snapshot_id": snapshot["id"],
                "name": snapshot.get("name", "Unknown"),
                "website": website,
                "text": text,
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

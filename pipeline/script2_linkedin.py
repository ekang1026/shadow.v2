"""
Script 2 — LinkedIn Pre-Paywall Headcount Scraper
Uses the existing Grayline LinkedIn scraper in HEADED mode (visible browser window)
to scrape pre-paywall company data and apply the headcount filter (8-30).

LinkedIn blocks headless browsers, so this runs with a visible Chrome window.
The scraper presses Escape to dismiss the login modal and reads public data.

Usage:
    python3 script2_linkedin.py                    # scrape pending companies
    python3 script2_linkedin.py --limit 5          # scrape up to 5 companies

Requires: The existing automation codebase at LINKEDIN_SCRAPER_PATH.
"""

import sys
import re
import logging
import time
import random
from typing import Optional

from config import HEADCOUNT_MIN, HEADCOUNT_MAX
from db import get_companies_with_latest_snapshots, update_snapshot

logging.basicConfig(level=logging.INFO, format="%(asctime)s [LinkedIn] %(message)s")
log = logging.getLogger(__name__)

# ── Path to the existing Grayline automation codebase ──
LINKEDIN_SCRAPER_PATH = "/Users/glp/Gray Line/Shadow"

# Delay between scrapes to avoid rate limiting
MIN_DELAY = 3
MAX_DELAY = 6


def _add_scraper_to_path():
    """Add the existing automation codebase to sys.path so we can import it."""
    if LINKEDIN_SCRAPER_PATH not in sys.path:
        sys.path.insert(0, LINKEDIN_SCRAPER_PATH)


def _parse_employee_count(raw: Optional[str]) -> Optional[int]:
    """
    Parse employee count from LinkedIn scraper output.
    Handles formats like: "42", "42 employees", "11-50 employees", "1,234"
    """
    if not raw:
        return None
    text = str(raw).strip().lower().replace(",", "")
    try:
        return int(text)
    except ValueError:
        pass
    match = re.search(r"(\d+)", text)
    if match:
        return int(match.group(1))
    return None


def scrape_linkedin_company(page, scraper, browser_mgr, linkedin_url: str) -> dict | None:
    """
    Scrape a single company's LinkedIn page using the existing Grayline scraper.
    Pre-paywall mode: presses Escape to dismiss login modal, reads public data.
    Clears cookies between companies to stay anonymous.
    """
    try:
        # Navigate first, then clear storage (can't clear on about:blank)
        try:
            browser_mgr.clear_storage(page)
        except Exception:
            pass  # OK if clear fails on first run — scraper will navigate anyway

        # Scrape in pre-paywall mode (logged_in=False)
        raw = scraper.scrape_company_page(page, linkedin_url, logged_in=False)

        if not raw:
            return None

        headcount = _parse_employee_count(raw.get("Employee_count"))

        result = {
            "headcount": headcount,
            "industry": raw.get("Industry"),
            "hq": raw.get("Headquarters"),
            "company_size": raw.get("Company_size"),
            "founded": raw.get("Founded"),
            "about": (raw.get("About_us") or "")[:500],
            "specialties": raw.get("Specialties"),
        }
        return result

    except Exception as e:
        log.warning(f"Scraper error for {linkedin_url}: {e}")
        return None


def run(limit: Optional[int] = None) -> dict:
    """
    Main entry point.
    1. Get pending companies with latest snapshots
    2. Scrape LinkedIn pre-paywall data using headed browser
    3. Apply headcount filter (8-30 employees)
    """
    stats = {"scraped": 0, "passed_filter": 0, "filtered_out": 0, "errors": 0, "skipped": 0}

    companies = get_companies_with_latest_snapshots(status="pending")
    log.info(f"Found {len(companies)} pending companies")

    # Filter to only those needing LinkedIn data
    to_scrape = []
    for company in companies:
        snapshot = company.get("snapshot")
        if not snapshot:
            stats["skipped"] += 1
            continue
        if snapshot.get("passed_headcount_filter") is not None and snapshot.get("headcount") is not None:
            stats["skipped"] += 1
            continue
        linkedin_url = snapshot.get("linkedin_url")
        if not linkedin_url:
            log.debug(f"Skipping {snapshot.get('name')} — no LinkedIn URL")
            stats["skipped"] += 1
            continue
        to_scrape.append(company)

    if not to_scrape:
        log.info("No companies need LinkedIn scraping")
        return stats

    if limit:
        to_scrape = to_scrape[:limit]

    log.info(f"{len(to_scrape)} companies to scrape via pre-paywall (headed browser)")

    # Import the existing scraper
    _add_scraper_to_path()
    try:
        from automation.data_providers.linkedin.scraper import LinkedInScraper
        from automation.common.playwright_browser import PlaywrightBrowser, BrowserConfig
    except ImportError as e:
        log.error(f"Cannot import LinkedIn scraper from {LINKEDIN_SCRAPER_PATH}: {e}")
        return stats

    # Launch headed browser (headless=False — visible window, like the old CLI)
    scraper = LinkedInScraper()
    config = BrowserConfig(headless=False)
    browser_mgr = PlaywrightBrowser(config)

    log.info("Launching visible Chrome window for LinkedIn scraping...")

    try:
        with browser_mgr.launch() as (_, page):
            for i, company in enumerate(to_scrape):
                snapshot = company["snapshot"]
                company_name = snapshot.get("name", "Unknown")
                linkedin_url = snapshot["linkedin_url"]

                log.info(f"[{i+1}/{len(to_scrape)}] Scraping: {company_name} ({linkedin_url})")

                try:
                    data = scrape_linkedin_company(page, scraper, browser_mgr, linkedin_url)

                    if not data or data.get("headcount") is None:
                        log.info(f"  ✗ FILTER: {company_name} — no headcount data (N/A)")
                        update_snapshot(snapshot["id"], {
                            "passed_headcount_filter": False,  # Filter out — N/A companies are too small or obsolete
                            "headcount_error": True,
                        })
                        stats["filtered_out"] += 1
                        # Random delay between scrapes
                        delay = random.uniform(MIN_DELAY, MAX_DELAY)
                        time.sleep(delay)
                        continue

                    headcount = data["headcount"]
                    passed = HEADCOUNT_MIN <= headcount <= HEADCOUNT_MAX

                    update_data = {
                        "headcount": headcount,
                        "passed_headcount_filter": passed,
                    }
                    update_snapshot(snapshot["id"], update_data)
                    stats["scraped"] += 1

                    if passed:
                        stats["passed_filter"] += 1
                        log.info(f"  ✓ PASS: {company_name} — {headcount} employees")
                    else:
                        stats["filtered_out"] += 1
                        log.info(f"  ✗ FILTER: {company_name} — {headcount} employees "
                                 f"(outside {HEADCOUNT_MIN}-{HEADCOUNT_MAX})")

                    # Random delay between scrapes
                    delay = random.uniform(MIN_DELAY, MAX_DELAY)
                    time.sleep(delay)

                except Exception as e:
                    log.error(f"Error scraping {company_name}: {e}")
                    update_snapshot(snapshot["id"], {
                        "passed_headcount_filter": False,
                        "headcount_error": True,
                    })
                    stats["errors"] += 1

    except Exception as e:
        log.error(f"Browser launch failed: {e}")
        log.error("Try running: playwright install chromium")
        return stats

    log.info(f"LinkedIn scraping complete: {stats['scraped']} scraped, "
             f"{stats['passed_filter']} passed, {stats['filtered_out']} filtered out, "
             f"{stats['skipped']} skipped, {stats['errors']} errors")
    return stats


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Script 2 — LinkedIn Pre-Paywall Scraper")
    parser.add_argument("--limit", type=int, default=None, help="Max companies to scrape")
    args = parser.parse_args()
    run(limit=args.limit)

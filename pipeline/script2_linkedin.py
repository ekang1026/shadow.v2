"""
Script 2 — LinkedIn Headcount Scraper
Scrapes LinkedIn for headcount and growth data, applies headcount filter (8-30).

TODO: Adapt user's existing LinkedIn scraper logic into this wrapper.
"""

import logging
from config import HEADCOUNT_MIN, HEADCOUNT_MAX
from db import get_companies_with_latest_snapshots, update_snapshot

logging.basicConfig(level=logging.INFO, format="%(asctime)s [LinkedIn] %(message)s")
log = logging.getLogger(__name__)


def scrape_linkedin_company(linkedin_url: str) -> dict | None:
    """
    Scrape a company's LinkedIn page for headcount data.

    TODO: Plug in user's existing LinkedIn scraper logic here.

    Expected return format:
    {
        "headcount": 25,
        "headcount_growth_1yr": 0.35,   # 35% growth
        "headcount_growth_2yr": 0.80,   # 80% growth
    }
    """
    # PLACEHOLDER — replace with actual scraper logic
    log.warning(f"LinkedIn scraper not yet implemented. Skipping: {linkedin_url}")
    return None


def run() -> dict:
    """
    Main entry point.
    1. Get companies that were just ingested (pending, with latest snapshots)
    2. Scrape LinkedIn for headcount data
    3. Apply headcount filter (8-30 employees)
    """
    stats = {"scraped": 0, "passed_filter": 0, "filtered_out": 0, "errors": 0, "skipped": 0}

    # Get pending companies with snapshots
    companies = get_companies_with_latest_snapshots(status="pending")
    log.info(f"Found {len(companies)} pending companies to check")

    for company in companies:
        snapshot = company.get("snapshot")
        if not snapshot:
            stats["skipped"] += 1
            continue

        # Skip if already has headcount data and filter applied
        if snapshot.get("passed_headcount_filter") is not None and snapshot.get("headcount") is not None:
            log.debug(f"Skipping {snapshot.get('name')} — already has headcount data")
            stats["skipped"] += 1
            continue

        linkedin_url = snapshot.get("linkedin_url")
        if not linkedin_url:
            log.debug(f"Skipping {snapshot.get('name')} — no LinkedIn URL")
            stats["skipped"] += 1
            continue

        try:
            # Scrape LinkedIn
            data = scrape_linkedin_company(linkedin_url)
            if not data:
                stats["skipped"] += 1
                continue

            headcount = data.get("headcount")
            growth_1yr = data.get("headcount_growth_1yr")
            growth_2yr = data.get("headcount_growth_2yr")

            # Apply headcount filter
            passed = headcount is not None and HEADCOUNT_MIN <= headcount <= HEADCOUNT_MAX

            # Update snapshot
            update_data = {
                "headcount": headcount,
                "headcount_growth_1yr": growth_1yr,
                "headcount_growth_2yr": growth_2yr,
                "passed_headcount_filter": passed,
            }
            update_snapshot(snapshot["id"], update_data)
            stats["scraped"] += 1

            if passed:
                stats["passed_filter"] += 1
                log.info(f"PASS: {snapshot.get('name')} — {headcount} employees")
            else:
                stats["filtered_out"] += 1
                log.info(f"FILTER: {snapshot.get('name')} — {headcount} employees (outside {HEADCOUNT_MIN}-{HEADCOUNT_MAX})")

        except Exception as e:
            log.error(f"Error scraping {snapshot.get('name')}: {e}")
            stats["errors"] += 1

    log.info(f"LinkedIn scraping complete: {stats['scraped']} scraped, "
             f"{stats['passed_filter']} passed filter, {stats['filtered_out']} filtered out, "
             f"{stats['skipped']} skipped, {stats['errors']} errors")
    return stats


if __name__ == "__main__":
    run()

"""
Script 6 — HVT Weekly Monitor
Re-scrapes HVT company websites to detect changes.
Runs weekly to flag website updates for the Intel column.
"""

import logging
import time
from script3_domain import deep_scrape_website, store_website_snapshot, get_latest_website_snapshot
from db import get_companies_by_status
from config import get_supabase

logging.basicConfig(level=logging.INFO, format="%(asctime)s [HVT Monitor] %(message)s")
log = logging.getLogger(__name__)


def run() -> dict:
    """
    Re-scrape all HVT company websites and detect changes.
    Compares new content against the most recent stored snapshot.
    """
    sb = get_supabase()
    stats = {"checked": 0, "changed": 0, "unchanged": 0, "failed": 0}

    # Get all HVT companies
    hvt_companies = get_companies_by_status("HVT")
    log.info(f"Found {len(hvt_companies)} HVT companies to monitor")

    for company in hvt_companies:
        company_id = company["id"]

        # Get latest snapshot for website URL
        snap_result = sb.table("company_snapshots") \
            .select("name, website") \
            .eq("company_id", company_id) \
            .eq("is_latest", True) \
            .execute()

        if not snap_result.data:
            continue

        snap = snap_result.data[0]
        name = snap.get("name", "Unknown")
        website = snap.get("website")

        if not website:
            log.warning(f"Skipping {name} — no website URL")
            stats["failed"] += 1
            continue

        log.info(f"Checking: {name} ({website})")

        try:
            # Deep scrape the website
            scrape_result = deep_scrape_website(website)

            if not scrape_result["combined"]:
                log.warning(f"  Failed to scrape {name}")
                stats["failed"] += 1
                continue

            # Get previous snapshot for comparison
            prev = get_latest_website_snapshot(company_id)

            # Store new snapshot with change detection
            result = store_website_snapshot(company_id, website, scrape_result, prev)

            if result["change_detected"]:
                log.info(f"  CHANGE: {name} — {result.get('change_summary', 'Content changed')}")
                stats["changed"] += 1
            else:
                log.info(f"  No change: {name}")
                stats["unchanged"] += 1

            stats["checked"] += 1
            time.sleep(1)  # Be polite between scrapes

        except Exception as e:
            log.error(f"  Error monitoring {name}: {e}")
            stats["failed"] += 1

    log.info(f"\nHVT Monitor complete:")
    log.info(f"  Checked: {stats['checked']}")
    log.info(f"  Changed: {stats['changed']}")
    log.info(f"  Unchanged: {stats['unchanged']}")
    log.info(f"  Failed: {stats['failed']}")

    return stats


if __name__ == "__main__":
    run()

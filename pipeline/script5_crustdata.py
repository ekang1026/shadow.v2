"""
Script 5 — Crust Data Enrichment
Enriches companies that passed LLM filter with additional LinkedIn data from Crust Data API.
"""

import logging
import httpx
from config import CRUSTDATA_API_KEY
from db import get_companies_with_latest_snapshots, update_snapshot

logging.basicConfig(level=logging.INFO, format="%(asctime)s [CrustData] %(message)s")
log = logging.getLogger(__name__)

CRUSTDATA_BASE_URL = "https://api.crustdata.com"


def enrich_company(linkedin_url: str) -> dict | None:
    """
    Hit Crust Data API to get enriched LinkedIn data for a company.
    Returns enrichment data or None on failure.
    """
    if not CRUSTDATA_API_KEY:
        log.warning("CRUSTDATA_API_KEY not set — skipping enrichment")
        return None

    try:
        response = httpx.post(
            f"{CRUSTDATA_BASE_URL}/v1/company/enrich",
            headers={
                "Authorization": f"Bearer {CRUSTDATA_API_KEY}",
                "Content-Type": "application/json",
            },
            json={"linkedin_url": linkedin_url},
            timeout=30,
        )
        response.raise_for_status()
        return response.json()

    except httpx.HTTPStatusError as e:
        log.warning(f"Crust Data API error ({e.response.status_code}): {e}")
        return None
    except Exception as e:
        log.error(f"Crust Data request failed: {e}")
        return None


def run() -> dict:
    """
    Main entry point.
    Enriches companies that passed the LLM filter with Crust Data.
    """
    stats = {"enriched": 0, "skipped": 0, "errors": 0}

    if not CRUSTDATA_API_KEY:
        log.warning("CRUSTDATA_API_KEY not set in pipeline/.env — skipping enrichment")
        return stats

    # Get pending companies that passed LLM filter
    companies = get_companies_with_latest_snapshots(status="pending")
    log.info(f"Found {len(companies)} pending companies")

    for company in companies:
        snapshot = company.get("snapshot")
        if not snapshot:
            stats["skipped"] += 1
            continue

        # Only enrich companies that passed LLM filter
        if not snapshot.get("passed_llm_filter"):
            stats["skipped"] += 1
            continue

        linkedin_url = snapshot.get("linkedin_url")
        if not linkedin_url:
            stats["skipped"] += 1
            continue

        try:
            log.info(f"Enriching: {snapshot.get('name')}")
            data = enrich_company(linkedin_url)

            if data:
                # Map Crust Data response to our snapshot fields
                # Adjust field mapping based on actual Crust Data API response
                update_fields = {}

                if "headcount" in data:
                    update_fields["headcount"] = data["headcount"]
                if "headcount_growth_1yr" in data:
                    update_fields["headcount_growth_1yr"] = data["headcount_growth_1yr"]
                if "headcount_growth_2yr" in data:
                    update_fields["headcount_growth_2yr"] = data["headcount_growth_2yr"]

                if update_fields:
                    update_snapshot(snapshot["id"], update_fields)
                    stats["enriched"] += 1
                    log.info(f"  Enriched: {snapshot.get('name')}")
                else:
                    stats["skipped"] += 1
            else:
                stats["errors"] += 1

        except Exception as e:
            log.error(f"Error enriching {snapshot.get('name')}: {e}")
            stats["errors"] += 1

    log.info(f"Crust Data enrichment complete: {stats['enriched']} enriched, "
             f"{stats['skipped']} skipped, {stats['errors']} errors")
    return stats


if __name__ == "__main__":
    run()

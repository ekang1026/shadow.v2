"""
Script 1 — PitchBook Ingestion
Navigates to PitchBook saved search URL via Playwright, exports CSV, and ingests companies.
"""

import csv
import io
import os
import sys
import logging
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(asctime)s [PitchBook] %(message)s")
log = logging.getLogger(__name__)


# CSV column mapping — maps PitchBook CSV headers to our snapshot fields
# Adjust these mappings based on your actual PitchBook export columns
COLUMN_MAP = {
    "Company Name": "name",
    "PitchBook ID": "pitchbook_id",
    "Website": "website",
    "LinkedIn": "linkedin_url",
    "PitchBook URL": "pitchbook_url",
    "CEO Name": "ceo_name",
    "CEO LinkedIn": "ceo_linkedin_url",
    "Year Founded": "founded_year",
    "HQ Location": "location",
    "Employees": "headcount",
    "Total Raised": "total_capital_raised",
    "Last Round Valuation": "last_round_valuation",
    "Last Round Size": "last_round_amount_raised",
    "Investors": "previous_investors",
}


def parse_number(val: str) -> int | None:
    """Parse a number from PitchBook format (e.g., '$5M', '5,000', etc.)."""
    if not val or val.strip() in ("", "-", "N/A"):
        return None
    val = val.strip().replace(",", "").replace("$", "").replace(" ", "")
    multiplier = 1
    if val.upper().endswith("B"):
        multiplier = 1_000_000_000
        val = val[:-1]
    elif val.upper().endswith("M"):
        multiplier = 1_000_000
        val = val[:-1]
    elif val.upper().endswith("K"):
        multiplier = 1_000
        val = val[:-1]
    try:
        return int(float(val) * multiplier)
    except ValueError:
        return None


def parse_investors(val: str) -> list[str] | None:
    """Parse investor string into array."""
    if not val or val.strip() in ("", "-", "N/A"):
        return None
    return [inv.strip() for inv in val.split(",") if inv.strip()]


def download_csv_from_pitchbook() -> str:
    """
    Use Playwright to navigate to PitchBook, log in, and export CSV.
    Returns the CSV content as a string.
    """
    from playwright.sync_api import sync_playwright
    from config import PITCHBOOK_EMAIL, PITCHBOOK_PASSWORD, PITCHBOOK_SEARCH_URL

    if not PITCHBOOK_SEARCH_URL:
        raise ValueError("PITCHBOOK_SEARCH_URL not set in pipeline/.env")
    if not PITCHBOOK_EMAIL or not PITCHBOOK_PASSWORD:
        raise ValueError("PITCHBOOK_EMAIL and PITCHBOOK_PASSWORD must be set in pipeline/.env")

    log.info("Launching browser for PitchBook export...")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)  # headless=False for debugging
        context = browser.new_context()
        page = context.new_page()

        # Navigate to PitchBook login
        page.goto("https://pitchbook.com/login")
        page.wait_for_load_state("networkidle")

        # Fill login form
        page.fill('input[name="email"], input[type="email"]', PITCHBOOK_EMAIL)
        page.fill('input[name="password"], input[type="password"]', PITCHBOOK_PASSWORD)
        page.click('button[type="submit"]')
        page.wait_for_load_state("networkidle")
        log.info("Logged into PitchBook")

        # Navigate to saved search
        page.goto(PITCHBOOK_SEARCH_URL)
        page.wait_for_load_state("networkidle")
        log.info("Navigated to saved search")

        # Look for export/download button and click it
        # PitchBook UI may vary — adjust selectors as needed
        download_path = os.path.join(os.path.dirname(__file__), "downloads")
        os.makedirs(download_path, exist_ok=True)

        with page.expect_download() as download_info:
            # Try common export button selectors
            export_btn = page.locator('button:has-text("Export"), button:has-text("Download"), [data-testid="export"]')
            if export_btn.count() > 0:
                export_btn.first.click()
            else:
                # Fallback: look for a menu with export option
                page.click('button:has-text("Actions"), button:has-text("More")')
                page.click('text=Export to CSV, text=Download CSV, text=Export')

        download = download_info.value
        csv_path = os.path.join(download_path, download.suggested_filename)
        download.save_as(csv_path)
        log.info(f"Downloaded CSV: {csv_path}")

        browser.close()

        with open(csv_path, "r", encoding="utf-8") as f:
            return f.read()


def ingest_csv(csv_content: str) -> dict:
    """
    Parse CSV content and upsert companies + snapshots into Supabase.
    Returns stats: {new, updated, skipped}
    """
    from db import upsert_company, create_snapshot, get_latest_snapshot

    reader = csv.DictReader(io.StringIO(csv_content))
    stats = {"new": 0, "updated": 0, "skipped": 0, "errors": 0}

    for row in reader:
        try:
            # Find pitchbook_id from the row
            pitchbook_id = None
            for csv_col, field in COLUMN_MAP.items():
                if field == "pitchbook_id" and csv_col in row:
                    pitchbook_id = row[csv_col].strip()
                    break

            if not pitchbook_id:
                # Try to generate from company name if no PB ID column
                name_col = next((k for k in row if "name" in k.lower()), None)
                if name_col:
                    pitchbook_id = f"PB-{row[name_col].strip()[:50]}"
                else:
                    log.warning(f"Skipping row — no PitchBook ID found: {row}")
                    stats["skipped"] += 1
                    continue

            # Upsert company
            company = upsert_company(pitchbook_id)

            # Skip if already classified (not pending)
            if company["status"] != "pending":
                log.debug(f"Skipping {pitchbook_id} — already classified as {company['status']}")
                stats["skipped"] += 1
                continue

            # Build snapshot data from CSV row
            snapshot_data = {}
            for csv_col, field in COLUMN_MAP.items():
                if csv_col in row and field != "pitchbook_id":
                    val = row[csv_col].strip()
                    if field in ("headcount", "founded_year"):
                        snapshot_data[field] = parse_number(val)
                    elif field in ("total_capital_raised", "last_round_valuation", "last_round_amount_raised"):
                        snapshot_data[field] = parse_number(val)
                    elif field == "previous_investors":
                        snapshot_data[field] = parse_investors(val)
                    elif val and val not in ("-", "N/A"):
                        snapshot_data[field] = val

            # Check if this is a new company or update
            existing_snapshot = get_latest_snapshot(company["id"])
            if existing_snapshot:
                stats["updated"] += 1
            else:
                stats["new"] += 1

            create_snapshot(company["id"], snapshot_data)
            log.info(f"{'Updated' if existing_snapshot else 'Added'}: {snapshot_data.get('name', pitchbook_id)}")

        except Exception as e:
            log.error(f"Error processing row: {e}")
            stats["errors"] += 1

    return stats


def run(csv_file: str = None) -> dict:
    """
    Main entry point.
    If csv_file is provided, reads from file. Otherwise downloads from PitchBook.
    """
    if csv_file:
        log.info(f"Reading from local CSV: {csv_file}")
        with open(csv_file, "r", encoding="utf-8") as f:
            csv_content = f.read()
    else:
        csv_content = download_csv_from_pitchbook()

    stats = ingest_csv(csv_content)

    log.info(f"PitchBook ingestion complete: {stats['new']} new, {stats['updated']} updated, "
             f"{stats['skipped']} skipped, {stats['errors']} errors")
    return stats


if __name__ == "__main__":
    # Allow passing a local CSV file for testing
    csv_path = sys.argv[1] if len(sys.argv) > 1 else None
    run(csv_file=csv_path)

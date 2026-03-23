"""
Full Ingest Pipeline — Runs after a PitchBook file is uploaded:
1. Ingest Excel/CSV into Supabase (Script 1)
2. LinkedIn pre-paywall headcount scrape (Script 2) — filters to 8-30 employees
   → When a company PASSES HC filter, immediately queue it for LLM processing
3. Website scrape + LLM survey + competitor research run in parallel background threads

Usage:
    python3 run_ingest_pipeline.py /path/to/pitchbook.xlsx
"""

import json
import logging
import sys
import time
import threading
from queue import Queue
from concurrent.futures import ThreadPoolExecutor

logging.basicConfig(level=logging.INFO, format="%(asctime)s [Pipeline] %(message)s")
log = logging.getLogger(__name__)


def process_company_llm(snapshot_id: str, company_name: str, website_url: str):
    """
    Background worker: scrape website → LLM survey → competitor research for one company.
    Called whenever a company passes the HC filter.
    """
    try:
        from script3_domain import scrape_website
        from script4_llm import (
            classify_company, determine_pass_fail, build_what_they_do,
            extract_survey_fields, research_competitors, load_sourcing_prompt
        )
        from config import ANTHROPIC_API_KEY, LLM_MODEL
        from anthropic import Anthropic
        from db import update_snapshot

        if not ANTHROPIC_API_KEY:
            log.warning(f"  [LLM] Skipping {company_name} — no API key")
            return

        # Step 1: Scrape website
        if not website_url or website_url in ("", "-", "N/A"):
            log.warning(f"  [LLM] Skipping {company_name} — no website URL")
            return

        url = website_url if website_url.startswith("http") else f"https://{website_url}"
        website_text = scrape_website(url)
        if not website_text:
            log.warning(f"  [LLM] Could not scrape website for {company_name}")
            return

        # Google Ads competitor search disabled for now
        ad_competitors = []

        # Step 3: LLM survey
        client = Anthropic(api_key=ANTHROPIC_API_KEY)
        prompt_template = load_sourcing_prompt()

        survey = classify_company(client, prompt_template, company_name, website_text, ad_competitors)
        if not survey:
            log.warning(f"  [LLM] Survey failed for {company_name}")
            update_snapshot(snapshot_id, {"passed_llm_filter": False})
            return

        passed, reason = determine_pass_fail(survey)
        what_they_do = build_what_they_do(survey)
        fields = extract_survey_fields(survey)

        update_data = {
            "what_they_do": what_they_do,
            "passed_llm_filter": passed,
            "llm_survey": survey,
            **fields,
        }

        # Step 4: Competitor research (only for passing companies)
        if passed:
            competitors, comp_confidence = research_competitors(
                client, company_name, website_text, survey, ad_competitors
            )
            update_data["competitors"] = competitors
            update_data["competitor_confidence"] = comp_confidence

        update_snapshot(snapshot_id, update_data)

        if passed:
            log.info(f"  [LLM] ✓ PASS: {company_name} — {reason}")
        else:
            log.info(f"  [LLM] ✗ FAIL: {company_name} — {reason}")

    except Exception as e:
        log.error(f"  [LLM] Error processing {company_name}: {e}")
        try:
            from db import update_snapshot
            update_snapshot(snapshot_id, {"passed_llm_filter": False})
        except:
            pass


def run(file_path: str = None) -> dict:
    """Run the full ingest pipeline on a PitchBook file."""
    results = {
        "ingest": None,
        "linkedin": None,
        "llm": None,
        "total_duration": 0,
    }

    start = time.time()

    # Step 1: PitchBook Ingest
    if file_path:
        log.info("=" * 60)
        log.info("STEP 1: PitchBook Ingest")
        log.info("=" * 60)
        try:
            from script1_pitchbook import run as run_ingest
            ingest_stats = run_ingest(file_path=file_path)
            results["ingest"] = ingest_stats
            log.info(f"Ingest complete: {ingest_stats['new']} new, {ingest_stats['updated']} updated, "
                     f"{ingest_stats['skipped']} skipped, {ingest_stats['errors']} errors")
        except Exception as e:
            log.error(f"Ingest failed: {e}")
            results["ingest"] = {"error": str(e)}

    # Step 2: LinkedIn Headcount Scrape + parallel LLM
    log.info("")
    log.info("=" * 60)
    log.info("STEP 2: LinkedIn Scrape + Parallel LLM Processing")
    log.info("=" * 60)
    log.info("Companies that pass HC filter (8-30) are immediately queued for LLM.")

    # Start a thread pool for LLM processing (3 concurrent workers)
    llm_futures = []
    llm_stats = {"queued": 0, "passed": 0, "failed": 0, "errors": 0}

    with ThreadPoolExecutor(max_workers=3, thread_name_prefix="llm") as llm_pool:
        try:
            import sys as _sys
            import re
            import random
            from config import HEADCOUNT_MIN, HEADCOUNT_MAX
            from db import get_companies_with_latest_snapshots, update_snapshot

            companies = get_companies_with_latest_snapshots(status="pending")
            log.info(f"Found {len(companies)} pending companies")

            # Filter to those needing LinkedIn scrape
            to_scrape = []
            for company in companies:
                snapshot = company.get("snapshot")
                if not snapshot:
                    continue
                if snapshot.get("passed_headcount_filter") is not None and snapshot.get("headcount") is not None:
                    continue
                linkedin_url = snapshot.get("linkedin_url")
                if not linkedin_url:
                    continue
                to_scrape.append(company)

            if not to_scrape:
                log.info("No companies need LinkedIn scraping")
                # But check if there are HC-passed companies that still need LLM
                for company in companies:
                    snapshot = company.get("snapshot")
                    if not snapshot:
                        continue
                    if snapshot.get("passed_headcount_filter") == True and snapshot.get("passed_llm_filter") is None:
                        website_url = snapshot.get("website", "")
                        future = llm_pool.submit(
                            process_company_llm,
                            snapshot["id"],
                            snapshot.get("name", "Unknown"),
                            website_url
                        )
                        llm_futures.append((future, snapshot.get("name", "Unknown")))
                        llm_stats["queued"] += 1
            else:
                log.info(f"{len(to_scrape)} companies to scrape")

                # Import LinkedIn scraper
                linkedin_scraper_path = "/Users/glp/Gray Line/Shadow"
                if linkedin_scraper_path not in _sys.path:
                    _sys.path.insert(0, linkedin_scraper_path)

                from automation.data_providers.linkedin.scraper import LinkedInScraper
                from automation.common.playwright_browser import PlaywrightBrowser, BrowserConfig
                from script2_linkedin import scrape_linkedin_company, _parse_employee_count

                scraper = LinkedInScraper()
                config = BrowserConfig(headless=False)
                browser_mgr = PlaywrightBrowser(config)

                log.info("Launching visible Chrome window for LinkedIn scraping...")
                linkedin_stats = {"scraped": 0, "passed_filter": 0, "filtered_out": 0, "errors": 0}

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
                                    "passed_headcount_filter": False,
                                    "headcount_error": True,
                                })
                                linkedin_stats["filtered_out"] += 1
                            else:
                                headcount = data["headcount"]
                                passed = HEADCOUNT_MIN <= headcount <= HEADCOUNT_MAX

                                update_snapshot(snapshot["id"], {
                                    "headcount": headcount,
                                    "passed_headcount_filter": passed,
                                })
                                linkedin_stats["scraped"] += 1

                                if passed:
                                    linkedin_stats["passed_filter"] += 1
                                    log.info(f"  ✓ PASS: {company_name} — {headcount} employees → queuing for LLM")

                                    # Immediately queue for LLM processing
                                    website_url = snapshot.get("website", "")
                                    if website_url:
                                        future = llm_pool.submit(
                                            process_company_llm,
                                            snapshot["id"], company_name, website_url
                                        )
                                        llm_futures.append((future, company_name))
                                        llm_stats["queued"] += 1
                                else:
                                    linkedin_stats["filtered_out"] += 1
                                    log.info(f"  ✗ FILTER: {company_name} — {headcount} employees")

                            # Random delay between LinkedIn scrapes
                            delay = random.uniform(3, 6)
                            time.sleep(delay)

                        except Exception as e:
                            log.error(f"Error scraping {company_name}: {e}")
                            update_snapshot(snapshot["id"], {
                                "passed_headcount_filter": True,
                                "headcount_error": True,
                            })
                            linkedin_stats["errors"] += 1

                log.info(f"LinkedIn scraping complete: {linkedin_stats['scraped']} scraped, "
                         f"{linkedin_stats['passed_filter']} passed HC, "
                         f"{linkedin_stats['filtered_out']} filtered out, "
                         f"{linkedin_stats['errors']} errors")
                results["linkedin"] = linkedin_stats

        except Exception as e:
            log.error(f"LinkedIn/LLM pipeline failed: {e}")
            results["linkedin"] = {"error": str(e)}

        # Wait for remaining LLM jobs to finish
        if llm_futures:
            log.info(f"")
            log.info(f"Waiting for {len(llm_futures)} LLM jobs to complete...")
            for future, name in llm_futures:
                try:
                    future.result(timeout=120)  # 2 min max per company
                except Exception as e:
                    log.error(f"  [LLM] Timeout/error for {name}: {e}")
                    llm_stats["errors"] += 1

    results["llm"] = llm_stats

    total = round(time.time() - start, 1)
    results["total_duration"] = total

    # Final summary
    log.info("")
    log.info("=" * 60)
    log.info("PIPELINE COMPLETE")
    log.info("=" * 60)
    log.info(f"Total duration: {total}s ({total/60:.1f} min)")

    if results.get("ingest") and isinstance(results["ingest"], dict) and "error" not in results["ingest"]:
        i = results["ingest"]
        log.info(f"Ingest: {i.get('new', 0)} new, {i.get('updated', 0)} updated")

    if results.get("linkedin") and isinstance(results["linkedin"], dict) and "error" not in results["linkedin"]:
        li = results["linkedin"]
        log.info(f"LinkedIn: {li.get('scraped', 0)} scraped, {li.get('passed_filter', 0)} passed HC filter")

    log.info(f"LLM: {llm_stats['queued']} queued for processing")
    log.info("Companies are now ready for review in the dashboard.")

    return results


if __name__ == "__main__":
    if len(sys.argv) < 2:
        # No file = resume mode (skip ingest, just run LinkedIn + LLM)
        result = run()
    else:
        result = run(sys.argv[1])
    # Print JSON summary as last line for API parsing
    print(f"PIPELINE_RESULT:{json.dumps(result)}")

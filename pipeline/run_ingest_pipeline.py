"""
Full Ingest Pipeline — Runs after a PitchBook file is uploaded:
1. Ingest Excel/CSV into Supabase (Script 1)
2. LinkedIn pre-paywall headcount scrape (Script 2) — filters to 8-30 employees
3. Website scrape (Script 3) — only companies that passed HC filter
4. LLM survey + competitor research (Script 4) — only companies that passed HC filter

Usage:
    python3 run_ingest_pipeline.py /path/to/pitchbook.xlsx
"""

import json
import logging
import sys
import time

logging.basicConfig(level=logging.INFO, format="%(asctime)s [Pipeline] %(message)s")
log = logging.getLogger(__name__)


def run(file_path: str) -> dict:
    """Run the full ingest pipeline on a PitchBook file."""
    results = {
        "ingest": None,
        "linkedin": None,
        "llm": None,
        "total_duration": 0,
    }

    start = time.time()

    # Step 1: PitchBook Ingest
    log.info("=" * 60)
    log.info("STEP 1/4: PitchBook Ingest")
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

    # Step 2: LinkedIn Headcount Scrape
    log.info("")
    log.info("=" * 60)
    log.info("STEP 2/4: LinkedIn Pre-Paywall Headcount Scrape")
    log.info("=" * 60)
    try:
        from script2_linkedin import run as run_linkedin
        linkedin_stats = run_linkedin()
        results["linkedin"] = linkedin_stats
    except Exception as e:
        log.error(f"LinkedIn scrape failed: {e}")
        results["linkedin"] = {"error": str(e)}

    # Step 3 & 4: Website Scrape + LLM Survey (Script 4 calls Script 3 internally)
    log.info("")
    log.info("=" * 60)
    log.info("STEP 3/4: Website Scrape + LLM Survey + Competitor Research")
    log.info("=" * 60)
    try:
        from script4_llm import run as run_llm
        llm_stats = run_llm()  # This calls script3_domain internally
        results["llm"] = llm_stats
    except Exception as e:
        log.error(f"LLM survey failed: {e}")
        results["llm"] = {"error": str(e)}

    total = round(time.time() - start, 1)
    results["total_duration"] = total

    # Final summary
    log.info("")
    log.info("=" * 60)
    log.info("PIPELINE COMPLETE")
    log.info("=" * 60)
    log.info(f"Total duration: {total}s")

    if results["ingest"] and not isinstance(results["ingest"], dict) or (isinstance(results["ingest"], dict) and "error" not in results["ingest"]):
        i = results["ingest"]
        log.info(f"Ingest: {i.get('new', 0)} new, {i.get('updated', 0)} updated")

    if results["linkedin"] and isinstance(results["linkedin"], dict) and "error" not in results["linkedin"]:
        log.info(f"LinkedIn: scraped and filtered by headcount (8-30)")

    if results["llm"] and isinstance(results["llm"], dict) and "error" not in results["llm"]:
        s = results["llm"].get("stats", {})
        log.info(f"LLM Survey: {s.get('passed', 0)} passed, {s.get('failed', 0)} failed")

    log.info("Companies are now ready for review in the dashboard.")

    return results


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 run_ingest_pipeline.py /path/to/pitchbook.xlsx")
        sys.exit(1)

    result = run(sys.argv[1])
    # Print JSON summary as last line for API parsing
    print(f"PIPELINE_RESULT:{json.dumps(result)}")

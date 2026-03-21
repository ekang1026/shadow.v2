"""
Shadow Pipeline — Monthly Orchestrator
Runs Scripts 1 → 2 → 3 → 4 → 5 in sequence.
Schedule: 1st of each month at 6 AM (via crontab on Mac Mini)

Usage:
    python3 run_monthly.py                      # Full pipeline (downloads from PitchBook)
    python3 run_monthly.py --csv /path/to.csv   # Use a local CSV instead of PitchBook download
    python3 run_monthly.py --skip-pitchbook     # Skip Script 1, start from LinkedIn enrichment
"""

import sys
import time
import logging
import argparse
from datetime import datetime

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [Monthly] %(message)s",
    handlers=[
        logging.StreamHandler(),
    ],
)
log = logging.getLogger(__name__)


def run_script(name: str, func, **kwargs) -> dict | list | None:
    """Run a single script with timing and error handling."""
    log.info(f"{'=' * 60}")
    log.info(f"Starting: {name}")
    log.info(f"{'=' * 60}")

    start = time.time()
    try:
        result = func(**kwargs)
        elapsed = time.time() - start
        log.info(f"Completed: {name} in {elapsed:.1f}s")
        log.info(f"Result: {result}")
        return result
    except Exception as e:
        elapsed = time.time() - start
        log.error(f"FAILED: {name} after {elapsed:.1f}s — {e}")
        return None


def main():
    parser = argparse.ArgumentParser(description="Shadow Monthly Pipeline")
    parser.add_argument("--csv", type=str, help="Path to local PitchBook CSV (skip browser download)")
    parser.add_argument("--skip-pitchbook", action="store_true", help="Skip PitchBook ingestion")
    args = parser.parse_args()

    log.info("=" * 60)
    log.info(f"SHADOW MONTHLY PIPELINE — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    log.info("=" * 60)

    pipeline_start = time.time()
    results = {}

    # ── Script 1: PitchBook Ingestion ──
    if not args.skip_pitchbook:
        import script1_pitchbook
        kwargs = {"csv_file": args.csv} if args.csv else {}
        results["pitchbook"] = run_script("Script 1 — PitchBook Ingestion", script1_pitchbook.run, **kwargs)
    else:
        log.info("Skipping Script 1 (PitchBook) — --skip-pitchbook flag set")

    # ── Script 2: LinkedIn Enrichment ──
    import script2_linkedin
    results["linkedin"] = run_script("Script 2 — LinkedIn Enrichment", script2_linkedin.run)

    # ── Script 3: Domain Scraping ──
    import script3_domain
    domain_result = run_script("Script 3 — Domain Scraping", script3_domain.run)
    results["domain"] = domain_result

    # ── Script 4: LLM Classification ──
    import script4_llm
    # Pass scraped results from Script 3 into Script 4
    results["llm"] = run_script("Script 4 — LLM Classification", script4_llm.run, scraped_results=domain_result)

    # ── Script 5: Crust Data Enrichment ──
    import script5_crustdata
    results["crustdata"] = run_script("Script 5 — Crust Data Enrichment", script5_crustdata.run)

    # ── Summary ──
    total_elapsed = time.time() - pipeline_start
    log.info("")
    log.info("=" * 60)
    log.info(f"MONTHLY PIPELINE COMPLETE — {total_elapsed:.1f}s total")
    log.info("=" * 60)

    for step, result in results.items():
        log.info(f"  {step}: {result}")

    return results


if __name__ == "__main__":
    main()

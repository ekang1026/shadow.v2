"""
Shadow Pipeline — Weekly Orchestrator
Runs Script 6 (HVT Weekly Monitor).
Schedule: Every Monday at 7 AM (via crontab on Mac Mini)

Usage:
    python3 run_weekly.py
"""

import time
import logging
from datetime import datetime

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [Weekly] %(message)s",
    handlers=[
        logging.StreamHandler(),
    ],
)
log = logging.getLogger(__name__)


def main():
    log.info("=" * 60)
    log.info(f"SHADOW WEEKLY PIPELINE — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    log.info("=" * 60)

    start = time.time()

    try:
        import script6_hvt_monitor
        results = script6_hvt_monitor.run()

        elapsed = time.time() - start
        log.info("")
        log.info("=" * 60)
        log.info(f"WEEKLY PIPELINE COMPLETE — {elapsed:.1f}s total")
        log.info("=" * 60)

        for phase, stats in results.items():
            log.info(f"  {phase}: {stats}")

        return results

    except Exception as e:
        elapsed = time.time() - start
        log.error(f"WEEKLY PIPELINE FAILED after {elapsed:.1f}s — {e}")
        raise


if __name__ == "__main__":
    main()

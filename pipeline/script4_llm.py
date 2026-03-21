"""
Script 4 — LLM Processor (Claude Sonnet)
Sends scraped website content to Claude for classification and summary.
"""

import json
import logging
import os
import time
from pathlib import Path

from anthropic import Anthropic
from config import ANTHROPIC_API_KEY, LLM_MODEL
from db import update_snapshot

logging.basicConfig(level=logging.INFO, format="%(asctime)s [LLM] %(message)s")
log = logging.getLogger(__name__)

# Rate limiting
REQUESTS_PER_MINUTE = 30
DELAY_BETWEEN_REQUESTS = 60.0 / REQUESTS_PER_MINUTE


def load_sourcing_prompt() -> str:
    """Load the sourcing prompt template."""
    prompt_path = Path(__file__).parent / "prompts" / "sourcing_prompt.txt"
    if not prompt_path.exists():
        raise FileNotFoundError(f"Sourcing prompt not found at {prompt_path}")
    return prompt_path.read_text()


def classify_company(client: Anthropic, prompt_template: str,
                     company_name: str, website_text: str) -> dict | None:
    """
    Send company website content to Claude for classification.
    Returns parsed response or None on failure.
    """
    full_prompt = prompt_template + "\n" + website_text

    try:
        response = client.messages.create(
            model=LLM_MODEL,
            max_tokens=500,
            messages=[
                {"role": "user", "content": full_prompt}
            ]
        )

        # Extract text from response
        text = response.content[0].text.strip()

        # Try to parse JSON from response
        # Handle cases where Claude wraps JSON in markdown code blocks
        if "```json" in text:
            text = text.split("```json")[1].split("```")[0].strip()
        elif "```" in text:
            text = text.split("```")[1].split("```")[0].strip()

        result = json.loads(text)
        return result

    except json.JSONDecodeError as e:
        log.warning(f"Failed to parse LLM response for {company_name}: {e}")
        log.debug(f"Raw response: {text}")
        return None
    except Exception as e:
        log.error(f"LLM API error for {company_name}: {e}")
        return None


def run(scraped_results: list[dict] = None) -> dict:
    """
    Main entry point.
    If scraped_results not provided, runs Script 3 first to get website content.
    """
    if not ANTHROPIC_API_KEY:
        log.error("ANTHROPIC_API_KEY not set in pipeline/.env — skipping LLM processing")
        return {"stats": {"processed": 0, "passed": 0, "failed": 0, "errors": 0}}

    stats = {"processed": 0, "passed": 0, "failed": 0, "errors": 0}

    # Get scraped results if not provided
    if scraped_results is None:
        from script3_domain import run as run_scraper
        scraper_output = run_scraper()
        scraped_results = scraper_output["results"]

    if not scraped_results:
        log.info("No companies to process")
        return {"stats": stats}

    # Initialize Anthropic client
    client = Anthropic(api_key=ANTHROPIC_API_KEY)
    prompt_template = load_sourcing_prompt()

    log.info(f"Processing {len(scraped_results)} companies through Claude {LLM_MODEL}")

    for item in scraped_results:
        company_name = item["name"]
        snapshot_id = item["snapshot_id"]
        website_text = item["text"]

        log.info(f"Processing: {company_name}")

        result = classify_company(client, prompt_template, company_name, website_text)

        if result:
            what_they_do = result.get("what_they_do", "")
            passed = result.get("pass", False)
            reason = result.get("reason", "")

            update_snapshot(snapshot_id, {
                "what_they_do": what_they_do,
                "passed_llm_filter": passed,
            })

            stats["processed"] += 1
            if passed:
                stats["passed"] += 1
                log.info(f"  PASS: {company_name} — {reason}")
            else:
                stats["failed"] += 1
                log.info(f"  FAIL: {company_name} — {reason}")
        else:
            stats["errors"] += 1
            log.warning(f"  ERROR: Could not process {company_name}")

        # Rate limiting
        time.sleep(DELAY_BETWEEN_REQUESTS)

    log.info(f"LLM processing complete: {stats['processed']} processed, "
             f"{stats['passed']} passed, {stats['failed']} failed, {stats['errors']} errors")
    return {"stats": stats}


if __name__ == "__main__":
    run()

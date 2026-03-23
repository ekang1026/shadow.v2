"""
Script 4 — LLM Processor (Claude Sonnet)
Sends scraped website content to Claude for the sourcing survey.
Stores full survey response and extracts structured fields.
"""

import json
import logging
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
                     company_name: str, website_text: str,
                     ad_competitors: list[dict] = None) -> dict | None:
    """
    Send company website content to Claude for survey evaluation.
    Returns parsed survey JSON or None on failure.
    """
    full_prompt = prompt_template + "\n" + website_text

    # Append Google Ads competitor data if available
    if ad_competitors:
        competitor_text = "\n\nGOOGLE ADWORDS COMPETITORS (companies purchasing ads against this company's name):\n"
        for comp in ad_competitors:
            competitor_text += f"- {comp['name']} ({comp['url']})\n"
        full_prompt += competitor_text
    else:
        full_prompt += "\n\nGOOGLE ADWORDS COMPETITORS: None found."

    try:
        response = client.messages.create(
            model=LLM_MODEL,
            max_tokens=2000,  # Survey response is larger than old pass/fail
            messages=[
                {"role": "user", "content": full_prompt}
            ]
        )

        # Extract text from response
        text = response.content[0].text.strip()

        # Handle cases where Claude wraps JSON in markdown code blocks
        if "```json" in text:
            text = text.split("```json")[1].split("```")[0].strip()
        elif "```" in text:
            text = text.split("```")[1].split("```")[0].strip()

        result = json.loads(text)
        return result

    except json.JSONDecodeError as e:
        log.warning(f"Failed to parse LLM response for {company_name}: {e}")
        return None
    except Exception as e:
        log.error(f"LLM API error for {company_name}: {e}")
        return None


def determine_pass_fail(survey: dict) -> tuple[bool, str]:
    """
    Determine if a company passes the LLM filter based on survey results.
    Returns (passed, reason).

    Pass criteria:
    - Must sell Software
    - Must serve Business customers (B2B)
    - Must not be a subsidiary
    - Must not be in a disfavored vertical
    - Must not be primarily Consumer, Marketplace, or Services-only
    """
    reasons = []

    # Check offering type
    offering = survey.get("offering_type", [])
    if not isinstance(offering, list):
        offering = [offering]
    if "Software" not in offering:
        reasons.append(f"Not software (offering: {', '.join(offering)})")

    # Check customer type
    customers = survey.get("customer_type", [])
    if not isinstance(customers, list):
        customers = [customers]
    if "Business" not in customers:
        reasons.append(f"Not B2B (customers: {', '.join(customers)})")

    # Check subsidiary
    if survey.get("is_subsidiary", False):
        reasons.append("Is a subsidiary")

    # Check disfavored vertical
    disfavored = survey.get("disfavored_vertical", "")
    if disfavored and disfavored.strip():
        reasons.append(f"Disfavored vertical: {disfavored}")

    # Check if primarily a marketplace or services-only
    if offering == ["Marketplace"]:
        reasons.append("Pure marketplace")
    if offering == ["Services"]:
        reasons.append("Services-only business")

    passed = len(reasons) == 0
    reason = "Meets all sourcing criteria" if passed else "; ".join(reasons)
    return passed, reason


def build_what_they_do(survey: dict) -> str:
    """
    Build a human-readable summary from survey evidence fields.
    Falls back to offering_type_evidence if nothing better is available.
    """
    parts = []

    # Use offering evidence as the primary description
    offering_ev = survey.get("offering_type_evidence", "")
    if offering_ev:
        parts.append(offering_ev)

    # Add product category context
    product_ev = survey.get("product_category_evidence", "")
    if product_ev and product_ev not in offering_ev:
        parts.append(product_ev)

    if parts:
        return " ".join(parts)[:500]

    # Fallback: compose from structured fields
    offering = survey.get("offering_type", [])
    market = survey.get("market_focus", "")
    naics = survey.get("NAICS_3digit_name", "")
    return f"{', '.join(offering) if isinstance(offering, list) else offering} company. {market} focus. {naics}."[:500]


def research_competitors(client: Anthropic, company_name: str,
                         website_text: str, survey: dict,
                         ad_competitors: list[dict] = None) -> tuple[list[dict], str]:
    """
    Separate competitor research step at temperature 0.7 for better discovery.
    Returns (competitors_list, confidence_level).
    Each competitor: {name, source, rationale}
    """
    # Build context from the survey results
    context_parts = [
        f"Company: {company_name}",
        f"What they do: {survey.get('offering_type_evidence', '')}",
        f"Market focus: {survey.get('market_focus', '')}",
        f"Vertical: {survey.get('vertical_type', '')}",
        f"NAICS: {survey.get('NAICS_3digit_name', '')}",
        f"Customers: {', '.join(survey.get('customers_named') or [])}",
        f"Product category: {survey.get('product_category', '')}",
    ]

    ad_comp_text = ""
    if ad_competitors:
        ad_comp_text = "\nGoogle Ads competitors (companies buying ads against this company's name):\n"
        for c in ad_competitors:
            ad_comp_text += f"- {c['name']} ({c['url']})\n"

    prompt = f"""You are a growth equity analyst researching the competitive landscape for {company_name}.

<company-context>
{chr(10).join(context_parts)}
</company-context>

<website-content>
{website_text[:8000]}
</website-content>
{ad_comp_text}

Identify exactly 3 realistic competitors that a CEO of {company_name} would recognize in a buying conversation.

Competitors must:
- Appear in {company_name}'s own language, customer context, or comparisons, OR
- Compete in the same narrow workflow or use case
- Be companies a buyer would actually evaluate as alternatives

Do NOT:
- Include generic platforms or category incumbents unless explicitly positioned against
- Guess or inflate with well-known brands
- Use adjacent tools unless no direct competitors exist

For each competitor, provide:
- name: The competitor company name
- source: Where you found evidence (one of: "website_positioning", "google_ads", "market_overlap", "adjacent_tool")
- rationale: One sentence explaining why this is a real competitor

Also determine your confidence level:
- HIGH: All 3 competitors are real, defensible, and would be recognized by the CEO
- MIXED: Some competitors are confident, others are adjacent or uncertain
- LOW: Could not confidently identify direct competitors; these are adjacent at best

Return ONLY a JSON object in this format:
{{"competitors": [{{"name": "...", "source": "...", "rationale": "..."}}, ...], "confidence": "HIGH|MIXED|LOW"}}
"""

    try:
        response = client.messages.create(
            model=LLM_MODEL,
            max_tokens=800,
            temperature=0.7,  # Higher temp for better research/discovery
            messages=[{"role": "user", "content": prompt}]
        )

        text = response.content[0].text.strip()
        if "```json" in text:
            text = text.split("```json")[1].split("```")[0].strip()
        elif "```" in text:
            text = text.split("```")[1].split("```")[0].strip()

        result = json.loads(text)
        competitors = result.get("competitors", [])
        confidence = result.get("confidence", "LOW")

        log.info(f"    Competitors ({confidence}): {', '.join(c['name'] for c in competitors)}")
        return competitors, confidence

    except Exception as e:
        log.warning(f"    Competitor research failed for {company_name}: {e}")
        return [], "LOW"


def extract_survey_fields(survey: dict) -> dict:
    """
    Extract structured fields from the survey JSON for database storage.
    Maps survey keys to database column names.
    """
    def to_bool(val) -> bool | None:
        if isinstance(val, bool):
            return val
        if isinstance(val, str):
            return val.strip().lower() in ("yes", "true", "1")
        return None

    def to_list(val) -> list | None:
        if isinstance(val, list):
            return val
        if isinstance(val, str) and val.strip():
            return [val.strip()]
        return None

    return {
        "offering_type": to_list(survey.get("offering_type")),
        "customer_type": to_list(survey.get("customer_type")),
        "market_focus": survey.get("market_focus", ""),
        "naics_3digit_code": survey.get("NAICS_3digit_code", ""),
        "naics_3digit_name": survey.get("NAICS_3digit_name", ""),
        "product_category": survey.get("product_category", ""),
        "revenue_model": to_list(survey.get("revenue_model")),
        "is_subsidiary": survey.get("is_subsidiary", False),
        "vertical_type": survey.get("vertical_type", ""),
        "multi_vertical_type": survey.get("multi_vertical_type", ""),
        "disfavored_vertical": survey.get("disfavored_vertical", ""),
        "customers_listed": to_bool(survey.get("customers_listed")),
        "customers_named": to_list(survey.get("customers_named")),
        "success_indicators_present": to_bool(survey.get("success_indicators_present")),
        "success_indicators": to_list(survey.get("success_indicators")),
        "agentic_features_present": to_bool(survey.get("agentic_features_present")),
        "agentic_feature_types": to_list(survey.get("agentic_feature_types")),
        "google_ad_competitors": to_list(survey.get("google_ad_competitors")),
    }


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

        ad_competitors = item.get("ad_competitors", [])
        survey = classify_company(client, prompt_template, company_name, website_text, ad_competitors)

        if survey:
            # Determine pass/fail from survey data
            passed, reason = determine_pass_fail(survey)

            # Build human-readable summary
            what_they_do = build_what_they_do(survey)

            # Extract structured fields
            fields = extract_survey_fields(survey)

            # Build update payload
            update_data = {
                "what_they_do": what_they_do,
                "passed_llm_filter": passed,
                "llm_survey": survey,  # Store full survey JSON
                **fields,
            }

            # Run competitor research for companies that pass
            if passed:
                competitors, comp_confidence = research_competitors(
                    client, company_name, website_text, survey, ad_competitors
                )
                update_data["competitors"] = competitors
                update_data["competitor_confidence"] = comp_confidence

            update_snapshot(snapshot_id, update_data)

            stats["processed"] += 1
            if passed:
                stats["passed"] += 1
                log.info(f"  PASS: {company_name} — {reason}")
            else:
                stats["failed"] += 1
                log.info(f"  FAIL: {company_name} — {reason}")

            # Log key survey findings
            log.info(f"    Offering: {fields.get('offering_type')}")
            log.info(f"    Customers: {fields.get('customer_type')}")
            log.info(f"    Market: {fields.get('market_focus')} / {fields.get('vertical_type')}")
            log.info(f"    NAICS: {fields.get('naics_3digit_code')} {fields.get('naics_3digit_name')}")
            log.info(f"    Agentic: {fields.get('agentic_features_present')}")
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

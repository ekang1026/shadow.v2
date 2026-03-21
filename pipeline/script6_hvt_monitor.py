"""
Script 6 — HVT Weekly Monitor
Monitors HVT companies for website changes, LinkedIn posts,
syncs HubSpot outreach data, and posts intel to Slack.
Runs weekly (every Monday).
"""

import hashlib
import logging
import httpx
import requests
from bs4 import BeautifulSoup

from config import (
    CRUSTDATA_API_KEY, ANTHROPIC_API_KEY, LLM_MODEL,
    HUBSPOT_API_KEY, SLACK_BOT_TOKEN,
)
from db import (
    get_companies_with_latest_snapshots,
    get_latest_website_snapshot,
    insert_website_snapshot,
    insert_linkedin_post,
    upsert_outreach_summary,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [HVTMonitor] %(message)s")
log = logging.getLogger(__name__)

CRUSTDATA_BASE_URL = "https://api.crustdata.com"


# ─────────────────────────────────────────
# 1. Website Change Detection
# ─────────────────────────────────────────

def fetch_and_hash_website(url: str) -> tuple[str | None, str | None]:
    """
    Fetch a website's main content and return (content_hash, cleaned_text).
    Returns (None, None) on failure.
    """
    try:
        if not url.startswith("http"):
            url = f"https://{url}"

        resp = requests.get(url, timeout=15, headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"
        })
        resp.raise_for_status()

        soup = BeautifulSoup(resp.text, "html.parser")

        # Strip non-content elements
        for tag in soup(["nav", "footer", "header", "script", "style", "noscript", "iframe"]):
            tag.decompose()

        text = soup.get_text(separator="\n", strip=True)
        # Truncate to avoid huge hashes on bloated pages
        text = text[:20_000]

        content_hash = hashlib.sha256(text.encode()).hexdigest()
        return content_hash, text

    except Exception as e:
        log.warning(f"Failed to fetch {url}: {e}")
        return None, None


def summarize_change(company_name: str, old_text: str | None, new_text: str) -> str | None:
    """
    Use Claude to summarize what changed on a company's website.
    Returns a short summary string, or None on failure.
    """
    if not ANTHROPIC_API_KEY:
        return "Website content changed (LLM summary unavailable)"

    try:
        import anthropic
        client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

        prompt = f"""Compare the old and new website content for {company_name} and provide a brief 1-2 sentence summary of what changed. Focus on meaningful changes (new products, hiring, funding announcements, partnerships) and ignore minor text tweaks.

OLD CONTENT:
{(old_text or 'No previous content available')[:5000]}

NEW CONTENT:
{new_text[:5000]}

Summary of changes:"""

        response = client.messages.create(
            model=LLM_MODEL,
            max_tokens=200,
            messages=[{"role": "user", "content": prompt}],
        )
        return response.content[0].text.strip()

    except Exception as e:
        log.warning(f"LLM summarization failed for {company_name}: {e}")
        return "Website content changed (LLM summary failed)"


def monitor_websites(hvt_companies: list[dict]) -> dict:
    """Check each HVT company's website for changes."""
    stats = {"checked": 0, "changes": 0, "errors": 0}

    for company in hvt_companies:
        snapshot = company.get("snapshot")
        if not snapshot:
            continue

        website = snapshot.get("website")
        if not website:
            continue

        company_name = snapshot.get("name", "Unknown")
        log.info(f"Checking website: {company_name} ({website})")

        content_hash, new_text = fetch_and_hash_website(website)
        if not content_hash:
            stats["errors"] += 1
            continue

        stats["checked"] += 1

        # Compare to last snapshot
        last_ws = get_latest_website_snapshot(company["id"])
        old_hash = last_ws["content_hash"] if last_ws else None

        if content_hash != old_hash:
            # Change detected — summarize it
            old_text = last_ws.get("raw_content") if last_ws else None
            change_summary = summarize_change(company_name, old_text, new_text)

            insert_website_snapshot(
                company_id=company["id"],
                content_hash=content_hash,
                change_detected=True,
                change_summary=change_summary,
                raw_content=new_text[:10_000],  # store truncated content for next diff
            )
            stats["changes"] += 1
            log.info(f"  ⚡ Change detected: {company_name}")
        else:
            # No change — still log a snapshot for tracking
            insert_website_snapshot(
                company_id=company["id"],
                content_hash=content_hash,
                change_detected=False,
            )
            log.info(f"  ✓ No change: {company_name}")

    return stats


# ─────────────────────────────────────────
# 2. LinkedIn Posts via Crust Data
# ─────────────────────────────────────────

def fetch_linkedin_posts(linkedin_url: str) -> list[dict]:
    """
    Fetch recent LinkedIn posts (company + CEO) from Crust Data API.
    Returns list of post dicts or empty list on failure.
    """
    if not CRUSTDATA_API_KEY:
        log.warning("CRUSTDATA_API_KEY not set — skipping LinkedIn posts")
        return []

    try:
        response = httpx.post(
            f"{CRUSTDATA_BASE_URL}/v1/company/posts",
            headers={
                "Authorization": f"Bearer {CRUSTDATA_API_KEY}",
                "Content-Type": "application/json",
            },
            json={"linkedin_url": linkedin_url, "limit": 10},
            timeout=30,
        )
        response.raise_for_status()
        return response.json().get("posts", [])

    except httpx.HTTPStatusError as e:
        log.warning(f"Crust Data posts API error ({e.response.status_code}): {e}")
        return []
    except Exception as e:
        log.error(f"Crust Data posts request failed: {e}")
        return []


def monitor_linkedin_posts(hvt_companies: list[dict]) -> dict:
    """Fetch and store recent LinkedIn posts for HVT companies."""
    stats = {"companies_checked": 0, "posts_added": 0, "errors": 0}

    if not CRUSTDATA_API_KEY:
        log.warning("CRUSTDATA_API_KEY not set — skipping LinkedIn post monitoring")
        return stats

    for company in hvt_companies:
        snapshot = company.get("snapshot")
        if not snapshot:
            continue

        linkedin_url = snapshot.get("linkedin_url")
        if not linkedin_url:
            continue

        company_name = snapshot.get("name", "Unknown")
        log.info(f"Fetching LinkedIn posts: {company_name}")
        stats["companies_checked"] += 1

        try:
            posts = fetch_linkedin_posts(linkedin_url)

            for post in posts:
                # Determine post type (CEO vs Company)
                post_type = post.get("type", "company")  # "ceo" or "company"
                posted_by = post.get("author_name", company_name)

                insert_linkedin_post(
                    company_id=company["id"],
                    post_type=post_type,
                    posted_by=posted_by,
                    post_content=post.get("content", "")[:2000],
                    post_url=post.get("url", ""),
                    posted_at=post.get("posted_at"),
                )
                stats["posts_added"] += 1

            if posts:
                log.info(f"  Added {len(posts)} posts for {company_name}")

        except Exception as e:
            log.error(f"Error fetching posts for {company_name}: {e}")
            stats["errors"] += 1

    return stats


# ─────────────────────────────────────────
# 3. HubSpot Outreach Sync (Placeholder)
# ─────────────────────────────────────────

def sync_hubspot_outreach(hvt_companies: list[dict]) -> dict:
    """
    Sync outreach data from HubSpot CRM.
    PLACEHOLDER — will be implemented when HubSpot API key is available.
    """
    stats = {"synced": 0, "errors": 0}

    if not HUBSPOT_API_KEY:
        log.info("HUBSPOT_API_KEY not set — skipping HubSpot sync")
        return stats

    # TODO: Implement HubSpot API integration
    # For each HVT company:
    #   1. Search HubSpot contacts/deals by company name or domain
    #   2. Pull email counts, last contact date, open rates
    #   3. Upsert into outreach_summary table
    #
    # Example implementation:
    # for company in hvt_companies:
    #     snapshot = company.get("snapshot")
    #     if not snapshot:
    #         continue
    #     domain = snapshot.get("website", "")
    #     # hubspot_data = search_hubspot_by_domain(domain)
    #     # upsert_outreach_summary(company["id"], hubspot_data)
    #     # stats["synced"] += 1

    log.info("HubSpot sync: placeholder — implement when API key is provided")
    return stats


# ─────────────────────────────────────────
# 4. Slack Posting (Placeholder)
# ─────────────────────────────────────────

def post_to_slack(hvt_companies: list[dict], website_stats: dict, post_stats: dict) -> dict:
    """
    Post weekly intel summaries to per-company Slack channels.
    PLACEHOLDER — will be implemented when Slack Bot Token is available.
    """
    stats = {"posted": 0, "errors": 0}

    if not SLACK_BOT_TOKEN:
        log.info("SLACK_BOT_TOKEN not set — skipping Slack posting")
        return stats

    # TODO: Implement Slack posting
    # For each HVT company with new intel:
    #   1. Find or create a Slack channel (#shadow-{company-slug})
    #   2. Post formatted message with:
    #      - Website changes (if any)
    #      - New LinkedIn posts (if any)
    #      - Outreach status update
    #
    # Example implementation:
    # import slack_sdk
    # client = slack_sdk.WebClient(token=SLACK_BOT_TOKEN)
    # for company in hvt_companies:
    #     channel = f"#shadow-{slugify(company['name'])}"
    #     message = build_intel_message(company, ...)
    #     client.chat_postMessage(channel=channel, text=message)
    #     stats["posted"] += 1

    log.info("Slack posting: placeholder — implement when Bot Token is provided")
    return stats


# ─────────────────────────────────────────
# Main Entry Point
# ─────────────────────────────────────────

def run() -> dict:
    """
    Main entry point for weekly HVT monitoring.
    Runs all 4 monitoring tasks in sequence.
    """
    log.info("=" * 60)
    log.info("Starting HVT Weekly Monitor")
    log.info("=" * 60)

    # Get all HVT companies with their latest snapshots
    hvt_companies = get_companies_with_latest_snapshots(status="HVT")
    log.info(f"Found {len(hvt_companies)} HVT companies to monitor")

    if not hvt_companies:
        log.info("No HVT companies — nothing to monitor")
        return {"website": {}, "linkedin": {}, "hubspot": {}, "slack": {}}

    # 1. Website change detection
    log.info("-" * 40)
    log.info("Phase 1: Website monitoring")
    website_stats = monitor_websites(hvt_companies)
    log.info(f"Websites: {website_stats['checked']} checked, "
             f"{website_stats['changes']} changes, {website_stats['errors']} errors")

    # 2. LinkedIn posts
    log.info("-" * 40)
    log.info("Phase 2: LinkedIn post monitoring")
    linkedin_stats = monitor_linkedin_posts(hvt_companies)
    log.info(f"LinkedIn: {linkedin_stats['companies_checked']} checked, "
             f"{linkedin_stats['posts_added']} posts added")

    # 3. HubSpot sync
    log.info("-" * 40)
    log.info("Phase 3: HubSpot outreach sync")
    hubspot_stats = sync_hubspot_outreach(hvt_companies)

    # 4. Slack posting
    log.info("-" * 40)
    log.info("Phase 4: Slack intel posting")
    slack_stats = post_to_slack(hvt_companies, website_stats, linkedin_stats)

    log.info("=" * 60)
    log.info("HVT Weekly Monitor complete")
    log.info("=" * 60)

    return {
        "website": website_stats,
        "linkedin": linkedin_stats,
        "hubspot": hubspot_stats,
        "slack": slack_stats,
    }


if __name__ == "__main__":
    run()

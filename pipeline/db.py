"""
Shadow Pipeline — Database Helper Functions
Reusable functions for interacting with Supabase tables.
"""

from datetime import date, datetime
from typing import Optional
from config import get_supabase


def upsert_company(pitchbook_id: str) -> dict:
    """
    Create or fetch a company by PitchBook ID.
    Returns the company record.
    """
    sb = get_supabase()

    # Check if company exists
    result = sb.table("companies").select("*").eq("pitchbook_id", pitchbook_id).execute()

    if result.data:
        return result.data[0]

    # Create new company
    new_company = sb.table("companies").insert({
        "pitchbook_id": pitchbook_id,
        "status": "pending",
        "review_count": 0,
    }).execute()

    return new_company.data[0]


def create_snapshot(company_id: str, data: dict) -> dict:
    """
    Create a new company snapshot. Marks all previous snapshots as is_latest=false.
    `data` should contain firmographic fields (name, website, headcount, etc.)
    """
    sb = get_supabase()

    # Mark previous snapshots as not latest
    sb.table("company_snapshots") \
        .update({"is_latest": False}) \
        .eq("company_id", company_id) \
        .eq("is_latest", True) \
        .execute()

    # Insert new snapshot
    snapshot_data = {
        "company_id": company_id,
        "snapshot_date": date.today().isoformat(),
        "is_latest": True,
        **data,
    }

    result = sb.table("company_snapshots").insert(snapshot_data).execute()
    return result.data[0]


def update_snapshot(snapshot_id: str, data: dict) -> dict:
    """Update fields on an existing snapshot."""
    sb = get_supabase()
    result = sb.table("company_snapshots").update(data).eq("id", snapshot_id).execute()
    return result.data[0]


def get_latest_snapshot(company_id: str) -> Optional[dict]:
    """Get the latest snapshot for a company."""
    sb = get_supabase()
    result = sb.table("company_snapshots") \
        .select("*") \
        .eq("company_id", company_id) \
        .eq("is_latest", True) \
        .execute()
    return result.data[0] if result.data else None


def update_company_status(company_id: str, status: str):
    """Update a company's status (pending, HVT, PM, PS, PT, PL)."""
    sb = get_supabase()
    sb.table("companies").update({"status": status}).eq("id", company_id).execute()


def get_companies_by_status(status: str) -> list[dict]:
    """Fetch all companies with a given status."""
    sb = get_supabase()
    result = sb.table("companies").select("*").eq("status", status).execute()
    return result.data or []


def get_all_companies() -> list[dict]:
    """Fetch all companies."""
    sb = get_supabase()
    result = sb.table("companies").select("*").execute()
    return result.data or []


def get_companies_with_latest_snapshots(status: Optional[str] = None) -> list[dict]:
    """
    Fetch companies joined with their latest snapshot.
    Optionally filter by status.
    Handles 1000+ companies with pagination and batched snapshot queries.
    """
    sb = get_supabase()

    # Paginate companies (Supabase default limit is 1000)
    companies = []
    page = 0
    page_size = 1000
    while True:
        query = sb.table("companies").select("*")
        if status:
            query = query.eq("status", status)
        result = query.range(page * page_size, (page + 1) * page_size - 1).execute()
        if not result.data:
            break
        companies.extend(result.data)
        if len(result.data) < page_size:
            break
        page += 1

    if not companies:
        return []

    # Batch snapshot queries in groups of 500 (URL length limit)
    company_ids = [c["id"] for c in companies]
    snapshots = []
    for i in range(0, len(company_ids), 500):
        batch_ids = company_ids[i:i+500]
        result = sb.table("company_snapshots") \
            .select("*") \
            .in_("company_id", batch_ids) \
            .eq("is_latest", True) \
            .execute()
        if result.data:
            snapshots.extend(result.data)

    snapshot_map = {s["company_id"]: s for s in snapshots}

    return [{
        **c,
        "snapshot": snapshot_map.get(c["id"]),
    } for c in companies]


def insert_website_snapshot(company_id: str, content_hash: str, change_detected: bool,
                            change_summary: Optional[str] = None,
                            raw_content: Optional[str] = None) -> dict:
    """Insert a new website monitoring snapshot."""
    sb = get_supabase()
    result = sb.table("website_snapshots").insert({
        "company_id": company_id,
        "content_hash": content_hash,
        "change_detected": change_detected,
        "change_summary": change_summary,
        "raw_content": raw_content,
    }).execute()
    return result.data[0]


def get_latest_website_snapshot(company_id: str) -> Optional[dict]:
    """Get the most recent website snapshot for a company."""
    sb = get_supabase()
    result = sb.table("website_snapshots") \
        .select("*") \
        .eq("company_id", company_id) \
        .order("checked_at", desc=True) \
        .limit(1) \
        .execute()
    return result.data[0] if result.data else None


def insert_linkedin_post(company_id: str, post_type: str, posted_by: str,
                         post_content: str, post_url: str,
                         posted_at: Optional[str] = None) -> dict:
    """Insert a LinkedIn post record."""
    sb = get_supabase()
    result = sb.table("linkedin_posts").insert({
        "company_id": company_id,
        "post_type": post_type,
        "posted_by": posted_by,
        "post_content": post_content,
        "post_url": post_url,
        "posted_at": posted_at or datetime.utcnow().isoformat(),
    }).execute()
    return result.data[0]


def upsert_outreach_summary(company_id: str, data: dict) -> dict:
    """Create or update outreach summary for a company."""
    sb = get_supabase()

    existing = sb.table("outreach_summary") \
        .select("*") \
        .eq("company_id", company_id) \
        .execute()

    if existing.data:
        result = sb.table("outreach_summary") \
            .update(data) \
            .eq("company_id", company_id) \
            .execute()
    else:
        result = sb.table("outreach_summary") \
            .insert({"company_id": company_id, **data}) \
            .execute()

    return result.data[0]

"""
API Usage Logger — tracks costs across Anthropic, Crust Data, Apollo, HubSpot
"""
import logging
from config import get_supabase

log = logging.getLogger(__name__)

# Cost estimates per API
COSTS = {
    "anthropic": {
        "input_per_million": 3.0,
        "output_per_million": 15.0,
    },
    "crustdata": {
        "per_credit": 0.05,
    },
    "apollo": {
        "per_credit": 0.03,
    },
    "hubspot": {
        "per_call": 0.0,  # Free
    },
}


def log_anthropic_usage(endpoint: str, company_name: str, input_tokens: int, output_tokens: int, success: bool = True, error_message: str = None):
    """Log an Anthropic API call with token counts."""
    cost = (input_tokens / 1_000_000 * COSTS["anthropic"]["input_per_million"] +
            output_tokens / 1_000_000 * COSTS["anthropic"]["output_per_million"])
    _insert_usage("anthropic", endpoint, company_name, cost, 1, input_tokens, output_tokens, success, error_message)


def log_crustdata_usage(endpoint: str, company_name: str, credits: int = 1, success: bool = True, error_message: str = None):
    """Log a Crust Data API call."""
    cost = credits * COSTS["crustdata"]["per_credit"]
    _insert_usage("crustdata", endpoint, company_name, cost, credits, success=success, error_message=error_message)


def log_apollo_usage(endpoint: str, company_name: str, credits: int = 1, success: bool = True, error_message: str = None):
    """Log an Apollo API call."""
    cost = credits * COSTS["apollo"]["per_credit"]
    _insert_usage("apollo", endpoint, company_name, cost, credits, success=success, error_message=error_message)


def log_hubspot_usage(endpoint: str, company_name: str = None, success: bool = True, error_message: str = None):
    """Log a HubSpot API call (free but tracked for volume)."""
    _insert_usage("hubspot", endpoint, company_name, 0.0, 1, success=success, error_message=error_message)


def _insert_usage(api_name: str, endpoint: str, company_name: str, cost: float, credits: int = 1,
                  input_tokens: int = None, output_tokens: int = None, success: bool = True, error_message: str = None):
    """Insert a usage record into the api_usage table."""
    try:
        sb = get_supabase()
        record = {
            "api_name": api_name,
            "endpoint": endpoint,
            "company_name": company_name,
            "estimated_cost_usd": round(cost, 6),
            "credits_used": credits,
            "success": success,
            "error_message": error_message,
        }
        if input_tokens is not None:
            record["input_tokens"] = input_tokens
        if output_tokens is not None:
            record["output_tokens"] = output_tokens

        sb.table("api_usage").insert(record).execute()
    except Exception as e:
        # Don't let logging failures break the pipeline
        log.warning(f"Failed to log API usage for {api_name}: {e}")

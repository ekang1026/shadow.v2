"""
Shadow Pipeline — Shared Configuration
Loads environment variables and creates shared clients.
"""

import os
from dotenv import load_dotenv
from supabase import create_client, Client

# Load .env from pipeline directory
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

# Supabase config — uses service role key for full access (bypasses RLS)
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

# Anthropic
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
LLM_MODEL = "claude-sonnet-4-20250514"

# PitchBook
PITCHBOOK_EMAIL = os.getenv("PITCHBOOK_EMAIL", "")
PITCHBOOK_PASSWORD = os.getenv("PITCHBOOK_PASSWORD", "")
PITCHBOOK_SEARCH_URL = os.getenv("PITCHBOOK_SEARCH_URL", "")

# Crust Data
CRUSTDATA_API_KEY = os.getenv("CRUSTDATA_API_KEY", "")

# HubSpot
HUBSPOT_API_KEY = os.getenv("HUBSPOT_API_KEY", "")

# Slack
SLACK_BOT_TOKEN = os.getenv("SLACK_BOT_TOKEN", "")

# Pipeline constants
HEADCOUNT_MIN = 8
HEADCOUNT_MAX = 30
REQUEUE_MONTHS = 3

# Supabase client (service role — bypasses RLS)
def get_supabase() -> Client:
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in pipeline/.env")
    return create_client(SUPABASE_URL, SUPABASE_KEY)

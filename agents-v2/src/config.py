"""Env loading."""
import os
from pathlib import Path
from dotenv import load_dotenv

_ENV_FILE = Path(__file__).resolve().parents[1] / ".env"
load_dotenv(_ENV_FILE, override=False)

GEMINI_API_KEY     = os.environ.get("GEMINI_API_KEY", "")
GROQ_API_KEY       = os.environ.get("GROQ_API_KEY", "")
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
CEREBRAS_API_KEY   = os.environ.get("CEREBRAS_API_KEY", "")
MISTRAL_API_KEY    = os.environ.get("MISTRAL_API_KEY", "")

DRY_RUN = os.environ.get("COUNCIL_DRY_RUN", "true").lower() == "true"
MIN_SCORE = int(os.environ.get("COUNCIL_MIN_SCORE", "88"))  # legacy, kept for back-compat
COUNCIL_MIN_REGIME   = int(os.environ.get("COUNCIL_MIN_REGIME",   "45"))
COUNCIL_MIN_ENTRY    = int(os.environ.get("COUNCIL_MIN_ENTRY",    "30"))
COUNCIL_4H_MIN_ENTRY = int(os.environ.get("COUNCIL_4H_MIN_ENTRY", "50"))
LOG_LEVEL = os.environ.get("COUNCIL_LOG_LEVEL", "INFO")

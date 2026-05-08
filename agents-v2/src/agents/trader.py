"""Trader node — final decision. Applies deterministic guardrails BEFORE LLM."""
import logging
from src.llm_client import call_llm
from src.prompts.trader import build
from src.schemas import (
    Candidate, TechnicalOutput, SentimentOutput, NewsOutput,
    ResearcherOutput, TraderOutput,
)

log = logging.getLogger(__name__)

BANNED_TFS = {"5m", "30m"}

def _hard_skip(reason: str) -> dict:
    return {"trader": {
        "decision": "SKIP", "reason": reason,
        "size_multiplier": 0.0, "payload": None,
    }}

def run(state: dict) -> dict:
    cand = Candidate(**state["candidate"])
    t = TechnicalOutput(**state["technical"])
    s = SentimentOutput(**state["sentiment"])
    n = NewsOutput(**state["news"])
    bull = ResearcherOutput(**state["bull"])
    bear = ResearcherOutput(**state["bear"])

    # ─── Deterministic guardrails (before spending Pro tokens) ──────────
    if cand.timeframe in BANNED_TFS:
        return _hard_skip(f"timeframe {cand.timeframe} not approved by council")
    if n.hard_block:
        return _hard_skip(f"news hard_block: {n.block_reason}")
    if bear.expected_rr > bull.expected_rr:
        return _hard_skip(
            f"asymmetry inverted: bear_rr={bear.expected_rr} > bull_rr={bull.expected_rr}"
        )
    if t.tf_alignment == "conflicting":
        return _hard_skip("technical timeframes conflicting")

    # ─── LLM final call ─────────────────────────────────────────────────
    sys, user = build(cand, t, s, n, bull, bear)
    try:
        raw = call_llm("trader", system=sys, user=user, as_json=True)
        out = TraderOutput(**raw)
        return {"trader": out.model_dump()}
    except Exception as e:
        log.error("trader agent failed: %s — defaulting to SKIP", e)
        return _hard_skip(f"trader llm error: {e}")

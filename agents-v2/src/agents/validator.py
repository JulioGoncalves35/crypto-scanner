"""Validator agent — deterministic pre-checks + LLM verification."""
import logging
from typing import Any

from src.llm_client import call_llm
from src.schemas import Candidate, ValidatorOutput
from src.prompts.validator import build as build_prompt

log = logging.getLogger(__name__)

CHRONIC_THRESHOLD = 6   # appearances out of last CHRONIC_LOOKBACK scans
CHRONIC_LOOKBACK  = 10


def is_chronic_candidate(coin: str, tf: str, history: list[dict]) -> bool:
    """True if (coin, tf) appeared in >=CHRONIC_THRESHOLD of the last
    CHRONIC_LOOKBACK scan decisions without ever opening."""
    recent = history[-CHRONIC_LOOKBACK:]
    hits = sum(
        1 for h in recent
        if h.get("candidate_coin") == coin
        and h.get("candidate_tf") == tf
        and h.get("final_decision") in ("SKIP", "BLOCKED")
    )
    return hits >= CHRONIC_THRESHOLD


def saturation_percentile(regime_score: int, batch_scores: list[int]) -> float:
    """Where does this |regime_score| sit in the current scan batch?
    Higher = more saturated (everyone bullish at the same time)."""
    if not batch_scores:
        return 0.0
    target = abs(regime_score)
    below = sum(1 for s in batch_scores if abs(s) <= target)
    return below / len(batch_scores)


def run(state: dict) -> dict:
    cand_raw = state["candidate"]
    cand = cand_raw if isinstance(cand_raw, Candidate) else Candidate(**cand_raw)
    batch = state.get("scan_batch_regime_scores", [])
    history = state.get("history", [])

    chronic = is_chronic_candidate(cand.coin, cand.timeframe, history)
    sat = saturation_percentile(cand.regime_score, batch)

    sys, user = build_prompt(cand, chronic=chronic, saturation=sat,
                             signals=cand.signals)
    try:
        raw = call_llm("validator", system=sys, user=user, as_json=True)
        # Force-overwrite deterministic fields (LLM may hallucinate them)
        raw["chronic_candidate"] = chronic
        raw["saturation_percentile"] = sat
        out = ValidatorOutput(**raw)
        return {"validator": out.model_dump()}
    except Exception as e:
        log.error("validator failed: %s — DOWNGRADE fallback", e)
        fallback = ValidatorOutput(
            verdict="DOWNGRADE", confidence=0,
            key_concern=f"validator error: {e}",
            tf_coherent=True, signals_verified=False,
            chronic_candidate=chronic, saturation_percentile=sat,
        )
        return {
            "validator": fallback.model_dump(),
            "errors": [f"validator: {e}"],
        }

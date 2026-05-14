"""Validator agent — deterministic pre-checks + LLM verification."""
import logging
from typing import Any

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

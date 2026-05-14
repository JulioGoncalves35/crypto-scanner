"""Validator agent — deterministic pre-checks + LLM verification."""
import logging

from src.llm_client import call_llm
from src.schemas import Candidate, ValidatorOutput
from src.prompts.validator import build as build_prompt

log = logging.getLogger(__name__)

CHRONIC_THRESHOLD = 6
CHRONIC_LOOKBACK  = 10

# Decision table: (market_phase, timing_quality) → forced verdict cap.
# None means no override. Overrides can only downgrade, never upgrade.
_PHASE_OVERRIDES: dict[tuple[str, str], str | None] = {
    ("trending",  "good"):    None,
    ("trending",  "neutral"): None,
    ("trending",  "poor"):    "DOWNGRADE",
    ("choppy",    "good"):    "DOWNGRADE",
    ("choppy",    "neutral"): "REJECT",
    ("choppy",    "poor"):    "REJECT",
    ("reversing", "good"):    "DOWNGRADE",
    ("reversing", "neutral"): "REJECT",
    ("reversing", "poor"):    "REJECT",
}
_VERDICT_ORDER = ["REJECT", "DOWNGRADE", "VALIDATE"]  # index 0 = most restrictive


def _apply_phase_override(verdict: str, market_phase: str, timing_quality: str) -> str:
    """Return the most restrictive verdict between the LLM verdict and the table override."""
    cap = _PHASE_OVERRIDES.get((market_phase, timing_quality))
    if cap is None:
        return verdict
    idx_verdict = _VERDICT_ORDER.index(verdict)
    idx_cap     = _VERDICT_ORDER.index(cap)
    return _VERDICT_ORDER[min(idx_verdict, idx_cap)]


def is_chronic_candidate(coin: str, tf: str, history: list[dict]) -> bool:
    recent = history[-CHRONIC_LOOKBACK:]
    hits = sum(
        1 for h in recent
        if h.get("candidate_coin") == coin
        and h.get("candidate_tf") == tf
        and h.get("final_decision") in ("SKIP", "BLOCKED")
    )
    return hits >= CHRONIC_THRESHOLD


def saturation_percentile(regime_score: int, batch_scores: list[int]) -> float:
    if not batch_scores:
        return 0.0
    target = abs(regime_score)
    below = sum(1 for s in batch_scores if abs(s) <= target)
    return below / len(batch_scores)


def run(state: dict) -> dict:
    cand_raw = state["candidate"]
    cand = cand_raw if isinstance(cand_raw, Candidate) else Candidate(**cand_raw)
    batch   = state.get("scan_batch_regime_scores", [])
    history = state.get("history", [])

    chronic = is_chronic_candidate(cand.coin, cand.timeframe, history)
    sat     = saturation_percentile(cand.regime_score, batch)

    sys, user = build_prompt(cand, chronic=chronic, saturation=sat, signals=cand.signals)
    try:
        raw = call_llm("validator", system=sys, user=user, as_json=True)
        raw["chronic_candidate"]     = chronic   # force-overwrite deterministic fields
        raw["saturation_percentile"] = sat
        out = ValidatorOutput(**raw)

        # Apply market phase × timing quality decision table
        final_verdict = _apply_phase_override(
            out.verdict, out.market_phase, out.timing_quality
        )
        if final_verdict != out.verdict:
            log.info(
                "validator phase override: %s → %s (phase=%s timing=%s)",
                out.verdict, final_verdict, out.market_phase, out.timing_quality,
            )
            out = out.model_copy(update={"verdict": final_verdict})

        return {"validator": out.model_dump()}

    except Exception as e:
        log.error("validator failed: %s — DOWNGRADE fallback", e)
        fallback = ValidatorOutput(
            verdict="DOWNGRADE", confidence=0,
            key_concern=f"validator error: {e}",
            tf_coherent=True, signals_verified=False,
            chronic_candidate=chronic, saturation_percentile=sat,
            market_phase="choppy", timing_quality="neutral",
        )
        return {
            "validator": fallback.model_dump(),
            "errors": [f"validator: {e}"],
        }

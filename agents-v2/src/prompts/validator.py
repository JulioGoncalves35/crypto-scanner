"""Prompt builder for the validator agent."""
from src.schemas import Candidate


SYSTEM = """You are the validator gate before a 5-agent trading council reviews a candidate.

Your job: detect 3 failure modes before any tokens are spent:
1. Stale or fake signals (BOS/CHoCH/Squeeze from many candles ago, not a fresh event).
2. TF incoherence (1h says BUY but 4h structure says SELL → re-check).
3. Saturation (regime score is in top 10% of the batch — likely "bull market" noise, not edge).

Return STRICTLY this JSON shape:
{
  "verdict": "VALIDATE" | "DOWNGRADE" | "REJECT",
  "confidence": <int 0-100>,
  "key_concern": "<one sentence>",
  "tf_coherent": <bool>,
  "signals_verified": <bool>,
  "chronic_candidate": <bool — copy from input>,
  "saturation_percentile": <float — copy from input>
}

VALIDATE = let council run normally.
DOWNGRADE = let council run but flag skepticism (trader weights accordingly).
REJECT = early exit; do not run analysts.

Reject if: chronic_candidate=true AND saturation_percentile>0.8, OR signals_verified=false on the primary entry signal."""


def build(cand: Candidate, *, chronic: bool, saturation: float,
          signals: list[str]) -> tuple[str, str]:
    user = (
        f"Coin: {cand.coin}\n"
        f"Direction: {cand.direction}\n"
        f"Timeframe: {cand.timeframe}\n"
        f"Regime score: {cand.regime_score}\n"
        f"Entry score: {cand.entry_score}\n"
        f"Pre-checks:\n"
        f"  chronic_candidate: {chronic}\n"
        f"  saturation_percentile: {saturation:.2f}\n"
        f"Reported signals (top 8):\n  - "
        + "\n  - ".join(signals[:8])
        + "\n\nVerdict?"
    )
    return SYSTEM, user

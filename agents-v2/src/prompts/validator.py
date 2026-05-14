"""Prompt builder for the validator agent."""
from src.schemas import Candidate


SYSTEM = """You are the validator gate before a 5-agent trading council reviews a candidate.

Your job: detect 4 failure modes before any tokens are spent:
1. Stale or fake signals (BOS/CHoCH/Squeeze from many candles ago, not a fresh event).
2. TF incoherence (1h says BUY but 4h structure says SELL → re-check).
3. Saturation (regime score is in top 10% of the batch — likely "bull market" noise, not edge).
4. Bad market phase or timing (momentum indicators against entry direction).

Return STRICTLY this JSON shape:
{
  "verdict": "VALIDATE" | "DOWNGRADE" | "REJECT",
  "confidence": <int 0-100>,
  "key_concern": "<one sentence>",
  "tf_coherent": <bool>,
  "signals_verified": <bool>,
  "chronic_candidate": <bool — copy from input>,
  "saturation_percentile": <float — copy from input>,
  "market_phase": "trending" | "choppy" | "reversing",
  "timing_quality": "good" | "neutral" | "poor"
}

VALIDATE = let council run normally.
DOWNGRADE = let council run but flag skepticism (trader weights accordingly).
REJECT = early exit; do not run analysts.

Reject if: chronic_candidate=true AND saturation_percentile>0.8, OR signals_verified=false on the primary entry signal.

market_phase definitions:
  "trending":  clear directional movement aligned with trade direction
  "choppy":    consolidation or unclear direction, no strong trend
  "reversing": short-term momentum (RSI, MACD) showing pressure AGAINST trade direction

timing_quality definitions:
  "good":    momentum confirms triggers (RSI not overbought for longs, MACD aligned)
  "neutral": mixed signals, triggers are real but timing is uncertain
  "poor":    momentum clearly against entry direction"""


def build(cand: Candidate, *, chronic: bool, saturation: float,
          signals: list[str]) -> tuple[str, str]:
    mc = cand.momentum_ctx

    if mc:
        rsi_val   = round(mc["rsi"],     1) if mc.get("rsi")      is not None else "N/A"
        stoch_val = round(mc["stochRSI"], 1) if mc.get("stochRSI") is not None else "N/A"
        macd_val  = mc.get("macdCross") or "null"
        bb_val    = mc.get("bbPos")     or "null"
        momentum_section = (
            f"\nMOMENTUM CONTEXT (excluded from entry score — evaluate in context of setup direction):\n"
            f"  RSI:         {rsi_val}\n"
            f"  StochRSI:    {stoch_val}\n"
            f"  MACD cross:  {macd_val}   (up=bullish cross, down=bearish cross, null=no recent cross)\n"
            f"  BB position: {bb_val}   (upper=near upper band, lower=near lower band, inside=normal)\n"
            f"\nDirection: {cand.direction}\n"
            f"Regime score: {cand.regime_score}\n"
            f"Entry score (trigger magnitude): {cand.entry_score}\n"
        )
    else:
        momentum_section = (
            f"\nMOMENTUM CONTEXT: not available (old candidate format).\n"
            f"Default to market_phase=\"choppy\", timing_quality=\"neutral\".\n"
            f"\nDirection: {cand.direction}\n"
            f"Regime score: {cand.regime_score}\n"
            f"Entry score (trigger magnitude): {cand.entry_score}\n"
        )

    user = (
        f"Coin: {cand.coin}\n"
        f"Timeframe: {cand.timeframe}\n"
        f"Pre-checks:\n"
        f"  chronic_candidate: {chronic}\n"
        f"  saturation_percentile: {saturation:.2f}\n"
        f"Reported signals (top 8):\n  - "
        + "\n  - ".join(signals[:8])
        + momentum_section
        + "\nVerdict?"
    )
    return SYSTEM, user

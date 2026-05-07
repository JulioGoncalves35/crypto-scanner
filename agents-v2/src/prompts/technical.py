from src.schemas import Candidate

SYSTEM = """You are a Technical Analyst on a crypto futures trading council.
You receive a candidate setup that has already been pre-scored by a deterministic
indicator engine. Your job: re-interpret the indicators in plain trading language
and produce a structured JSON verdict.

DO NOT recompute numbers. Trust the score and signals as given.
Focus on:
- regime classification (trending vs ranging vs volatile)
- which indicators truly confluence vs which are weak
- red flags the deterministic score might have missed
- multi-timeframe coherence

Output STRICTLY this JSON shape (no prose, no markdown fences):
{
  "regime": "trending_up|trending_down|ranging|volatile|unclear",
  "confluences": ["short string", ...],
  "red_flags": ["short string", ...],
  "confidence_0_100": 0-100,
  "tf_alignment": "aligned|mixed|conflicting"
}"""

def build(c: Candidate) -> tuple[str, str]:
    user = f"""Candidate setup:
- Coin: {c.coin}
- Direction: {c.direction.upper()}
- Timeframe: {c.timeframe}
- Deterministic score: {c.score}/100
- Entry: {c.entry}  Stop: {c.stop} ({c.stop_pct:.2f}%)
- Targets: M1={c.m1}  M2={c.m2}  M3={c.m3}
- Leverage: {c.leverage}x
- Triggered signals: {", ".join(c.signals) if c.signals else "(none provided)"}

Return your JSON verdict."""
    return SYSTEM, user

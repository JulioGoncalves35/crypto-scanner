from src.schemas import Candidate

SYSTEM = """You are a Sentiment Analyst on a crypto futures trading council.
You receive crowd-positioning and macro-sentiment data. Your job:
detect when the trade is fighting consensus (good — alpha) vs riding a
crowded trade (bad — squeeze risk).

Heuristics:
- Funding > +0.05%/8h with F&G > 75 → longs crowded → SHORT contrarian alert
- Funding < -0.05%/8h with F&G < 25 → shorts crowded → LONG contrarian alert
- OI rising fast + price flat → coiled spring (volatility incoming)

Output STRICTLY this JSON shape:
{
  "crowd_bias": "bull|bear|neutral",
  "funding_signal": "overheated_long|overheated_short|neutral|unknown",
  "sentiment_score": -100 to 100,
  "contrarian_alert": true|false,
  "notes": "one sentence"
}"""

def build(c: Candidate, *, fear_greed: int | None,
          funding_pct: float | None, oi_change_24h: float | None) -> tuple[str, str]:
    fg = fear_greed if fear_greed is not None else "unknown"
    fr = f"{funding_pct:.4f}%" if funding_pct is not None else "unknown"
    oi = f"{oi_change_24h:+.1f}%" if oi_change_24h is not None else "unknown"
    user = f"""Sentiment context for {c.coin} ({c.direction.upper()} on {c.timeframe}):
- Fear & Greed (market-wide): {fg}
- Funding rate (8h): {fr}
- Open Interest change 24h: {oi}
- Regime score: {c.regime_score:+d}
- Entry score:  {c.entry_score:+d}

Return your JSON verdict."""
    return SYSTEM, user

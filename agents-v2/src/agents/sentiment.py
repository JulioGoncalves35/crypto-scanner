import logging
import httpx
from src.llm_client import call_llm
from src.prompts.sentiment import build
from src.schemas import Candidate, SentimentOutput

log = logging.getLogger(__name__)

def _fetch_market_signals(coin: str) -> tuple[int | None, float | None, float | None]:
    """Returns (fear_greed, funding_pct, oi_change_24h). All optional.
    Best-effort: any failure returns None for that field."""
    fg, funding, oi = None, None, None
    try:
        r = httpx.get("https://api.alternative.me/fng/?limit=1", timeout=5)
        fg = int(r.json()["data"][0]["value"])
    except Exception as e:
        log.debug("fear&greed fetch failed: %s", e)

    symbol = f"{coin}USDT"
    try:
        r = httpx.get(
            "https://api.bybit.com/v5/market/funding/history",
            params={"category": "linear", "symbol": symbol, "limit": 1},
            timeout=5,
        )
        rows = r.json()["result"]["list"]
        if rows:
            funding = float(rows[0]["fundingRate"]) * 100
    except Exception as e:
        log.debug("funding fetch failed: %s", e)

    try:
        r = httpx.get(
            "https://api.bybit.com/v5/market/open-interest",
            params={"category": "linear", "symbol": symbol,
                    "intervalTime": "1h", "limit": 25},
            timeout=5,
        )
        rows = r.json()["result"]["list"]
        if len(rows) >= 25:
            now = float(rows[0]["openInterest"])
            then = float(rows[-1]["openInterest"])
            oi = (now - then) / then * 100 if then else None
    except Exception as e:
        log.debug("oi fetch failed: %s", e)

    return fg, funding, oi

def run(state: dict) -> dict:
    cand = Candidate(**state["candidate"])
    fg, funding, oi = _fetch_market_signals(cand.coin)
    sys, user = build(cand, fear_greed=fg, funding_pct=funding, oi_change_24h=oi)
    try:
        raw = call_llm("sentiment", system=sys, user=user, as_json=True)
        out = SentimentOutput(**raw)
        return {"sentiment": out.model_dump()}
    except Exception as e:
        log.error("sentiment agent failed: %s — using fallback", e)
        fallback = SentimentOutput(
            crowd_bias="neutral", funding_signal="unknown",
            sentiment_score=0, contrarian_alert=False,
            notes=f"agent_error: {e}",
        )
        return {
            "sentiment": fallback.model_dump(),
            "errors": [f"sentiment: {e}"],
        }

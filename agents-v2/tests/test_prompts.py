from src.prompts.technical import build as build_tech
from src.prompts.sentiment import build as build_sent
from src.prompts.news import build as build_news
from src.schemas import Candidate

C = Candidate(coin="BTC", direction="buy", timeframe="1h", score=88,
              entry=70000, stop=68500, m1=71200, m2=72500, m3=74000,
              stop_pct=2.1, leverage=10,
              signals=["EMA200 bullish", "ADX 28", "BOS up"])

def test_technical_prompt_contains_candidate_fields():
    sys, user = build_tech(C)
    assert "BTC" in user
    assert "1h" in user
    assert "88" in user
    assert "EMA200 bullish" in user
    assert "JSON" in sys

def test_sentiment_prompt_includes_funding_field_request():
    sys, user = build_sent(C, fear_greed=72, funding_pct=0.04, oi_change_24h=15.0)
    assert "72" in user
    assert "0.04" in user
    assert "JSON" in sys

def test_news_prompt_demands_verification_section():
    sys, _ = build_news(C)
    assert "VERIFIED" in sys
    assert "MEDIUM" in sys
    assert "UNVERIFIED" in sys

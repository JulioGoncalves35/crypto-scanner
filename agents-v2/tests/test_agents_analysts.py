from unittest.mock import patch
from src.schemas import Candidate, CouncilState
from src.agents.technical import run as run_tech
from src.agents.sentiment import run as run_sent
from src.agents.news import run as run_news

C = Candidate(coin="BTC", direction="buy", timeframe="1h", score=88,
              entry=70000, stop=68500, m1=71200, m2=72500, m3=74000,
              stop_pct=2.1, leverage=10, signals=[])

def test_technical_node_populates_state():
    state = CouncilState(candidate=C)
    fake_resp = {
        "regime": "trending_up", "confluences": ["x"], "red_flags": [],
        "confidence_0_100": 75, "tf_alignment": "aligned",
    }
    with patch("src.agents.technical.call_llm", return_value=fake_resp):
        out = run_tech(state.model_dump())
    assert out["technical"]["confidence_0_100"] == 75

def test_sentiment_node_handles_missing_funding():
    state = CouncilState(candidate=C)
    fake_resp = {
        "crowd_bias": "neutral", "funding_signal": "unknown",
        "sentiment_score": 0, "contrarian_alert": False, "notes": "no data",
    }
    with patch("src.agents.sentiment.call_llm", return_value=fake_resp), \
         patch("src.agents.sentiment._fetch_market_signals",
               return_value=(None, None, None)):
        out = run_sent(state.model_dump())
    assert out["sentiment"]["crowd_bias"] == "neutral"

def test_news_node_records_hard_block():
    state = CouncilState(candidate=C)
    fake_resp = {
        "news_bias": "bear", "catalyst_window_hours": 6, "hard_block": True,
        "block_reason": "FOMC in 6h", "items": [],
    }
    with patch("src.agents.news.call_llm", return_value=fake_resp):
        out = run_news(state.model_dump())
    assert out["news"]["hard_block"] is True

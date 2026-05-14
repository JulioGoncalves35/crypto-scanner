from src.prompts.technical import build as build_tech
from src.prompts.sentiment import build as build_sent
from src.prompts.news import build as build_news
from src.schemas import Candidate

C = Candidate(coin="BTC", direction="buy", timeframe="1h", regime_score=60, entry_score=40,
              entry=70000, stop=68500, m1=71200, m2=72500, m3=74000,
              stop_pct=2.1, leverage=10,
              signals=["EMA200 bullish", "ADX 28", "BOS up"])

def test_technical_prompt_contains_candidate_fields():
    sys, user = build_tech(C)
    assert "BTC" in user
    assert "1h" in user
    assert "+60" in user  # regime_score
    assert "+40" in user  # entry_score
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


from src.prompts.bull import build as build_bull
from src.prompts.bear import build as build_bear
from src.prompts.trader import build as build_trader
from src.prompts.risk_reviewer import build as build_risk
from src.schemas import (
    TechnicalOutput, SentimentOutput, NewsOutput, ResearcherOutput,
)

T = TechnicalOutput(regime="trending_up", confluences=["ADX>25"], red_flags=[],
                    confidence_0_100=78, tf_alignment="aligned")
S = SentimentOutput(crowd_bias="neutral", funding_signal="neutral",
                    sentiment_score=10, contrarian_alert=False, notes="ok")
N = NewsOutput(news_bias="neutral", catalyst_window_hours=None, hard_block=False)

def test_bull_prompt_includes_other_agents():
    sys, user = build_bull(C, T, S, N)
    assert "trending_up" in user
    assert "ADX>25" in user
    assert "JSON" in sys

def test_bear_prompt_demands_invalidation():
    sys, _ = build_bear(C, T, S, N)
    assert "invalidat" in sys.lower()

def test_trader_prompt_includes_researchers():
    bull = ResearcherOutput(side="bull", thesis="t", evidence=["e1"],
                            counter_to_other_side="c", expected_rr=2.5)
    bear = ResearcherOutput(side="bear", thesis="t", evidence=["e1"],
                            counter_to_other_side="c", expected_rr=1.0)
    sys, user = build_trader(C, T, S, N, bull, bear)
    assert "OPEN" in sys and "SKIP" in sys
    assert "expected_rr" in user or "2.5" in user

def test_risk_prompt_lists_action_options():
    trade = {"id": "bk-1", "coin": "BTC", "direction": "buy",
             "entry": 70000, "current_stop": 69500, "m1": 71200,
             "status": "active", "score": 88}
    sys, user = build_risk(trade, current_price=70450)
    assert "HOLD" in sys and "EXIT" in sys and "TIGHTEN_STOP" in sys
    assert "70450" in user

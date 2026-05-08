from unittest.mock import patch
from src.schemas import (
    Candidate, CouncilState, TechnicalOutput, SentimentOutput, NewsOutput,
    ResearcherOutput,
)
from src.agents.bull import run as run_bull
from src.agents.bear import run as run_bear
from src.agents.trader import run as run_trader
from src.agents.risk_reviewer import run as run_risk

C = Candidate(coin="BTC", direction="buy", timeframe="1h", score=88,
              entry=70000, stop=68500, m1=71200, m2=72500, m3=74000,
              stop_pct=2.1, leverage=10, signals=["x"])
T = TechnicalOutput(regime="trending_up", confluences=["a"], red_flags=[],
                    confidence_0_100=78, tf_alignment="aligned")
S = SentimentOutput(crowd_bias="neutral", funding_signal="neutral",
                    sentiment_score=10, contrarian_alert=False, notes="ok")
N = NewsOutput(news_bias="neutral", hard_block=False)

def _state_with_analysts():
    return CouncilState(candidate=C, technical=T, sentiment=S, news=N).model_dump()

def test_bull_populates_state():
    fake = {"side": "bull", "thesis": "t", "evidence": ["e"],
            "counter_to_other_side": "c", "expected_rr": 2.5}
    with patch("src.agents.bull.call_llm", return_value=fake):
        out = run_bull(_state_with_analysts())
    assert out["bull"]["expected_rr"] == 2.5

def test_trader_skip_on_news_hard_block():
    state = _state_with_analysts()
    state["news"]["hard_block"] = True
    state["news"]["block_reason"] = "FOMC in 4h"
    state["bull"] = {"side": "bull", "thesis": "t", "evidence": ["e"],
                     "counter_to_other_side": "c", "expected_rr": 2.5}
    state["bear"] = {"side": "bear", "thesis": "t", "evidence": ["e"],
                     "counter_to_other_side": "c", "expected_rr": 1.0}
    out = run_trader(state)
    assert out["trader"]["decision"] == "SKIP"
    assert "FOMC" in out["trader"]["reason"] or "block" in out["trader"]["reason"].lower()

def test_trader_skip_on_5m_timeframe():
    cand_5m = C.model_copy(update={"timeframe": "5m"})
    state = CouncilState(candidate=cand_5m, technical=T, sentiment=S, news=N,
        bull=ResearcherOutput(side="bull", thesis="t", evidence=["e"],
                              counter_to_other_side="c", expected_rr=3.0),
        bear=ResearcherOutput(side="bear", thesis="t", evidence=["e"],
                              counter_to_other_side="c", expected_rr=1.0),
    ).model_dump()
    out = run_trader(state)
    assert out["trader"]["decision"] == "SKIP"
    assert "5m" in out["trader"]["reason"] or "timeframe" in out["trader"]["reason"].lower()

def test_risk_reviewer_returns_action():
    trade = {"id": "bk-1", "coin": "BTC", "direction": "buy", "status": "active",
             "score": 88, "entry": 70000, "current_stop": 69500, "m1": 71200}
    fake = {"trade_id": "bk-1", "action": "HOLD", "new_stop": None,
            "reason": "thesis intact"}
    with patch("src.agents.risk_reviewer.call_llm", return_value=fake):
        out = run_risk(trade, current_price=70450)
    assert out["action"] == "HOLD"

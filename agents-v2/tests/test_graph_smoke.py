from unittest.mock import patch
from src.schemas import Candidate
from src.graph import run_council

C = Candidate(coin="BTC", direction="buy", timeframe="1h",
              regime_score=60, entry_score=40,
              entry=70000, stop=68500, m1=71200, m2=72500, m3=74000,
              stop_pct=2.1, leverage=10, signals=["x"])


def test_full_pipeline_open_decision():
    fake_validator = {
        "verdict": "VALIDATE", "confidence": 80,
        "key_concern": "fresh setup", "tf_coherent": True,
        "signals_verified": True, "chronic_candidate": False,
        "saturation_percentile": 0.4,
    }
    fake_tech = {"regime": "trending_up", "confluences": ["a"], "red_flags": [],
                 "confidence_0_100": 80, "tf_alignment": "aligned"}
    fake_sent = {"crowd_bias": "neutral", "funding_signal": "neutral",
                 "sentiment_score": 10, "contrarian_alert": False, "notes": "ok"}
    fake_news = {"news_bias": "neutral", "hard_block": False}
    fake_bull = {"side": "bull", "thesis": "t", "evidence": ["e"],
                 "counter_to_other_side": "c", "expected_rr": 2.5}
    fake_bear = {"side": "bear", "thesis": "t", "evidence": ["e"],
                 "counter_to_other_side": "c", "expected_rr": 1.0}
    fake_trader = {
        "decision": "OPEN", "reason": "bull dominant", "size_multiplier": 1.0,
        "payload": {
            "coin": "BTC", "direction": "buy", "timeframe": "1h",
            "regime_score": 60, "entry_score": 40,
            "entry": 70000, "stop": 68500, "m1": 71200, "m2": 72500, "m3": 74000,
            "stop_pct": 2.1, "leverage": 10, "type": "day", "signals": [],
        },
    }
    with patch("src.agents.validator.call_llm", return_value=fake_validator), \
         patch("src.agents.technical.call_llm", return_value=fake_tech), \
         patch("src.agents.sentiment.call_llm", return_value=fake_sent), \
         patch("src.agents.sentiment._fetch_market_signals",
               return_value=(50, 0.01, 5.0)), \
         patch("src.agents.news.call_llm", return_value=fake_news), \
         patch("src.agents.bull.call_llm", return_value=fake_bull), \
         patch("src.agents.bear.call_llm", return_value=fake_bear), \
         patch("src.agents.trader.call_llm", return_value=fake_trader):
        final = run_council(C)
    assert final["trader"]["decision"] == "OPEN"
    assert final["trader"]["payload"]["coin"] == "BTC"


def test_graph_early_exits_on_reject(monkeypatch):
    fake_reject = {
        "verdict": "REJECT", "confidence": 95, "key_concern": "stale signal",
        "tf_coherent": True, "signals_verified": False,
        "chronic_candidate": True, "saturation_percentile": 0.95,
    }
    monkeypatch.setattr("src.agents.validator.call_llm",
                        lambda *a, **kw: fake_reject)

    final = run_council(C)
    assert final.get("technical") is None  # analysts did NOT run
    assert final["trader"]["decision"] == "SKIP"
    assert "validator REJECT" in final["trader"]["reason"]

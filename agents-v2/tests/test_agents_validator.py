from src.agents.validator import is_chronic_candidate, saturation_percentile


def test_chronic_candidate_true_when_seen_repeatedly():
    history = [
        {"candidate_coin": "BTC", "candidate_tf": "1h", "final_decision": "SKIP"},
    ] * 8
    assert is_chronic_candidate("BTC", "1h", history) is True


def test_chronic_candidate_false_when_not_repeated():
    history = [
        {"candidate_coin": "ETH", "candidate_tf": "1h", "final_decision": "SKIP"},
    ] * 8
    assert is_chronic_candidate("BTC", "1h", history) is False


def test_saturation_percentile_top_of_batch():
    scan_regime_scores = [40, 50, 55, 60, 90]
    p = saturation_percentile(90, scan_regime_scores)
    assert p == 1.0


def test_saturation_percentile_middle():
    p = saturation_percentile(55, [40, 50, 55, 60, 90])
    assert 0.4 <= p <= 0.7


def test_validator_run_fallback_on_llm_error(monkeypatch):
    from src.agents import validator
    from src.schemas import Candidate

    cand = Candidate(
        coin="BTC", direction="buy", timeframe="1h",
        regime_score=55, entry_score=35,
        entry=100.0, stop=98.0, m1=102.0, m2=104.0, m3=106.0,
        stop_pct=-2.0, leverage=10, signals=["RSI 22 - Sobrevendido"],
    )

    def boom(*a, **kw):
        raise RuntimeError("provider down")
    monkeypatch.setattr("src.agents.validator.call_llm", boom)

    state = {
        "candidate": cand.model_dump(),
        "scan_batch_regime_scores": [40, 50, 55, 60],
        "history": [],
    }
    out = validator.run(state)
    assert out["validator"]["verdict"] == "DOWNGRADE"
    assert "errors" in out


def test_validator_run_success(monkeypatch):
    from src.agents import validator
    from src.schemas import Candidate

    cand = Candidate(
        coin="BTC", direction="buy", timeframe="1h",
        regime_score=55, entry_score=35,
        entry=100.0, stop=98.0, m1=102.0, m2=104.0, m3=106.0,
        stop_pct=-2.0, leverage=10, signals=["BOS up"],
    )

    def ok(*a, **kw):
        return {
            "verdict": "VALIDATE", "confidence": 75,
            "key_concern": "fresh BOS, TFs aligned",
            "tf_coherent": True, "signals_verified": True,
            "chronic_candidate": False, "saturation_percentile": 0.0,
        }
    monkeypatch.setattr("src.agents.validator.call_llm", ok)

    state = {"candidate": cand.model_dump(),
             "scan_batch_regime_scores": [40, 55, 60], "history": []}
    out = validator.run(state)
    assert out["validator"]["verdict"] == "VALIDATE"
    assert "errors" not in out

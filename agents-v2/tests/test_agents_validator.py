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

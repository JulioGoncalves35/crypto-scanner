from src.schemas import Candidate
from run_backtest_replay import score_replay

def test_replay_scoring_open_win():
    cand = Candidate(coin="BTC", direction="buy", timeframe="1h", regime_score=60, entry_score=40,
                     entry=100, stop=95, m1=105, m2=110, m3=115,
                     stop_pct=5, leverage=10, signals=[])
    outcome = {"hit": "m1", "pnl_pct": 5.0}
    fake_decision = {"decision": "OPEN"}
    rec = score_replay(cand, fake_decision, outcome)
    assert rec["correct"] is True
    assert rec["pnl_attributed"] == 5.0

def test_replay_scoring_skip_avoid_loss():
    cand = Candidate(coin="BTC", direction="buy", timeframe="1h", regime_score=55, entry_score=35,
                     entry=100, stop=95, m1=105, m2=110, m3=115,
                     stop_pct=5, leverage=10, signals=[])
    outcome = {"hit": "stop", "pnl_pct": -5.0}
    fake_decision = {"decision": "SKIP"}
    rec = score_replay(cand, fake_decision, outcome)
    assert rec["correct"] is True
    assert rec["pnl_attributed"] == 5.0

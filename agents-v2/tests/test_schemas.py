import pytest
from pydantic import ValidationError

from src.schemas import (
    Candidate, TechnicalOutput, SentimentOutput, NewsOutput,
    ResearcherOutput, TraderOutput, CouncilState,
)

def test_candidate_strips_usdt_suffix():
    c = Candidate(coin="XRPUSDT", direction="buy", timeframe="1h",
                  score=88, entry=1.0, stop=0.95, m1=1.05, m2=1.10, m3=1.15,
                  stop_pct=0.05, leverage=10, signals=[])
    assert c.coin == "XRP"

def test_candidate_rejects_invalid_dir():
    with pytest.raises(ValidationError):
        Candidate(coin="BTC", direction="long", timeframe="1h",
                  score=80, entry=1, stop=0.9, m1=1.1, m2=1.2, m3=1.3,
                  stop_pct=0.1, leverage=10, signals=[])

def test_trader_output_open_requires_payload():
    with pytest.raises(ValidationError):
        TraderOutput(decision="OPEN", reason="x")

def test_trader_output_skip_no_payload_ok():
    t = TraderOutput(decision="SKIP", reason="bear dominant")
    assert t.payload is None

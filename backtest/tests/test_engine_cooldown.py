"""Tests for engine cooldown fix: no overlapping trades on same (coin, tf)."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

import pandas as pd
import numpy as np
from engine import run_validation_window

# ── helpers ──────────────────────────────────────────────────────────────────

def _make_df(n: int, trend: str = "down") -> pd.DataFrame:
    """Synthetic OHLCV DataFrame that reliably generates SELL signals (score>=85).
    Uses a steady downtrend: price drops 0.3% each candle, high volume,
    indicators pre-tuned to generate high bearish scores.
    """
    rng = np.random.default_rng(42)
    base = 20000.0
    rows = []
    for i in range(n):
        # Steady downtrend
        close = base * (1 - 0.003 * i)
        open_ = close * 1.002
        high  = open_ * 1.001
        low   = close * 0.999
        vol   = 5000.0 + rng.uniform(-500, 500)
        ts    = 1_650_000_000_000 + i * 300_000  # 5m candles
        rows.append({"timestamp": ts, "open": open_, "high": high, "low": low, "close": close, "volume": vol})
    return pd.DataFrame(rows)


def _make_data(n: int = 700) -> dict:
    return {("BTC", "5m"): _make_df(n)}


def _val_window(df: pd.DataFrame):
    """Returns (val_start, val_end) covering the last 100 candles."""
    start_ts = int(df["timestamp"].iloc[-100])
    end_ts   = int(df["timestamp"].iloc[-1]) + 1
    return (
        pd.Timestamp(start_ts, unit="ms", tz="UTC"),
        pd.Timestamp(end_ts,   unit="ms", tz="UTC"),
    )


# ── tests ────────────────────────────────────────────────────────────────────

def test_no_overlapping_trades():
    """After a trade opens, engine must not generate another until the first closes."""
    from unittest.mock import patch

    data  = _make_data(700)
    df    = data[("BTC", "5m")]
    val_s, val_e = _val_window(df)

    # Fake signal returned by analyze_candles so the engine cooldown is exercised.
    # candles_held=10 means the engine must skip the next 10 candle indices.
    fake_signal = {
        "direction": "sell",
        "score": 90,
        "raw_score": -90,
        "price": 19000.0,
        "stop": 19200.0,
        "stop_pct": 0.0105,
        "m1": 18694.58,
        "m2": 18501.42,
        "m3": 18194.16,
        "atr": 100.0,
        "adx": 28.0,
        "rsi": 38.0,
    }

    with patch("engine.analyze_candles", return_value=fake_signal):
        trades, _ = run_validation_window(
            data,
            coins=["BTC"],
            timeframes=["5m"],
            val_start=val_s,
            val_end=val_e,
            min_score=85,
            max_future_candles=200,
        )

    assert len(trades) >= 2, f"Expected >= 2 trades with mocked signal, got {len(trades)}"

    sorted_trades = sorted(trades, key=lambda t: t["signal_ts"])

    for i in range(len(sorted_trades) - 1):
        t_now  = sorted_trades[i]
        t_next = sorted_trades[i + 1]
        candle_ms = 300_000  # 5m in milliseconds
        min_next_ts = t_now["signal_ts"] + t_now["candles_held"] * candle_ms
        assert t_next["signal_ts"] >= min_next_ts, (
            f"Trade {i+1} overlaps trade {i}: "
            f"trade {i} ts={t_now['signal_ts']} held={t_now['candles_held']}, "
            f"trade {i+1} ts={t_next['signal_ts']} (min={min_next_ts})"
        )

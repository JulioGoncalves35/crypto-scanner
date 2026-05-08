"""Tests for ported indicator functions: BOS/CHoCH, Order Block, Trendline Break."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from indicators import detect_bos_choch


def _candle(open_, high, low, close, volume=1000.0):
    return {"open": open_, "high": high, "low": low, "close": close, "volume": volume}


def _flat_candles(n: int, price: float = 100.0) -> list[dict]:
    return [_candle(price, price * 1.001, price * 0.999, price) for _ in range(n)]


# -- BOS/CHoCH tests ----------------------------------------------------------

def _downtrend_then_break_up() -> list[dict]:
    """
    Downtrend: two swing highs (lower highs) at indices 2 (112) and 10 (103),
    two swing lows (lower lows) at indices 6 (86) and 13 (82).
    Final candle: close=108 > last swing high (103) while prev_close=89 < 103
    => CHoCH bullish.
    """
    return [
        # Wave 1 ascent -> peak
        _candle(100, 104, 99, 103),    # 0
        _candle(103, 107, 102, 106),   # 1
        _candle(106, 112, 105, 110),   # 2 - SWING HIGH 1 (112)
        _candle(110, 108, 104, 105),   # 3 - descending
        _candle(105, 103, 98, 100),    # 4 - descending
        # Wave 1 trough
        _candle(100, 99,  90,  92),    # 5 - descending
        _candle(92,  91,  86,  88),    # 6 - SWING LOW 1 (86)
        _candle(88,  93,  87,  92),    # 7 - ascending from trough
        _candle(92,  97,  91,  95),    # 8 - ascending
        # Wave 2 peak (lower than wave 1 = lower high)
        _candle(95,  100, 94,  99),    # 9
        _candle(99,  103, 98, 100),    # 10 - SWING HIGH 2 (103 < 112)
        _candle(100, 101, 95,  97),    # 11 - descending
        _candle(97,  96,  90,  91),    # 12 - descending
        # Wave 2 trough (lower than wave 1 = lower low)
        _candle(91,  90,  82,  84),    # 13 - SWING LOW 2 (82 < 86)
        _candle(84,  88,  83,  87),    # 14 - ascending
        _candle(87,  90,  86,  89),    # 15 - ascending (prev_close before break)
        # CHoCH bullish: close=108 > last swing high=103; prev_close=89 < 103
        _candle(89, 110,  88, 108),    # 16 - BREAKOUT
    ]


def _uptrend_then_break_down() -> list[dict]:
    """
    Uptrend: two swing lows (higher lows) at indices 2 (86) and 10 (88),
    two swing highs (higher highs) at indices 6 (108) and 14 (115).
    Final candle: close=84 < last swing low (88) while prev_close=108 > 88
    => CHoCH bearish.
    """
    return [
        # Wave 1 descent -> trough
        _candle(100, 101, 95,  96),    # 0
        _candle(96,  97,  91,  92),    # 1
        _candle(92,  93,  86,  88),    # 2 - SWING LOW 1 (86)
        _candle(88,  95,  87,  94),    # 3 - ascending
        _candle(94,  99,  93,  98),    # 4 - ascending
        # Wave 1 peak
        _candle(98,  103, 97, 101),    # 5
        _candle(101, 108, 100, 106),   # 6 - SWING HIGH 1 (108)
        _candle(106, 105, 99, 100),    # 7 - descending
        _candle(100, 101, 94,  96),    # 8 - descending
        # Wave 2 trough (higher than wave 1 = higher low)
        _candle(96,  97,  90,  92),    # 9
        _candle(92,  94,  88,  93),    # 10 - SWING LOW 2 (88 > 86)
        _candle(93,  98,  92,  97),    # 11 - ascending
        _candle(97,  103, 96, 101),    # 12 - ascending
        # Wave 2 peak (higher than wave 1 = higher high)
        _candle(101, 107, 100, 105),   # 13
        _candle(105, 115, 104, 113),   # 14 - SWING HIGH 2 (115 > 108)
        _candle(113, 112, 106, 108),   # 15 - descending (prev_close before break)
        # CHoCH bearish: close=84 < last swing low=88; prev_close=108 > 88
        _candle(108, 109,  82,  84),   # 16 - BREAKDOWN
    ]


def test_bos_choch_choch_bullish():
    """Downtrend -> price crosses above last swing high -> CHoCH bullish (+22)."""
    candles = _downtrend_then_break_up()
    result = detect_bos_choch(candles, lookback=len(candles))
    assert result is not None, "Expected CHoCH bullish signal"
    assert result["type"] == "choch_bullish", f"Expected choch_bullish, got {result['type']}"
    assert result["score"] == 22


def test_bos_choch_choch_bearish():
    """Uptrend -> price crosses below last swing low -> CHoCH bearish (-22)."""
    candles = _uptrend_then_break_down()
    result = detect_bos_choch(candles, lookback=len(candles))
    assert result is not None, "Expected CHoCH bearish signal"
    assert result["type"] == "choch_bearish", f"Expected choch_bearish, got {result['type']}"
    assert result["score"] == -22


def test_bos_choch_no_signal_sideways():
    """Sideways price -> no BOS/CHoCH."""
    candles = _flat_candles(40)
    result = detect_bos_choch(candles, lookback=40)
    assert result is None, f"Expected None for sideways market, got {result}"


def test_bos_choch_insufficient_data():
    """Less than 10 candles -> None."""
    result = detect_bos_choch(_flat_candles(5), lookback=5)
    assert result is None

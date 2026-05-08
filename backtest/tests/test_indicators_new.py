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

    6 flat prefix candles ensure both swing pairs fall within lookback=len(candles)-6.
    """
    prefix = _flat_candles(6, 100.0)
    pattern = [
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
    return prefix + pattern


def _uptrend_then_break_down() -> list[dict]:
    """
    Uptrend: two swing lows (higher lows) at indices 2 (86) and 10 (88),
    two swing highs (higher highs) at indices 6 (108) and 14 (115).
    Final candle: close=84 < last swing low (88) while prev_close=108 > 88
    => CHoCH bearish.

    6 flat prefix candles ensure both swing pairs fall within lookback=len(candles)-6.
    """
    prefix = _flat_candles(6, 100.0)
    pattern = [
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
    return prefix + pattern


def test_bos_choch_choch_bullish():
    """Downtrend -> price crosses above last swing high -> CHoCH bullish (+22)."""
    candles = _downtrend_then_break_up()
    result = detect_bos_choch(candles, lookback=len(candles) - 6)
    assert result is not None, "Expected CHoCH bullish signal"
    assert result["type"] == "choch_bullish", f"Expected choch_bullish, got {result['type']}"
    assert result["score"] == 22


def test_bos_choch_choch_bearish():
    """Uptrend -> price crosses below last swing low -> CHoCH bearish (-22)."""
    candles = _uptrend_then_break_down()
    result = detect_bos_choch(candles, lookback=len(candles) - 6)
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


def _uptrend_then_bos_bullish() -> list[dict]:
    """
    Uptrend (HH+HL) where final candle crosses above last swing high -> BOS bullish.

    Wave 1: swing low at 88, swing high at 102.
    Wave 2: swing low at 91 (HL > 88), swing high at 108 (HH > 102).
    Final candle crosses above 108: prev_close=105 < 108, close=109 > 108.

    6 flat prefix candles ensure both swing pairs fall within lookback=len(candles)-6.
    """
    prefix = _flat_candles(6, 95.0)
    pattern = [
        # Lead-in descent
        _candle(95, 96, 93, 94),      # 0
        _candle(94, 94, 91, 92),      # 1
        # Swing low 1 (low=88, strictly less than ±2 neighbors)
        _candle(92, 92, 88, 90),      # 2 - SWING LOW 1 (88)
        _candle(90, 94, 90, 93),      # 3
        _candle(93, 97, 92, 96),      # 4
        # Swing high 1 (high=102)
        _candle(96, 102, 95, 100),    # 5 - SWING HIGH 1 (102)
        _candle(100, 100, 96, 97),    # 6
        _candle(97,  98, 92, 94),     # 7
        # Swing low 2 (low=91 > 88 = HL)
        _candle(94,  94, 91, 92),     # 8 - SWING LOW 2 (91)
        _candle(92,  96, 92, 95),     # 9
        _candle(95, 100, 94, 99),     # 10
        # Swing high 2 (high=108 > 102 = HH)
        _candle(99, 108, 98, 106),    # 11 - SWING HIGH 2 (108)
        _candle(106, 107, 103, 105),  # 12
        _candle(105, 106, 104, 105),  # 13 - prev_close=105 < 108
        _candle(105, 110, 104, 109),  # 14 - close=109 > 108 -> BOS bullish
    ]
    return prefix + pattern


def _downtrend_then_bos_bearish() -> list[dict]:
    """
    Downtrend (LH+LL) where final candle crosses below last swing low -> BOS bearish.

    Wave 1: swing high at 112, swing low at 92.
    Wave 2: swing high at 106 (LH < 112), swing low at 88 (LL < 92).
    Final candle crosses below 88: prev_close=91 > 88, close=86 < 88.

    6 flat prefix candles ensure both swing pairs fall within lookback=len(candles)-6.
    """
    prefix = _flat_candles(6, 105.0)
    pattern = [
        # Lead-in ascent
        _candle(105, 107, 104, 106),  # 0
        _candle(106, 109, 105, 108),  # 1
        # Swing high 1 (high=112)
        _candle(108, 112, 107, 110),  # 2 - SWING HIGH 1 (112)
        _candle(110, 110, 106, 108),  # 3
        _candle(108, 106, 102, 104),  # 4
        # Swing low 1 (low=92)
        _candle(104, 100, 92, 94),    # 5 - SWING LOW 1 (92)
        _candle(94,  98, 93, 97),     # 6
        _candle(97, 102, 96, 100),    # 7
        # Swing high 2 (high=106 < 112 = LH)
        _candle(100, 106, 99, 104),   # 8 - SWING HIGH 2 (106)
        _candle(104, 105, 100, 102),  # 9
        _candle(102, 101, 96, 98),    # 10
        # Swing low 2 (low=88 < 92 = LL)
        _candle(98,  96, 88, 90),     # 11 - SWING LOW 2 (88)
        _candle(90,  94, 89, 93),     # 12
        _candle(93,  94, 90, 91),     # 13 - prev_close=91 > 88
        _candle(91,  92, 85, 86),     # 14 - close=86 < 88 -> BOS bearish
    ]
    return prefix + pattern


def test_bos_choch_bos_bullish():
    """Uptrend -> price crosses above last swing high -> BOS bullish (+12)."""
    candles = _uptrend_then_bos_bullish()
    result = detect_bos_choch(candles, lookback=len(candles) - 6)
    assert result is not None, "Expected BOS bullish signal"
    assert result["type"] == "bos_bullish", f"Expected bos_bullish, got {result['type']}"
    assert result["score"] == 12


def test_bos_choch_bos_bearish():
    """Downtrend -> price crosses below last swing low -> BOS bearish (-12)."""
    candles = _downtrend_then_bos_bearish()
    result = detect_bos_choch(candles, lookback=len(candles) - 6)
    assert result is not None, "Expected BOS bearish signal"
    assert result["type"] == "bos_bearish", f"Expected bos_bearish, got {result['type']}"
    assert result["score"] == -12

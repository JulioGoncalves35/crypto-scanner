"""Tests for ported indicator functions: BOS/CHoCH, Order Block, Trendline Break."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from indicators import detect_bos_choch, detect_order_blocks, detect_trendline_break


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


# -- Order Block tests ---------------------------------------------------------

def _bullish_ob_in_zone() -> list[dict]:
    """
    Bullish OB: explicit swing high at 107 (index 12), bearish OB candle (index 15)
    as last bearish candle before the break above 107. Price retests the OB zone.
    """
    candles = _flat_candles(10, 100.0)
    candles += [
        _candle(100, 102,  99, 101),  # 10
        _candle(101, 103, 100, 102),  # 11
        _candle(102, 107, 101, 106),  # 12 - SWING HIGH (high=107, confirmed by 2 lower-high bars each side)
        _candle(106, 105, 101, 103),  # 13 - after swing high
        _candle(103, 104,  99, 100),  # 14 - after swing high
        _candle(100, 101,  96,  97),  # 15 - bearish OB candidate (last bear before break)
        _candle(97,   99,  96,  98),  # 16 - dip (bullish, not a new OB)
        _candle(98,  110,  97, 109),  # 17 - break ABOVE swing high 107
        _candle(109, 111, 108, 110),  # 18
        _candle(110, 111, 109, 110),  # 19
        _candle(109, 109,  97,  97.5),# 20 - price back in OB zone (96-101)
    ]
    return candles


def _bearish_ob_in_zone() -> list[dict]:
    """
    Bearish OB: explicit swing low at 93 (index 12), bullish OB candle (index 15)
    as last bullish candle before the break below 93. Price retests the OB zone.
    """
    candles = _flat_candles(10, 100.0)
    candles += [
        _candle(100, 101,  98,  99),  # 10
        _candle(99,  100,  97,  98),  # 11
        _candle(98,   99,  93,  94),  # 12 - SWING LOW (low=93, confirmed by 2 higher-low bars each side)
        _candle(94,   97,  94,  96),  # 13 - after swing low
        _candle(96,   98,  95,  97),  # 14 - after swing low
        _candle(97,  103,  96, 102),  # 15 - bullish OB candidate (last bull before break)
        _candle(102, 104, 101, 103),  # 16 - continuation
        _candle(103, 104,  90,  91),  # 17 - break BELOW swing low 93
        _candle(91,   93,  89,  90),  # 18
        _candle(90,   91,  89,  90),  # 19
        _candle(91,  103,  90, 101.5),# 20 - price back in OB zone (~96-104)
    ]
    return candles


def test_order_block_bullish_in_zone():
    """Bullish OB: last bearish candle before break up, price retesting zone -> +14."""
    candles = _bullish_ob_in_zone()
    result = detect_order_blocks(candles, lookback=len(candles))
    assert result is not None, "Expected bullish OB signal"
    assert result["type"] == "bullish_ob"
    assert result["score"] == 14
    assert result["price_in_zone"] is True


def test_order_block_bearish_in_zone():
    """Bearish OB: last bullish candle before break down, price retesting zone -> -14."""
    candles = _bearish_ob_in_zone()
    result = detect_order_blocks(candles, lookback=len(candles))
    assert result is not None, "Expected bearish OB signal"
    assert result["type"] == "bearish_ob"
    assert result["score"] == -14
    assert result["price_in_zone"] is True


def test_order_block_no_signal_flat():
    """No swing structure -> no OB."""
    result = detect_order_blocks(_flat_candles(40), lookback=40)
    assert result is None


# ── Trendline Break tests ────────────────────────────────────────────────────

def _ltb_break_candles() -> list[dict]:
    """Two descending swing highs, then price closes above projected resistance."""
    candles = []
    for i in range(35):
        if i == 10:
            candles.append(_candle(109, 110, 108, 109))   # swing high at 110 (h1)
        elif i == 20:
            candles.append(_candle(104, 105, 103, 104))   # swing high at 105 (h2 < h1 -> LTB)
        else:
            candles.append(_candle(100, 101, 99, 100))
    # slope = (105-110)/(20-10) = -0.5/bar
    # projected at bar 34 (last): 105 + (-0.5)*(34-20) = 105 - 7 = 98.0
    # break threshold: 98.0 * 1.0015 = 98.147 -> close must be > 98.147
    # close=101 clears this comfortably
    candles.append(_candle(100, 102, 100, 101))
    return candles


def _lta_break_candles() -> list[dict]:
    """Two ascending swing lows, then price closes below projected support."""
    candles = []
    for i in range(35):
        if i == 10:
            candles.append(_candle(91, 92, 90, 91))    # swing low at 90 (l1)
        elif i == 20:
            candles.append(_candle(96, 97, 95, 96))    # swing low at 95 (l2 > l1 -> LTA)
        else:
            candles.append(_candle(100, 101, 99, 100))
    # slope = (95-90)/(20-10) = 0.5/bar
    # projected at bar 34: 95 + 0.5*(34-20) = 95 + 7 = 102.0
    # break threshold: 102.0 * (1-0.0015) = 101.847 -> close must be < 101.847
    # close=99 clears this comfortably
    candles.append(_candle(100, 100, 98, 99))
    return candles


def test_trendline_ltb_break():
    """Descending swing highs -> price closes above projected resistance -> LTB break (+10)."""
    candles = _ltb_break_candles()
    result = detect_trendline_break(candles, lookback=len(candles))
    assert result is not None, "Expected LTB break signal"
    assert result["type"] == "ltb_break"
    assert result["score"] == 10


def test_trendline_lta_break():
    """Ascending swing lows -> price closes below projected support -> LTA break (-10)."""
    candles = _lta_break_candles()
    result = detect_trendline_break(candles, lookback=len(candles))
    assert result is not None, "Expected LTA break signal"
    assert result["type"] == "lta_break"
    assert result["score"] == -10


def test_trendline_no_break_flat():
    """Flat price -> no trendline break."""
    result = detect_trendline_break(_flat_candles(40), lookback=40)
    assert result is None

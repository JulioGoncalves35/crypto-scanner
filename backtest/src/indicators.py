"""
indicators.py — Python port of painel-core.js technical indicators.

Mirrors the JS logic exactly so backtest results reflect what the live scanner
actually computes. Differences from the JS are documented inline.

Input candles: list of dicts with keys: open, high, low, close, volume.
"""

import math
from typing import Optional


# ─────────────────────────────────────────
# BASIC INDICATORS
# ─────────────────────────────────────────

def calc_ema(closes: list[float], period: int) -> list[Optional[float]]:
    if len(closes) < period:
        return [None] * len(closes)
    k = 2 / (period + 1)
    ema = sum(closes[:period]) / period
    result: list[Optional[float]] = [None] * (period - 1)
    result.append(ema)
    for i in range(period, len(closes)):
        ema = closes[i] * k + ema * (1 - k)
        result.append(ema)
    return result


def calc_rsi(closes: list[float], p: int = 14) -> list[Optional[float]]:
    if len(closes) <= p:
        return [None] * len(closes)
    g = 0.0
    l = 0.0
    for i in range(1, p + 1):
        d = closes[i] - closes[i - 1]
        if d >= 0:
            g += d
        else:
            l -= d
    ag = g / p
    al = l / p
    rsi: list[Optional[float]] = [None] * p
    rsi.append(100.0 if al == 0 else 100 - 100 / (1 + ag / al))
    for i in range(p + 1, len(closes)):
        d = closes[i] - closes[i - 1]
        ag = (ag * (p - 1) + (d if d > 0 else 0)) / p
        al = (al * (p - 1) + (-d if d < 0 else 0)) / p
        rsi.append(100.0 if al == 0 else 100 - 100 / (1 + ag / al))
    return rsi


def calc_macd(closes: list[float]) -> dict:
    e12 = calc_ema(closes, 12)
    e26 = calc_ema(closes, 26)
    ml = [
        (a - b) if a is not None and b is not None else None
        for a, b in zip(e12, e26)
    ]
    ml_valid = ml[26:]  # first 26 are None
    sig = calc_ema([v for v in ml_valid if v is not None], 9)
    # Rebuild sig to same length as ml_valid, prepending Nones
    none_count = sum(1 for v in ml_valid if v is None)
    sig_full = [None] * none_count + sig
    hist = [
        (a - b) if a is not None and b is not None else None
        for a, b in zip(ml_valid, sig_full)
    ]
    return {"macd_line": ml_valid, "signal": sig_full, "hist": hist}


def calc_bollinger(closes: list[float], p: int = 20, m: float = 2.0) -> list[Optional[dict]]:
    result = []
    for i in range(len(closes)):
        if i < p - 1:
            result.append(None)
            continue
        sl = closes[i - p + 1: i + 1]
        mean = sum(sl) / p
        std = math.sqrt(sum((x - mean) ** 2 for x in sl) / p)
        result.append({"upper": mean + m * std, "mid": mean, "lower": mean - m * std})
    return result


def calc_atr(candles: list[dict], p: int = 14) -> list[float]:
    trs = []
    for i in range(1, len(candles)):
        c = candles[i]
        prev = candles[i - 1]
        tr = max(
            c["high"] - c["low"],
            abs(c["high"] - prev["close"]),
            abs(c["low"] - prev["close"]),
        )
        trs.append(tr)
    if len(trs) < p:
        return []
    atr = sum(trs[:p]) / p
    atrs = [atr]
    for i in range(p, len(trs)):
        atr = (atr * (p - 1) + trs[i]) / p
        atrs.append(atr)
    return atrs


def calc_adx(candles: list[dict], p: int = 14) -> Optional[float]:
    if len(candles) < p * 2 + 1:
        return None
    trs, p_dms, m_dms = [], [], []
    for i in range(1, len(candles)):
        c = candles[i]
        prev = candles[i - 1]
        tr = max(
            c["high"] - c["low"],
            abs(c["high"] - prev["close"]),
            abs(c["low"] - prev["close"]),
        )
        up_move = c["high"] - prev["high"]
        down_move = prev["low"] - c["low"]
        trs.append(tr)
        p_dms.append(up_move if up_move > down_move and up_move > 0 else 0)
        m_dms.append(down_move if down_move > up_move and down_move > 0 else 0)

    atr14 = sum(trs[:p])
    p_dm14 = sum(p_dms[:p])
    m_dm14 = sum(m_dms[:p])
    dx_arr = []
    for i in range(p, len(trs)):
        atr14 = atr14 - atr14 / p + trs[i]
        p_dm14 = p_dm14 - p_dm14 / p + p_dms[i]
        m_dm14 = m_dm14 - m_dm14 / p + m_dms[i]
        p_di = (p_dm14 / atr14 * 100) if atr14 > 0 else 0
        m_di = (m_dm14 / atr14 * 100) if atr14 > 0 else 0
        di_sum = p_di + m_di
        dx_arr.append(abs(p_di - m_di) / di_sum * 100 if di_sum > 0 else 0)

    if len(dx_arr) < p:
        return None
    adx = sum(dx_arr[:p]) / p
    for i in range(p, len(dx_arr)):
        adx = (adx * (p - 1) + dx_arr[i]) / p
    return adx


def avg_vol(candles: list[dict], p: int = 20) -> float:
    vols = [c["volume"] for c in candles]
    return sum(vols[-(p + 1):-1]) / p


def find_levels(candles: list[dict], lb: int = 50) -> list[dict]:
    r = candles[-lb:]
    highs = [c["high"] for c in r]
    lows = [c["low"] for c in r]
    levels = []
    for i in range(2, len(r) - 2):
        if (highs[i] > highs[i-1] and highs[i] > highs[i-2]
                and highs[i] > highs[i+1] and highs[i] > highs[i+2]):
            levels.append({"price": highs[i], "type": "resistance"})
        if (lows[i] < lows[i-1] and lows[i] < lows[i-2]
                and lows[i] < lows[i+1] and lows[i] < lows[i+2]):
            levels.append({"price": lows[i], "type": "support"})
    return levels


def calc_vwap(candles: list[dict]) -> Optional[float]:
    recent = candles[-80:]
    cum_tpv = 0.0
    cum_vol = 0.0
    for c in recent:
        tp = (c["high"] + c["low"] + c["close"]) / 3
        cum_tpv += tp * c["volume"]
        cum_vol += c["volume"]
    return cum_tpv / cum_vol if cum_vol > 0 else None


def calc_anchored_vwap(candles: list[dict], lookback: int = 100) -> Optional[dict]:
    if len(candles) < 20:
        return None
    sl = candles[-min(lookback, len(candles)):]
    n = len(sl)
    swings = []
    for i in range(2, n - 2):
        if (sl[i]["high"] > sl[i-1]["high"] and sl[i]["high"] > sl[i-2]["high"]
                and sl[i]["high"] > sl[i+1]["high"] and sl[i]["high"] > sl[i+2]["high"]):
            swings.append({"i": i, "type": "high", "price": sl[i]["high"], "volume": sl[i]["volume"]})
        if (sl[i]["low"] < sl[i-1]["low"] and sl[i]["low"] < sl[i-2]["low"]
                and sl[i]["low"] < sl[i+1]["low"] and sl[i]["low"] < sl[i+2]["low"]):
            swings.append({"i": i, "type": "low", "price": sl[i]["low"], "volume": sl[i]["volume"]})
    if not swings:
        return None
    anchor = max(swings, key=lambda s: s["volume"])
    cum_tpv = 0.0
    cum_vol = 0.0
    for i in range(anchor["i"], n):
        c = sl[i]
        tp = (c["high"] + c["low"] + c["close"]) / 3
        cum_tpv += tp * c["volume"]
        cum_vol += c["volume"]
    if cum_vol == 0:
        return None
    return {
        "vwap": cum_tpv / cum_vol,
        "anchor_type": "swing_high" if anchor["type"] == "high" else "swing_low",
        "anchor_price": anchor["price"],
    }


# ─────────────────────────────────────────
# VOLUME PROFILE
# ─────────────────────────────────────────

def calc_volume_profile(candles: list[dict], bins: int = 50) -> Optional[dict]:
    if len(candles) < 20:
        return None
    range_high = max(c["high"] for c in candles)
    range_low = min(c["low"] for c in candles)
    rng = range_high - range_low
    if rng <= 0:
        return None
    bin_size = rng / bins
    vol_bins = [0.0] * bins
    for c in candles:
        candle_range = c["high"] - c["low"]
        if candle_range <= 0:
            continue
        start_bin = int((c["low"] - range_low) / bin_size)
        end_bin = min(bins - 1, int((c["high"] - range_low) / bin_size))
        bins_spanned = max(1, end_bin - start_bin + 1)
        vol_per_bin = c["volume"] / bins_spanned
        for b in range(start_bin, end_bin + 1):
            if 0 <= b < bins:
                vol_bins[b] += vol_per_bin
    poc_bin = max(range(bins), key=lambda b: vol_bins[b])
    poc = range_low + (poc_bin + 0.5) * bin_size
    total_volume = sum(vol_bins)
    va_target = total_volume * 0.70
    va_volume = vol_bins[poc_bin]
    va_low = poc_bin
    va_high = poc_bin
    while va_volume < va_target and (va_low > 0 or va_high < bins - 1):
        add_low = vol_bins[va_low - 1] if va_low > 0 else 0
        add_high = vol_bins[va_high + 1] if va_high < bins - 1 else 0
        if add_high >= add_low and va_high < bins - 1:
            va_high += 1
            va_volume += add_high
        elif va_low > 0:
            va_low -= 1
            va_volume += add_low
        else:
            va_high += 1
            va_volume += add_high
    vah = range_low + (va_high + 1) * bin_size
    val = range_low + va_low * bin_size
    return {"poc": poc, "vah": vah, "val": val, "range_high": range_high, "range_low": range_low}


# ─────────────────────────────────────────
# ICHIMOKU
# ─────────────────────────────────────────

def calc_ichimoku(candles: list[dict]) -> Optional[dict]:
    if len(candles) < 78:
        return None
    n = len(candles)
    cur = n - 1
    shift = 26
    cloud_bar = cur - shift
    if cloud_bar < 52:
        return None

    def hi_high(end_idx: int, period: int) -> float:
        return max(candles[max(0, end_idx - period + 1): end_idx + 1], key=lambda c: c["high"])["high"]

    def lo_low(end_idx: int, period: int) -> float:
        return min(candles[max(0, end_idx - period + 1): end_idx + 1], key=lambda c: c["low"])["low"]

    tenkan = (hi_high(cur, 9) + lo_low(cur, 9)) / 2
    kijun = (hi_high(cur, 26) + lo_low(cur, 26)) / 2
    tenkan_prev = (hi_high(cur - 1, 9) + lo_low(cur - 1, 9)) / 2
    kijun_prev = (hi_high(cur - 1, 26) + lo_low(cur - 1, 26)) / 2

    sa_tenkan = (hi_high(cloud_bar, 9) + lo_low(cloud_bar, 9)) / 2
    sa_kijun = (hi_high(cloud_bar, 26) + lo_low(cloud_bar, 26)) / 2
    senkou_a = (sa_tenkan + sa_kijun) / 2
    senkou_b = (hi_high(cloud_bar, 52) + lo_low(cloud_bar, 52)) / 2

    cloud_top = max(senkou_a, senkou_b)
    cloud_bottom = min(senkou_a, senkou_b)

    current_close = candles[cur]["close"]
    price_above_cloud = current_close > cloud_top
    price_below_cloud = current_close < cloud_bottom

    tk_cross = "none"
    if tenkan_prev <= kijun_prev and tenkan > kijun:
        tk_cross = "bullish"
    elif tenkan_prev >= kijun_prev and tenkan < kijun:
        tk_cross = "bearish"

    close_shift_ago = candles[cur - shift]["close"]
    if current_close > close_shift_ago:
        chikou_bull = True
    elif current_close < close_shift_ago:
        chikou_bull = False
    else:
        chikou_bull = None

    return {
        "price_above_cloud": price_above_cloud,
        "price_below_cloud": price_below_cloud,
        "tk_cross": tk_cross,
        "chikou_bull": chikou_bull,
        "cloud_top": cloud_top,
        "cloud_bottom": cloud_bottom,
    }


# ─────────────────────────────────────────
# OBV TREND
# ─────────────────────────────────────────

def calc_obv_trend(candles: list[dict], period: int = 20) -> str:
    if len(candles) < period + 1:
        return "neutral"
    obv = 0.0
    obv_arr = []
    for i in range(1, len(candles)):
        if candles[i]["close"] > candles[i - 1]["close"]:
            obv += candles[i]["volume"]
        elif candles[i]["close"] < candles[i - 1]["close"]:
            obv -= candles[i]["volume"]
        obv_arr.append(obv)
    recent = obv_arr[-period:]
    ema_period = period // 2
    ema_obv = calc_ema(recent, ema_period)
    if len(ema_obv) < 5:
        return "neutral"
    last = ema_obv[-1]
    prev = ema_obv[-4]
    if last is None or prev is None:
        return "neutral"
    if last > prev * 1.005:
        return "rising"
    if last < prev * 0.995:
        return "falling"
    return "neutral"


# ─────────────────────────────────────────
# CVD
# ─────────────────────────────────────────

def calc_cvd(candles: list[dict], period: int = 30) -> Optional[dict]:
    if len(candles) < period + 1:
        return None
    recent = candles[-period:]
    cvd = 0.0
    cvd_arr = []
    for c in recent:
        body = c["close"] - c["open"]
        threshold = (c["high"] - c["low"]) * 0.1
        if abs(body) < threshold:
            cvd_arr.append(cvd)
        else:
            cvd += c["volume"] if body > 0 else -c["volume"]
            cvd_arr.append(cvd)
    last5 = cvd_arr[-5:]
    prev5 = cvd_arr[-10:-5]
    if len(prev5) < 5:
        return None
    avg_last = sum(last5) / 5
    avg_prev = sum(prev5) / 5
    delta = avg_last - avg_prev
    relative_change = delta / abs(avg_prev) if abs(avg_prev) > 0 else 0
    if relative_change > 0.05:
        trend = "rising"
    elif relative_change < -0.05:
        trend = "falling"
    else:
        trend = "neutral"
    return {"trend": trend, "delta": delta, "relative_change": relative_change}


# ─────────────────────────────────────────
# SQUEEZE MOMENTUM
# ─────────────────────────────────────────

def calc_squeeze_momentum(
    candles: list[dict],
    bb_period: int = 20,
    bb_mult: float = 2.0,
    kc_period: int = 20,
    kc_mult: float = 1.5,
) -> Optional[dict]:
    if len(candles) < kc_period + 5:
        return None
    closes = [c["close"] for c in candles]
    bbs = calc_bollinger(closes, bb_period, bb_mult)
    bbs_valid = [b for b in bbs if b is not None]
    if len(bbs_valid) < 3:
        return None
    ema20_arr = calc_ema(closes, kc_period)
    atr_arr = calc_atr(candles, kc_period)
    if len(atr_arr) < 3:
        return None

    ema20 = ema20_arr[-1]
    ema20_prev = ema20_arr[-2]
    atr20 = atr_arr[-1]
    atr20_prev = atr_arr[-2]
    if ema20 is None or atr20 is None:
        return None

    last_bb = bbs[-1]
    prev_bb = bbs[-2]
    if last_bb is None or prev_bb is None:
        return None

    kc_upper = ema20 + kc_mult * atr20
    kc_lower = ema20 - kc_mult * atr20
    squeezed = last_bb["upper"] < kc_upper and last_bb["lower"] > kc_lower

    was_squeezed = False
    if ema20_prev is not None and atr20_prev is not None:
        was_squeezed = (
            prev_bb["upper"] < (ema20_prev + kc_mult * atr20_prev)
            and prev_bb["lower"] > (ema20_prev - kc_mult * atr20_prev)
        )

    n = len(candles)
    period_highs = [c["high"] for c in candles[-kc_period:]]
    period_lows = [c["low"] for c in candles[-kc_period:]]
    hhll = (max(period_highs) + min(period_lows)) / 2
    momentum = closes[n - 1] - (hhll + ema20) / 2

    prev_highs = [c["high"] for c in candles[-(kc_period + 1):-1]]
    prev_lows = [c["low"] for c in candles[-(kc_period + 1):-1]]
    hhll_prev = (max(prev_highs) + min(prev_lows)) / 2
    ep = ema20_prev if ema20_prev is not None else ema20
    momentum_prev = closes[n - 2] - (hhll_prev + ep) / 2

    if momentum > momentum_prev:
        momentum_trend = "rising"
    elif momentum < momentum_prev:
        momentum_trend = "falling"
    else:
        momentum_trend = "neutral"

    released_bull = was_squeezed and not squeezed and momentum > 0
    released_bear = was_squeezed and not squeezed and momentum < 0

    return {
        "squeezed": squeezed,
        "momentum": momentum,
        "momentum_trend": momentum_trend,
        "released_bull": released_bull,
        "released_bear": released_bear,
    }


def calc_stoch_rsi(rsi_arr: list[Optional[float]], period: int = 14) -> Optional[float]:
    valid = [v for v in rsi_arr if v is not None]
    if len(valid) < period:
        return None
    recent = valid[-period:]
    min_rsi = min(recent)
    max_rsi = max(recent)
    if max_rsi == min_rsi:
        return 50.0
    return (valid[-1] - min_rsi) / (max_rsi - min_rsi) * 100


# ─────────────────────────────────────────
# CANDLE PATTERNS (simplified — top-weight patterns only)
# ─────────────────────────────────────────

def detect_candle_patterns(candles: list[dict]) -> list[dict]:
    patterns = []
    n = len(candles)
    if n < 4:
        return patterns

    c  = candles[n - 1]
    p  = candles[n - 2]
    pp = candles[n - 3]

    c_body  = abs(c["close"] - c["open"])
    c_range = (c["high"] - c["low"]) or 0.0001
    p_body  = abs(p["close"] - p["open"])
    p_range = (p["high"] - p["low"]) or 0.0001
    pp_body = abs(pp["close"] - pp["open"])

    c_bull = c["close"] > c["open"]
    c_bear = c["close"] < c["open"]
    p_bull = p["close"] > p["open"]
    p_bear = p["close"] < p["open"]
    pp_bear = pp["close"] < pp["open"]
    pp_bull = pp["close"] > pp["open"]

    c_low  = min(c["open"], c["close"])
    c_high = max(c["open"], c["close"])
    p_low  = min(p["open"], p["close"])
    p_high = max(p["open"], p["close"])

    c_lower_wick = c_low - c["low"]
    c_upper_wick = c["high"] - c_high

    # Engolfamento — alto peso ±15
    if c_bull and p_bear and c["open"] <= p["close"] and c["close"] >= p["open"] and c_body > p_body * 0.9:
        patterns.append({"score": +15, "name": "Engolfo Altista"})
    if c_bear and p_bull and c["open"] >= p["close"] and c["close"] <= p["open"] and c_body > p_body * 0.9:
        patterns.append({"score": -15, "name": "Engolfo Baixista"})

    # Pinbar — ±12
    if c_lower_wick > c_range * 0.62 and c_high > c["low"] + c_range * 0.6:
        patterns.append({"score": +12, "name": "Pinbar Altista"})
    if c_upper_wick > c_range * 0.62 and c_low < c["high"] - c_range * 0.6:
        patterns.append({"score": -12, "name": "Pinbar Baixista"})

    # Estrela da manhã/tarde — ±18
    if (pp_bear and pp_body > 0 and p_body < pp_body * 0.35
            and c_bull and c_body > pp_body * 0.5
            and c["close"] > (pp["open"] + pp["close"]) / 2):
        patterns.append({"score": +18, "name": "Estrela da Manhã"})
    if (pp_bull and pp_body > 0 and p_body < pp_body * 0.35
            and c_bear and c_body > pp_body * 0.5
            and c["close"] < (pp["open"] + pp["close"]) / 2):
        patterns.append({"score": -18, "name": "Estrela da Tarde"})

    # Martelo / Homem Enforcado — ±10
    if c_bull and c_lower_wick > c_body * 2 and c_upper_wick < c_body * 0.5 and c_body > 0:
        patterns.append({"score": +10, "name": "Martelo"})
    if c_bear and c_lower_wick > c_body * 2 and c_upper_wick < c_body * 0.5 and c_body > 0:
        patterns.append({"score": -10, "name": "Homem Enforcado"})

    # Estrela cadente / Martelo invertido — ±8/10
    if c_bear and c_upper_wick > c_body * 2 and c_lower_wick < c_body * 0.5 and c_body > 0:
        patterns.append({"score": -10, "name": "Estrela Cadente"})
    if c_bull and c_upper_wick > c_body * 2 and c_lower_wick < c_body * 0.5 and c_body > 0:
        patterns.append({"score": +8, "name": "Martelo Invertido"})

    # Marubozu — ±12
    if c_bull and c_body / c_range >= 0.95:
        patterns.append({"score": +12, "name": "Marubozu Altista"})
    if c_bear and c_body / c_range >= 0.95:
        patterns.append({"score": -12, "name": "Marubozu Baixista"})

    # 3 soldados / 3 corvos — ±18 (requer n >= 5)
    if n >= 5:
        ppp = candles[n - 4]
        pp_range = (pp["high"] - pp["low"]) or 0.0001
        pp_body2 = abs(pp["close"] - pp["open"])
        if (pp_bull and p_bull and c_bull
                and pp_body2 / pp_range >= 0.6 and p_body / p_range >= 0.6 and c_body / c_range >= 0.6
                and p["close"] > pp["close"] and c["close"] > p["close"]):
            patterns.append({"score": +18, "name": "Três Soldados Brancos"})
        if (pp_bear and p_bear and c_bear
                and pp_body2 / pp_range >= 0.6 and p_body / p_range >= 0.6 and c_body / c_range >= 0.6
                and p["close"] < pp["close"] and c["close"] < p["close"]):
            patterns.append({"score": -18, "name": "Três Corvos Negros"})

    # Filtro: se há padrão forte (|score| >= 15), manter somente os fortes + opostos de menor peso
    strong = [pt for pt in patterns if abs(pt["score"]) >= 15]
    if strong:
        dirs = set("bull" if pt["score"] > 0 else "bear" for pt in strong)
        return strong + [
            pt for pt in patterns
            if abs(pt["score"]) < 15
            and ("bull" if pt["score"] > 0 else "bear") not in dirs
        ]
    return patterns


# ─────────────────────────────────────────
# RSI DIVERGENCE
# ─────────────────────────────────────────

def detect_divergences(candles: list[dict], rsi_arr: list[Optional[float]]) -> list[dict]:
    divergences = []
    n = len(candles)
    lb = min(35, n - 3)

    price_lows = []
    price_highs = []
    for i in range(n - lb, n - 2):
        if i < 1:
            continue
        if (candles[i]["low"] < candles[i - 1]["low"]
                and candles[i]["low"] < candles[i + 1]["low"]
                and rsi_arr[i] is not None):
            price_lows.append({"i": i, "price": candles[i]["low"], "rsi": rsi_arr[i]})
        if (candles[i]["high"] > candles[i - 1]["high"]
                and candles[i]["high"] < candles[i + 1]["high"]
                and rsi_arr[i] is not None):
            price_highs.append({"i": i, "price": candles[i]["high"], "rsi": rsi_arr[i]})

    if len(price_lows) >= 2:
        prev = price_lows[-2]
        curr = price_lows[-1]
        price_diff = (curr["price"] - prev["price"]) / prev["price"]
        rsi_diff = curr["rsi"] - prev["rsi"]
        if price_diff < -0.005 and rsi_diff > 3:
            divergences.append({"type": "bullish", "score": +20, "name": "Divergência Altista RSI"})

    if len(price_highs) >= 2:
        prev = price_highs[-2]
        curr = price_highs[-1]
        price_diff = (curr["price"] - prev["price"]) / prev["price"]
        rsi_diff = curr["rsi"] - prev["rsi"]
        if price_diff > 0.005 and rsi_diff < -3:
            divergences.append({"type": "bearish", "score": -20, "name": "Divergência Baixista RSI"})

    return divergences


# ─────────────────────────────────────────
# BOS / CHoCH (Break of Structure / Change of Character)
# ─────────────────────────────────────────

def _find_swing_highs(candles: list[dict], margin: int = 2) -> list[dict]:
    """Returns list of {i, price} for local maxima (+-margin bars)."""
    result = []
    n = len(candles)
    for i in range(margin, n - margin):
        h = candles[i]["high"]
        if all(h > candles[j]["high"] for j in range(i - margin, i + margin + 1) if j != i):
            result.append({"i": i, "price": h})
    return result


def _find_swing_lows(candles: list[dict], margin: int = 2) -> list[dict]:
    """Returns list of {i, price} for local minima (+-margin bars)."""
    result = []
    n = len(candles)
    for i in range(margin, n - margin):
        lo = candles[i]["low"]
        if all(lo < candles[j]["low"] for j in range(i - margin, i + margin + 1) if j != i):
            result.append({"i": i, "price": lo})
    return result


def detect_bos_choch(candles: list[dict], lookback: int = 60) -> Optional[dict]:
    """
    Detects Break of Structure (BOS +-12) and Change of Character (CHoCH +-22).
    Mirrors detectBOSCHoCH from painel-core.js exactly, including the prevClose
    cross check (price must have crossed the level, not just be beyond it).
    """
    total = len(candles)
    n = min(lookback, total)
    if total < lookback + 5:
        return None

    recent = candles[-n:]

    highs = _find_swing_highs(recent)
    lows  = _find_swing_lows(recent)

    if len(highs) < 2 or len(lows) < 2:
        return None

    last_close = candles[-1]["close"]
    prev_close = candles[-2]["close"] if total >= 2 else last_close

    last_high = highs[-1]["price"]
    prev_high = highs[-2]["price"]
    last_low  = lows[-1]["price"]
    prev_low  = lows[-2]["price"]

    uptrend   = last_high > prev_high and last_low > prev_low
    downtrend = last_high < prev_high and last_low < prev_low

    # BOS Altista: uptrend, price crosses above last swing high (continuation)
    if uptrend and prev_close < last_high and last_close > last_high:
        return {"type": "bos_bullish", "score": 12, "name": "BOS Altista"}

    # BOS Baixista: downtrend, price crosses below last swing low (continuation)
    if downtrend and prev_close > last_low and last_close < last_low:
        return {"type": "bos_bearish", "score": -12, "name": "BOS Baixista"}

    # CHoCH Altista: downtrend, price crosses above last swing high (reversal)
    if downtrend and prev_close < last_high and last_close > last_high:
        return {"type": "choch_bullish", "score": 22, "name": "CHoCH Altista"}

    # CHoCH Baixista: uptrend, price crosses below last swing low (reversal)
    if uptrend and prev_close > last_low and last_close < last_low:
        return {"type": "choch_bearish", "score": -22, "name": "CHoCH Baixista"}

    return None


def detect_order_blocks(candles: list[dict], lookback: int = 100) -> Optional[dict]:
    """
    Detects Order Block zones (+-14 when price retesting).
    Mirrors detectOrderBlocks from painel-core.js.
    Score only applied when price_in_zone is True (price within +-1% of OB zone).
    """
    n = min(lookback, len(candles))
    if n < 10:
        return None
    recent = candles[-n:]

    highs = _find_swing_highs(recent)
    lows  = _find_swing_lows(recent)
    price = recent[-1]["close"]

    # Bullish OB: find first break above last swing high, then last bearish candle before it
    if highs:
        last_high = highs[-1]
        break_i = next(
            (i for i in range(last_high["i"] + 1, len(recent))
             if recent[i]["close"] > last_high["price"]),
            None,
        )
        if break_i is not None:
            ob_i = next(
                (i for i in range(break_i - 1, max(last_high["i"] - 1, -1), -1)
                 if recent[i]["close"] < recent[i]["open"]),
                None,
            )
            if ob_i is not None:
                ob_high = recent[ob_i]["high"]
                ob_low  = recent[ob_i]["low"]
                if ob_low * 0.99 <= price <= ob_high * 1.01:
                    return {
                        "type": "bullish_ob", "score": 14,
                        "ob_high": ob_high, "ob_low": ob_low,
                        "price_in_zone": True,
                    }

    # Bearish OB: find first break below last swing low, then last bullish candle before it
    if lows:
        last_low = lows[-1]
        break_i = next(
            (i for i in range(last_low["i"] + 1, len(recent))
             if recent[i]["close"] < last_low["price"]),
            None,
        )
        if break_i is not None:
            ob_i = next(
                (i for i in range(break_i - 1, max(last_low["i"] - 1, -1), -1)
                 if recent[i]["close"] > recent[i]["open"]),
                None,
            )
            if ob_i is not None:
                ob_high = recent[ob_i]["high"]
                ob_low  = recent[ob_i]["low"]
                if ob_low * 0.99 <= price <= ob_high * 1.01:
                    return {
                        "type": "bearish_ob", "score": -14,
                        "ob_high": ob_high, "ob_low": ob_low,
                        "price_in_zone": True,
                    }

    return None


# ─────────────────────────────────────────
# FIND_LEVELS_LB — TF-aware lookback (mirrors painel-core.js)
# ─────────────────────────────────────────

FIND_LEVELS_LB = {
    "5m":  100,
    "15m":  80,
    "30m":  60,
    "1h":   60,
    "4h":   50,
    "1D":   50,
}

TF_ADX_MIN = {
    "5m":  23,
    "15m": 22,
    "30m": 20,
    "1h":  18,
    "4h":  18,
    "1D":  18,
}

TF_MIN_STOP = {
    "5m":  0.008,
    "15m": 0.012,
    "30m": 0.015,
    "1h":  0.020,
    "4h":  0.030,
    "1D":  0.050,
}


# ─────────────────────────────────────────
# FULL INDICATOR PIPELINE (mirrors _calcTechIndicators)
# ─────────────────────────────────────────

def calc_tech_indicators(candles: list[dict], tf: str) -> dict:
    closes = [c["close"] for c in candles]
    last = candles[-1]
    price = last["close"]

    rsi_arr = calc_rsi(closes)
    rsi = rsi_arr[-1]

    e9   = calc_ema(closes, 9)
    e21  = calc_ema(closes, 21)
    e200 = calc_ema(closes, 200)
    ema9   = e9[-1]
    ema21  = e21[-1]
    ema200 = e200[-1]

    macd_result = calc_macd(closes)
    ml = macd_result["macd_line"]
    sig = macd_result["signal"]
    hist = macd_result["hist"]
    macd_now  = ml[-1]
    macd_prev = ml[-2] if len(ml) >= 2 else None
    sig_now   = sig[-1]
    sig_prev  = sig[-2] if len(sig) >= 2 else None
    hist_now  = hist[-1]
    hist_prev = hist[-2] if len(hist) >= 2 else None

    bbs = calc_bollinger(closes)
    bb = bbs[-1]
    atrs = calc_atr(candles)
    atr = atrs[-1] if atrs else 0.0
    vol_avg = avg_vol(candles)
    vol_ratio = last["volume"] / vol_avg if vol_avg > 0 else 1.0

    lb = FIND_LEVELS_LB.get(tf, 50)
    levels = find_levels(candles, lb)
    vwap = calc_vwap(candles)
    obv_trend = calc_obv_trend(candles)
    stoch_rsi = calc_stoch_rsi(rsi_arr)
    patterns = detect_candle_patterns(candles)
    divergences = detect_divergences(candles, rsi_arr)
    adx = calc_adx(candles)
    cvd = calc_cvd(candles)
    vol_profile = calc_volume_profile(candles)
    anchored_vwap = calc_anchored_vwap(candles)
    squeeze = calc_squeeze_momentum(candles)
    ichimoku = calc_ichimoku(candles)

    return {
        "price": price,
        "rsi_arr": rsi_arr,
        "rsi": rsi,
        "ema9": ema9,
        "ema21": ema21,
        "ema200": ema200,
        "macd_now": macd_now,
        "macd_prev": macd_prev,
        "sig_now": sig_now,
        "sig_prev": sig_prev,
        "hist_now": hist_now,
        "hist_prev": hist_prev,
        "bb": bb,
        "atr": atr,
        "vol_ratio": vol_ratio,
        "levels": levels,
        "vwap": vwap,
        "obv_trend": obv_trend,
        "stoch_rsi": stoch_rsi,
        "patterns": patterns,
        "divergences": divergences,
        "adx": adx,
        "cvd": cvd,
        "vol_profile": vol_profile,
        "anchored_vwap": anchored_vwap,
        "squeeze": squeeze,
        "ichimoku": ichimoku,
        # Not ported for v1 (known gap — trendline +-10):
        "ema_cross": None,
        "mkt_struct": None,
        "triangle": None,
        "dbl_pattern": None,
        "bos_choch": detect_bos_choch(candles, lookback=lb),
        "order_block": detect_order_blocks(candles, lookback=lb),
        "trendline_break": None,
    }

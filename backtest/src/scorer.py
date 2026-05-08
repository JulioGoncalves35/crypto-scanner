"""
scorer.py — Python port of _computeScore from painel-core.js.

Input: price, ind (from calc_tech_indicators), fg, funding_rate, open_interest.
Returns: dict with score (raw int), direction, normalized_score (0-100).

Known gap vs live scanner: Trendline Break (+-10),
EMACross, MarketStructure, Triangle, DoublePattern — all return 0 in this port (v1).
BOS/CHoCH (+-12/22) and Order Block (+-14) are now ported.
"""

from typing import Optional
from indicators import calc_tech_indicators, TF_ADX_MIN, TF_MIN_STOP


MIN_DAILY_VOLUME_USDT = 5_000_000
CANDLES_PER_DAY = {"5m": 288, "15m": 96, "30m": 48, "1h": 24, "4h": 6, "1D": 1}


def compute_score(
    price: float,
    ind: dict,
    fg: dict,
    funding_rate: Optional[float] = None,
    open_interest: Optional[dict] = None,
) -> dict:
    rsi          = ind["rsi"]
    stoch_rsi    = ind["stoch_rsi"]
    macd_now     = ind["macd_now"]
    macd_prev    = ind["macd_prev"]
    sig_now      = ind["sig_now"]
    sig_prev     = ind["sig_prev"]
    hist_now     = ind["hist_now"]
    hist_prev    = ind["hist_prev"]
    ema9         = ind["ema9"]
    ema21        = ind["ema21"]
    ema200       = ind["ema200"]
    bb           = ind["bb"]
    vwap         = ind["vwap"]
    obv_trend    = ind["obv_trend"]
    vol_ratio    = ind["vol_ratio"]
    patterns     = ind["patterns"]
    divergences  = ind["divergences"]
    adx          = ind["adx"]
    cvd          = ind["cvd"]
    vol_profile  = ind["vol_profile"]
    ichimoku     = ind["ichimoku"]
    anchored_vwap = ind["anchored_vwap"]
    squeeze      = ind["squeeze"]
    bos_choch    = ind.get("bos_choch")
    order_block  = ind.get("order_block")

    score = 0

    # RSI
    if rsi is not None:
        if rsi < 30:
            score += 20
        elif rsi < 40:
            score += 10
        elif rsi > 70:
            score -= 20
        elif rsi > 60:
            score -= 10

    # StochRSI
    if stoch_rsi is not None:
        if stoch_rsi < 20:
            score += 8
        elif stoch_rsi > 80:
            score -= 8

    # MACD
    if (macd_now is not None and macd_prev is not None
            and sig_now is not None and sig_prev is not None):
        mx_up   = macd_now > sig_now and macd_prev <= sig_prev
        mx_down = macd_now < sig_now and macd_prev >= sig_prev
        m_above = macd_now > sig_now
        if mx_up:
            score += 20
        elif mx_down:
            score -= 20
        elif m_above:
            score += 7
        else:
            score -= 7
        if hist_now is not None and hist_prev is not None:
            if hist_now > hist_prev and hist_now > 0:
                score += 4
            if hist_now < hist_prev and hist_now < 0:
                score -= 4

    # EMA alignment
    if ema9 is not None and ema21 is not None and ema200 is not None:
        if price > ema9 and ema9 > ema21 and ema21 > ema200:
            score += 16
        elif price < ema9 and ema9 < ema21 and ema21 < ema200:
            score -= 16
        elif price > ema200:
            score += 7
        else:
            score -= 7
    elif ema9 is not None and ema21 is not None:
        if price > ema9 and ema9 > ema21:
            score += 10
        elif price < ema9 and ema9 < ema21:
            score -= 10

    # Bollinger
    if bb is not None:
        if price <= bb["lower"]:
            score += 10
        elif price >= bb["upper"]:
            score -= 10

    # VWAP
    if vwap is not None:
        if price > vwap * 1.002:
            score += 7
        elif price < vwap * 0.998:
            score -= 7

    # Anchored VWAP
    if anchored_vwap is not None:
        av = anchored_vwap["vwap"]
        if price > av * 1.002:
            score += 8
        elif price < av * 0.998:
            score -= 8

    # Volume Profile
    if vol_profile is not None:
        poc = vol_profile["poc"]
        vah = vol_profile["vah"]
        val = vol_profile["val"]
        poc_dist = abs(price - poc) / price
        if poc_dist < 0.005:
            pass  # neutral — no score change
        elif price < val:
            score += 5
        elif price > vah:
            score -= 5
        elif price > poc:
            score += 6
        else:
            score -= 6

    # Ichimoku (capped ±20)
    if ichimoku is not None:
        ich_score = 0
        if ichimoku["price_above_cloud"]:
            ich_score += 10
        elif ichimoku["price_below_cloud"]:
            ich_score -= 10
        if ichimoku["tk_cross"] == "bullish":
            ich_score += 8
        elif ichimoku["tk_cross"] == "bearish":
            ich_score -= 8
        if ichimoku["chikou_bull"] is True:
            ich_score += 4
        elif ichimoku["chikou_bull"] is False:
            ich_score -= 4
        score += max(-20, min(20, ich_score))

    # OBV
    if obv_trend == "rising":
        score += 6
    elif obv_trend == "falling":
        score -= 6

    # Snapshot direction before amplifiers (mirrors scoreDir in JS)
    score_dir = 1 if score >= 0 else -1

    # Volume amplifier
    if vol_ratio > 1.5:
        score += score_dir * 7

    # ADX
    if adx is not None:
        if adx > 30:
            score += score_dir * 10
        elif adx > 25:
            score += score_dir * 6
        elif adx < 20:
            score -= 8
        else:
            score -= 3

    # Funding Rate
    if funding_rate is not None:
        if funding_rate <= -0.0005:
            score += 12
        elif funding_rate <= -0.0001:
            score += 6
        elif funding_rate >= 0.0005:
            score -= 12
        elif funding_rate >= 0.0001:
            score -= 6

    # Open Interest
    if open_interest is not None:
        oi_chg = open_interest.get("change24h", 0)
        if oi_chg > 5:
            score += score_dir * 8
        elif oi_chg < -5:
            score -= 6

    # Fear & Greed
    fg_val = fg.get("value", 50)
    if fg_val < 25:
        score += 10
    elif fg_val > 75:
        score -= 10

    # Candle patterns
    for pat in patterns:
        score += pat["score"]

    # Divergences
    for div in divergences:
        score += div["score"]

    # CVD
    if cvd is not None:
        if cvd["trend"] == "rising":
            score += 7
        elif cvd["trend"] == "falling":
            score -= 7

    # Squeeze Momentum
    if squeeze is not None:
        if squeeze["released_bull"]:
            score += 15
        elif squeeze["released_bear"]:
            score -= 15
        elif not squeeze["squeezed"] and squeeze["momentum_trend"] == "rising":
            score += 6
        elif not squeeze["squeezed"] and squeeze["momentum_trend"] == "falling":
            score -= 6

    # BOS / CHoCH
    if bos_choch is not None:
        score += bos_choch["score"]

    # Order Block (score only if price_in_zone)
    if order_block is not None and order_block.get("price_in_zone"):
        score += order_block["score"]

    # Not ported for v1: Trendline Break (+-10)

    # Confluence multi-category bonus
    if score != 0:
        is_long = score > 0
        momentum_aligned = rsi is not None and ((is_long and rsi < 50) or (not is_long and rsi > 50))
        trend_aligned = (
            (ema200 is not None and ((is_long and price > ema200) or (not is_long and price < ema200)))
            or (ichimoku is not None and ((is_long and ichimoku["price_above_cloud"]) or (not is_long and ichimoku["price_below_cloud"])))
        )
        volume_aligned = (
            (is_long and obv_trend == "rising") or (not is_long and obv_trend == "falling")
            or (cvd is not None and ((is_long and cvd["trend"] == "rising") or (not is_long and cvd["trend"] == "falling")))
        )
        pattern_aligned = (
            any(pt["score"] > 0 if is_long else pt["score"] < 0 for pt in patterns)
            or any(d["score"] > 0 if is_long else d["score"] < 0 for d in divergences)
            or (squeeze is not None and (
                (is_long and (squeeze["released_bull"] or squeeze["momentum_trend"] == "rising"))
                or (not is_long and (squeeze["released_bear"] or squeeze["momentum_trend"] == "falling"))
            ))
        )
        aligned_count = sum([momentum_aligned, trend_aligned, volume_aligned, pattern_aligned])
        if aligned_count >= 2:
            sign = 1 if is_long else -1
            conf_bonus = 15 if aligned_count >= 4 else 10 if aligned_count >= 3 else 5
            score += sign * conf_bonus

    # Short-squeeze risk: RSI oversold + extreme fear in SHORT
    if score < 0 and rsi is not None and rsi < 40 and fg_val < 25:
        score += 20

    # Bull-trap risk: RSI overbought + extreme greed in LONG
    if score > 0 and rsi is not None and rsi > 60 and fg_val > 75:
        score -= 20

    return {"raw_score": score}


def analyze_candles(
    candles: list[dict],
    tf: str,
    fg: Optional[dict] = None,
    funding_rate: Optional[float] = None,
    open_interest: Optional[dict] = None,
    min_score: int = 85,
) -> Optional[dict]:
    """
    Full analysis pipeline for one coin/timeframe at the last candle.
    Returns signal dict or None if no signal above min_score.
    """
    if not candles or len(candles) < 50:
        return None

    # Liquidity filter (mirrors painel-core.js)
    candles_per_day = CANDLES_PER_DAY.get(tf, 24)
    sample = candles[-min(candles_per_day * 3, len(candles)):]
    total_vol_usdt = sum(c["volume"] * c["close"] for c in sample)
    avg_daily_vol = (total_vol_usdt / len(sample)) * candles_per_day
    if avg_daily_vol < MIN_DAILY_VOLUME_USDT:
        return None

    ind = calc_tech_indicators(candles, tf)
    price = ind["price"]
    adx = ind["adx"]

    # ADX hard filter
    adx_min = TF_ADX_MIN.get(tf, 18)
    if adx is not None and adx < adx_min:
        return None

    safe_fg = fg if fg is not None else {"value": 50, "label": "Neutro"}
    result = compute_score(price, ind, safe_fg, funding_rate, open_interest)
    raw_score = result["raw_score"]

    direction = "buy" if raw_score >= 0 else "sell"
    norm_score = min(100, round(abs(raw_score)))

    if norm_score < min_score:
        return None

    # Stop calculation (mirrors JS analyzeCandles)
    atr = ind["atr"]
    levels = ind["levels"]
    min_stop_pct = TF_MIN_STOP.get(tf, 0.015)

    if direction == "buy":
        sups = sorted(
            [l for l in levels if l["type"] == "support" and l["price"] < price],
            key=lambda l: l["price"],
            reverse=True,
        )
        stop = min(
            sups[0]["price"] if sups else price - atr * 1.5,
            price - atr * 1.2,
        )
        if (price - stop) < price * min_stop_pct:
            stop = price - price * min_stop_pct
    else:
        ress = sorted(
            [l for l in levels if l["type"] == "resistance" and l["price"] > price],
            key=lambda l: l["price"],
        )
        stop = max(
            ress[0]["price"] if ress else price + atr * 1.5,
            price + atr * 1.2,
        )
        if (stop - price) < price * min_stop_pct:
            stop = price + price * min_stop_pct

    stop_pct = abs(price - stop) / price

    # Fib targets (FIB_NORMAL)
    risk = abs(price - stop)
    if direction == "buy":
        m1 = price + risk * 1.618
        m2 = price + risk * 2.618
        m3 = price + risk * 4.236
    else:
        m1 = price - risk * 1.618
        m2 = price - risk * 2.618
        m3 = price - risk * 4.236

    return {
        "direction": direction,
        "score": norm_score,
        "raw_score": raw_score,
        "price": price,
        "stop": stop,
        "stop_pct": stop_pct,
        "m1": m1,
        "m2": m2,
        "m3": m3,
        "atr": atr,
        "adx": adx,
        "rsi": ind["rsi"],
    }

"""
engine.py — Walk-forward backtest engine.

Methodology (from scanner-strategy/02-backtest-spec.md):
  - Train window: 180 days (not used for optimization in v1 — parameters are fixed)
  - Validation window: 60 days
  - Step size: 60 days
  - Total: ~12-15 validation windows across 3 years
  - Costs: Bybit taker 0.055% + slippage 0.05% + funding estimate
  - Exit strategy: 33%/33%/34% at M1/M2/M3 (mirrors paper-trader.js)

How signals become trades:
  - For each candle in the validation window (after min history for indicators):
    - Run analyze_candles on the trailing WINDOW candles
    - If signal found, open a trade (if no open trade for that coin/tf)
  - Trade evolves: at each subsequent candle, check if stop or targets are hit
  - One trade per coin/tf at a time (no pyramiding)

Output per validation window: trades list with PnL, stats dict.
"""

import pandas as pd
import numpy as np
from typing import Optional
from scorer import analyze_candles
from indicators import calc_ema

# ─── Cost model ─────────────────────────────────────────────────────────────
BYBIT_TAKER     = 0.00055   # 0.055%
SLIPPAGE        = 0.0005    # 0.05% — conservative estimate for top-30 coins
ENTRY_COST      = BYBIT_TAKER + SLIPPAGE  # applied on notional
EXIT_COST       = BYBIT_TAKER + SLIPPAGE
FUNDING_8H_RATE = 0.0001    # 0.01% per 8h — average bullish market estimate
FUNDING_PERIOD_H = 8

# ─── Exit fractions (mirrors paper-trader.js 33/33/34) ──────────────────────
EXIT_M1 = 0.33
EXIT_M2 = 0.33
EXIT_M3 = 0.34

# ─── Candle window for indicator computation ─────────────────────────────────
WINDOW = 300  # trailing candles fed to analyze_candles

# ─── Timeframe to hours ──────────────────────────────────────────────────────
TF_HOURS = {"5m": 1/12, "15m": 0.25, "30m": 0.5, "1h": 1.0, "4h": 4.0, "1D": 24.0}


def _build_btc_regime(data: dict, tf: str = "4h") -> pd.Series:
    """
    Returns pd.Series[str] indexed by timestamp (ms int).
    Values: 'bull' (BTC close > EMA200) | 'bear' | 'unknown' (warmup or no data).
    Uses SMA-seeded EMA matching indicators.py calc_ema, not pandas ewm.
    Fail-open: missing data or warmup period -> 'unknown' (passes filter).
    """
    key = ("BTC", tf)
    if key not in data:
        print(f"[regime] WARNING: ('BTC', '{tf}') not in data — regime filter disabled (fail-open)")
        return pd.Series(dtype=str)
    df = data[key].copy().sort_values("timestamp").reset_index(drop=True)
    closes = df["close"].tolist()
    ema200_vals = calc_ema(closes, 200)  # first 199 are None; SMA-seeded
    df["ema200"] = ema200_vals
    regimes = []
    for i, row in df.iterrows():
        if row["ema200"] is None:
            regimes.append("unknown")
        elif row["close"] > row["ema200"]:
            regimes.append("bull")
        else:
            regimes.append("bear")
    df["regime"] = regimes
    return df.set_index("timestamp")["regime"]


def _regime_at(regime_series: pd.Series, ts: int) -> str:
    """Lookup BTC regime at or before the given timestamp. Returns 'unknown' if no data."""
    if regime_series.empty:
        return "unknown"
    idx = regime_series.index.searchsorted(ts, side="right") - 1
    if idx < 0:
        return "unknown"
    return regime_series.iloc[idx]


def _candles_from_df(df: pd.DataFrame) -> list[dict]:
    return df[["open", "high", "low", "close", "volume"]].to_dict("records")


def _simulate_trade(
    signal: dict,
    future_candles: list[dict],
    tf: str,
) -> dict:
    """
    Simulate a trade from signal entry forward through future_candles.
    Returns trade result dict.
    """
    direction = signal["direction"]
    entry     = signal["price"]
    stop      = signal["stop"]
    m1        = signal["m1"]
    m2        = signal["m2"]
    m3        = signal["m3"]

    # Remaining position fractions
    fractions = {1: EXIT_M1, 2: EXIT_M2, 3: EXIT_M3}
    exits_hit = {}
    stop_hit = False
    stop_price = None
    candles_held = 0
    tf_h = TF_HOURS.get(tf, 1.0)

    for candle in future_candles:
        candles_held += 1
        low  = candle["low"]
        high = candle["high"]

        if direction == "buy":
            # Stop first (adverse)
            if low <= stop:
                stop_hit = True
                stop_price = stop
                break
            # Targets (favorable)
            if 1 not in exits_hit and high >= m1:
                exits_hit[1] = m1
                stop = entry  # move stop to breakeven after M1
            if 2 not in exits_hit and high >= m2:
                exits_hit[2] = m2
            if 3 not in exits_hit and high >= m3:
                exits_hit[3] = m3
                break  # all targets hit
        else:  # sell
            if high >= stop:
                stop_hit = True
                stop_price = stop
                break
            if 1 not in exits_hit and low <= m1:
                exits_hit[1] = m1
                stop = entry
            if 2 not in exits_hit and low <= m2:
                exits_hit[2] = m2
            if 3 not in exits_hit and low <= m3:
                exits_hit[3] = m3
                break

    hours_held = candles_held * tf_h

    # Compute weighted PnL
    total_pnl_pct = 0.0
    remaining_fraction = 1.0

    for target_n in [1, 2, 3]:
        frac = fractions[target_n]
        if target_n in exits_hit:
            exit_px = exits_hit[target_n]
            if direction == "buy":
                raw_pnl = (exit_px - entry) / entry
            else:
                raw_pnl = (entry - exit_px) / entry
            net_pnl = raw_pnl - EXIT_COST - ENTRY_COST
            total_pnl_pct += frac * net_pnl
            remaining_fraction -= frac

    # Remaining position (stop or last close)
    if remaining_fraction > 0:
        if stop_hit:
            exit_px = stop_price
        else:
            exit_px = future_candles[-1]["close"] if future_candles else entry
        if direction == "buy":
            raw_pnl = (exit_px - entry) / entry
        else:
            raw_pnl = (entry - exit_px) / entry
        net_pnl = raw_pnl - EXIT_COST - ENTRY_COST
        total_pnl_pct += remaining_fraction * net_pnl

    # Funding cost (longs pay in bullish markets)
    funding_periods = hours_held / FUNDING_PERIOD_H
    funding_cost = funding_periods * FUNDING_8H_RATE
    total_pnl_pct -= funding_cost

    outcome = "stop"
    if exits_hit:
        max_target = max(exits_hit.keys())
        outcome = f"m{max_target}"

    return {
        "direction": direction,
        "entry": entry,
        "stop": signal["stop"],
        "m1": m1,
        "m2": m2,
        "m3": m3,
        "score": signal["score"],
        "pnl_pct": total_pnl_pct,
        "candles_held": candles_held,
        "hours_held": hours_held,
        "outcome": outcome,
        "targets_hit": list(exits_hit.keys()),
        "stop_hit": stop_hit,
    }


def _compute_stats(trades: list[dict], initial_capital: float = 10000.0) -> dict:
    if not trades:
        return {
            "total_trades": 0,
            "win_rate": None,
            "profit_factor": None,
            "sharpe": None,
            "sortino": None,
            "max_drawdown": None,
            "total_return": None,
            "avg_win": None,
            "avg_loss": None,
        }

    pnls = [t["pnl_pct"] for t in trades]
    wins = [p for p in pnls if p > 0]
    losses = [p for p in pnls if p <= 0]

    win_rate = len(wins) / len(pnls)
    avg_win = np.mean(wins) if wins else 0.0
    avg_loss = np.mean(losses) if losses else 0.0

    profit_factor = (
        sum(wins) / abs(sum(losses))
        if losses and sum(wins) > 0
        else (float("inf") if not losses and wins else 0.0)
    )

    # Equity curve (fixed 2% risk per trade)
    risk_per_trade = 0.02
    equity = initial_capital
    equity_curve = [equity]
    for p in pnls:
        equity *= 1 + p * risk_per_trade
        equity_curve.append(equity)

    total_return = (equity_curve[-1] - initial_capital) / initial_capital

    # Max drawdown
    peak = initial_capital
    max_dd = 0.0
    for v in equity_curve:
        if v > peak:
            peak = v
        dd = (peak - v) / peak
        if dd > max_dd:
            max_dd = dd

    # Sharpe (annualized, assumes each pnl is one trade unit)
    daily_returns = pd.Series(pnls) * risk_per_trade
    if daily_returns.std() > 0:
        sharpe = (daily_returns.mean() / daily_returns.std()) * np.sqrt(252)
    else:
        sharpe = 0.0

    # Sortino (downside only)
    downside = daily_returns[daily_returns < 0]
    if len(downside) > 0 and downside.std() > 0:
        sortino = (daily_returns.mean() / downside.std()) * np.sqrt(252)
    else:
        sortino = float("inf") if daily_returns.mean() > 0 else 0.0

    return {
        "total_trades": len(trades),
        "win_rate": round(win_rate, 4),
        "profit_factor": round(profit_factor, 4),
        "sharpe": round(sharpe, 4),
        "sortino": round(sortino, 4),
        "max_drawdown": round(max_dd, 4),
        "total_return": round(total_return, 4),
        "avg_win": round(avg_win, 4),
        "avg_loss": round(avg_loss, 4),
        "expectancy": round(win_rate * avg_win + (1 - win_rate) * avg_loss, 4),
    }


def run_validation_window(
    data: dict[tuple[str, str], pd.DataFrame],
    coins: list[str],
    timeframes: list[str],
    val_start: pd.Timestamp,
    val_end: pd.Timestamp,
    min_score: int = 85,
    max_future_candles: int = 200,
    verbose: bool = False,
    btc_regime_filter: bool = False,
) -> tuple[list[dict], dict]:
    """
    Run backtest on one validation window.
    Signals from val_start to val_end; each signal looks forward up to max_future_candles.
    """
    all_trades = []
    btc_regime = _build_btc_regime(data) if btc_regime_filter else pd.Series(dtype=str)

    for coin in coins:
        for tf in timeframes:
            key = (coin, tf)
            if key not in data:
                continue
            df = data[key]
            df = df[df["timestamp"] < int(val_end.timestamp() * 1000)].copy()
            df = df.reset_index(drop=True)
            if len(df) < WINDOW + 10:
                continue

            val_start_ms = int(val_start.timestamp() * 1000)
            val_end_ms   = int(val_end.timestamp() * 1000)
            val_mask = (df["timestamp"] >= val_start_ms) & (df["timestamp"] < val_end_ms)
            val_indices = df.index[val_mask].tolist()

            if not val_indices:
                continue

            last_close_idx = -1  # index after which new signals are allowed

            for idx in val_indices:
                if idx <= last_close_idx:
                    continue  # still inside a running trade

                # Build trailing candle window
                window_start = max(0, idx - WINDOW)
                candles = _candles_from_df(df.iloc[window_start: idx + 1])

                try:
                    signal = analyze_candles(
                        candles, tf,
                        fg={"value": 50, "label": "Neutro"},
                        funding_rate=None,
                        open_interest=None,
                        min_score=min_score,
                    )
                except Exception as e:
                    if verbose:
                        print(f"  [warn] {coin} {tf} idx={idx}: {e}")
                    continue

                if signal is None:
                    continue

                # BTC regime filter: block contra-trend entries
                if btc_regime_filter:
                    ts     = int(df.iloc[idx]["timestamp"])
                    regime = _regime_at(btc_regime, ts)
                    if signal["direction"] == "buy"  and regime == "bear":
                        continue
                    if signal["direction"] == "sell" and regime == "bull":
                        continue

                # Future candles for trade simulation (up to max_future_candles)
                future_df = df.iloc[idx + 1: idx + 1 + max_future_candles]
                if future_df.empty:
                    continue
                future = _candles_from_df(future_df)

                result = _simulate_trade(signal, future, tf)
                result["coin"] = coin
                result["tf"]   = tf
                result["signal_ts"] = int(df.iloc[idx]["timestamp"])

                all_trades.append(result)
                last_close_idx = idx + result["candles_held"]

    stats = _compute_stats(all_trades)
    if verbose:
        print(f"  Window {val_start.date()} to {val_end.date()}: "
              f"{stats['total_trades']} trades, WR={stats['win_rate']}, PF={stats['profit_factor']}")
    return all_trades, stats


def run_walk_forward(
    data: dict[tuple[str, str], pd.DataFrame],
    coins: list[str],
    timeframes: list[str],
    train_days: int = 180,
    val_days: int = 60,
    total_days: int = 1095,  # 3 years
    data_start: str = "2022-01-01",
    min_score: int = 85,
    verbose: bool = True,
    btc_regime_filter: bool = False,
) -> dict:
    """
    Walk-forward backtest.
    Returns: dict with 'windows' (per-window stats) and 'aggregate' stats.
    """
    start = pd.Timestamp(data_start, tz="UTC")
    step = pd.Timedelta(days=val_days)
    train_delta = pd.Timedelta(days=train_days)

    all_trades = []
    windows = []
    window_n = 0
    cursor = start + train_delta  # first validation starts after first train period

    end = start + pd.Timedelta(days=total_days)

    while cursor + step <= end:
        val_start = cursor
        val_end   = cursor + step
        window_n += 1
        if verbose:
            print(f"[Window {window_n}] Validation: {val_start.date()} → {val_end.date()}")

        trades, stats = run_validation_window(
            data, coins, timeframes,
            val_start, val_end,
            min_score=min_score,
            verbose=verbose,
            btc_regime_filter=btc_regime_filter,
        )
        windows.append({"window": window_n, "start": str(val_start.date()), "end": str(val_end.date()), "stats": stats, "trades": trades})
        all_trades.extend(trades)
        cursor += step

    aggregate = _compute_stats(all_trades)
    if verbose:
        print(f"\n=== AGGREGATE ({len(all_trades)} trades across {window_n} windows) ===")
        for k, v in aggregate.items():
            print(f"  {k}: {v}")

    return {"windows": windows, "aggregate": aggregate, "all_trades": all_trades}


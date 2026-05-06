"""
fetcher.py — Download and cache OHLCV data from Bybit via ccxt.

Cache lives in backtest/data/<symbol>_<tf>.parquet.
On subsequent runs, only fetches candles newer than the last cached timestamp.
"""

import os
import time
import ccxt
import pandas as pd
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent / "data"
DATA_DIR.mkdir(exist_ok=True)

# 41 coins from the scanner — Bybit perpetual symbols
SCAN_COINS = [
    "BTC", "ETH", "SOL", "BNB", "XRP", "ADA", "AVAX", "DOGE", "DOT", "LINK",
    "POL", "LTC", "ATOM", "UNI", "INJ", "ARB", "WLD", "SEI", "TIA", "SUI",
    "APT", "OP", "IMX", "JUP", "ONDO", "STRK", "BLUR", "MANTA", "ORDI", "BOME",
    "WIF", "ENA", "ETHFI", "PENDLE", "1000PEPE", "HBAR", "NEAR", "RENDER",
    "TRX", "FIL", "HYPE",
]

# Map to Bybit perpetual symbol format
def to_bybit_symbol(coin: str) -> str:
    return f"{coin}USDT"

TIMEFRAMES = ["5m", "15m", "30m", "1h"]

# ccxt timeframe → ms per candle
TF_MS = {
    "1m":  60_000,
    "5m":  300_000,
    "15m": 900_000,
    "30m": 1_800_000,
    "1h":  3_600_000,
    "4h":  14_400_000,
    "1D":  86_400_000,
}

BYBIT_LIMIT = 1000  # max candles per request


def _cache_path(coin: str, tf: str) -> Path:
    return DATA_DIR / f"{coin}_{tf}.csv"


def _load_cache(coin: str, tf: str) -> pd.DataFrame | None:
    path = _cache_path(coin, tf)
    if not path.exists():
        return None
    df = pd.read_csv(path, dtype={"timestamp": "int64"})
    return df


def _save_cache(df: pd.DataFrame, coin: str, tf: str) -> None:
    df = df.drop_duplicates(subset="timestamp").sort_values("timestamp").reset_index(drop=True)
    _cache_path(coin, tf).parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(_cache_path(coin, tf), index=False)


def _fetch_ohlcv_ccxt(
    exchange: ccxt.Exchange,
    symbol: str,
    tf: str,
    since_ms: int,
    end_ms: int,
) -> list[list]:
    """Fetch all candles from since_ms to end_ms in paginated batches."""
    all_candles = []
    current = since_ms
    while current < end_ms:
        try:
            batch = exchange.fetch_ohlcv(symbol, tf, since=current, limit=BYBIT_LIMIT)
        except ccxt.NetworkError as e:
            print(f"  [warn] network error fetching {symbol} {tf}: {e}. Retrying in 5s.")
            time.sleep(5)
            batch = exchange.fetch_ohlcv(symbol, tf, since=current, limit=BYBIT_LIMIT)
        if not batch:
            break
        all_candles.extend(batch)
        last_ts = batch[-1][0]
        if last_ts >= end_ms or len(batch) < BYBIT_LIMIT:
            break
        current = last_ts + TF_MS[tf]
        time.sleep(0.2)  # rate limit courtesy pause
    return all_candles


def fetch_coin(
    exchange: ccxt.Exchange,
    coin: str,
    tf: str,
    since_ms: int,
    end_ms: int | None = None,
    verbose: bool = True,
) -> pd.DataFrame:
    """
    Download (or update from cache) OHLCV for one coin/timeframe.
    Returns DataFrame with columns: timestamp, open, high, low, close, volume.
    """
    symbol = to_bybit_symbol(coin)
    if end_ms is None:
        end_ms = int(time.time() * 1000) - TF_MS[tf]  # exclude in-progress candle

    cached = _load_cache(coin, tf)
    if cached is not None and not cached.empty:
        last_ts = int(cached["timestamp"].max())
        fetch_from = last_ts + TF_MS[tf]
        if fetch_from >= end_ms:
            if verbose:
                print(f"  {coin} {tf}: cache up-to-date ({len(cached)} candles)")
            return cached.copy()
        if verbose:
            print(f"  {coin} {tf}: updating cache from {pd.Timestamp(fetch_from, unit='ms')} ({len(cached)} cached)")
    else:
        fetch_from = since_ms
        if verbose:
            print(f"  {coin} {tf}: fresh download from {pd.Timestamp(since_ms, unit='ms')}")

    raw = _fetch_ohlcv_ccxt(exchange, symbol, tf, fetch_from, end_ms)
    if not raw:
        if cached is not None:
            return cached.copy()
        return pd.DataFrame(columns=["timestamp", "open", "high", "low", "close", "volume"])

    new_df = pd.DataFrame(raw, columns=["timestamp", "open", "high", "low", "close", "volume"])
    new_df = new_df[new_df["timestamp"] < end_ms]

    if cached is not None and not cached.empty:
        df = pd.concat([cached, new_df], ignore_index=True)
    else:
        df = new_df

    df = df.drop_duplicates(subset="timestamp").sort_values("timestamp").reset_index(drop=True)
    _save_cache(df, coin, tf)
    if verbose:
        print(f"  {coin} {tf}: saved {len(df)} candles total")
    return df


def fetch_all(
    coins: list[str] = SCAN_COINS,
    timeframes: list[str] = TIMEFRAMES,
    since_iso: str = "2022-01-01T00:00:00Z",
    verbose: bool = True,
) -> dict[tuple[str, str], pd.DataFrame]:
    """
    Download (or update from cache) OHLCV for all coins and timeframes.
    Returns dict keyed by (coin, tf) → DataFrame.
    """
    exchange = ccxt.bybit({"enableRateLimit": True})

    since_ms = exchange.parse8601(since_iso)
    end_ms = int(time.time() * 1000)

    results: dict[tuple[str, str], pd.DataFrame] = {}
    total = len(coins) * len(timeframes)
    done = 0

    for coin in coins:
        for tf in timeframes:
            done += 1
            if verbose:
                print(f"[{done}/{total}] {coin} {tf}")
            try:
                df = fetch_coin(exchange, coin, tf, since_ms, end_ms, verbose=verbose)
                if not df.empty:
                    results[(coin, tf)] = df
            except Exception as e:
                print(f"  [error] {coin} {tf}: {e}")

    return results


if __name__ == "__main__":
    print("Downloading OHLCV data for all coins and timeframes...")
    data = fetch_all(verbose=True)
    print(f"\nDone. {len(data)} datasets cached.")
    for (coin, tf), df in list(data.items())[:3]:
        print(f"  {coin} {tf}: {len(df)} candles, "
              f"{pd.Timestamp(df['timestamp'].min(), unit='ms')} → "
              f"{pd.Timestamp(df['timestamp'].max(), unit='ms')}")

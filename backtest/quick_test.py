"""
quick_test.py — Download 2 months BTC+ETH 1h and run a 1-window backtest.
Used to verify the full pipeline works before running the full 3-year scan.
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent / "src"))

from fetcher import fetch_coin
from engine import run_validation_window
from report import save_results
import ccxt
import pandas as pd

exchange = ccxt.bybit({"enableRateLimit": True})
since_ms = exchange.parse8601("2024-01-01T00:00:00Z")
end_ms   = exchange.parse8601("2024-05-01T00:00:00Z")  # 4 months

coins = ["BTC", "ETH", "SOL"]
tfs   = ["1h"]

print("Downloading data...")
data = {}
for coin in coins:
    for tf in tfs:
        df = fetch_coin(exchange, coin, tf, since_ms, end_ms, verbose=True)
        if not df.empty:
            data[(coin, tf)] = df

print(f"\nData ready: {len(data)} pairs")

# Run one validation window (February → March 2024)
val_start = pd.Timestamp("2024-02-01", tz="UTC")
val_end   = pd.Timestamp("2024-04-01", tz="UTC")

print(f"\nRunning validation window {val_start.date()} to {val_end.date()}...")
trades, stats = run_validation_window(
    data, coins, tfs,
    val_start, val_end,
    min_score=85,
    verbose=True,
)

print(f"\nResults: {len(trades)} trades")
for k, v in stats.items():
    print(f"  {k}: {v}")

if trades:
    save_results({"windows": [{"window": 1, "start": str(val_start.date()), "end": str(val_end.date()), "stats": stats, "trades": trades}], "aggregate": stats, "all_trades": trades}, label="quick_test")

"""
run.py — Entry point for the crypto scanner backtest.

Usage:
  python run.py                    # full 3-year walk-forward, all 41 coins, 4 TFs
  python run.py --fetch-only       # only download data, no backtest
  python run.py --coins BTC ETH    # restrict to specific coins
  python run.py --tfs 15m 1h       # restrict to specific timeframes
  python run.py --since 2023-01-01 # start date for data download
  python run.py --min-score 85     # minimum score gate (default 85)
  python run.py --quick            # BTC+ETH+SOL, 15m+1h, 1 year — fast sanity check
"""

import sys
import argparse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "src"))

from fetcher import fetch_all, SCAN_COINS, TIMEFRAMES
from engine import run_walk_forward
from report import save_results


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Crypto scanner walk-forward backtest")
    p.add_argument("--fetch-only", action="store_true", help="Download data and exit")
    p.add_argument("--coins", nargs="+", default=None, help="Coin subset (e.g. BTC ETH SOL)")
    p.add_argument("--tfs", nargs="+", default=None, help="Timeframe subset (e.g. 15m 1h)")
    p.add_argument("--since", default="2022-01-01", help="Data download start date (ISO)")
    p.add_argument("--min-score", type=int, default=85, help="Minimum scanner score (default 85)")
    p.add_argument("--train-days", type=int, default=180, help="Train window in days")
    p.add_argument("--val-days", type=int, default=60, help="Validation window in days")
    p.add_argument("--total-days", type=int, default=1095, help="Total history in days (default 3 years)")
    p.add_argument("--label", default="backtest", help="Label prefix for output files")
    p.add_argument("--quick", action="store_true", help="Quick mode: BTC+ETH+SOL, 15m+1h, 1 year")
    p.add_argument("--quiet", action="store_true", help="Reduce verbosity")
    return p.parse_args()


def main() -> None:
    args = parse_args()

    if args.quick:
        coins = ["BTC", "ETH", "SOL"]
        tfs = ["15m", "1h"]
        total_days = 365
        since = "2023-06-01"
        label = "quick"
    else:
        coins = args.coins or SCAN_COINS
        tfs = args.tfs or TIMEFRAMES
        total_days = args.total_days
        since = args.since
        label = args.label

    verbose = not args.quiet

    print(f"=== Crypto Scanner Backtest ===")
    print(f"Coins: {len(coins)} ({', '.join(coins[:5])}{'...' if len(coins) > 5 else ''})")
    print(f"Timeframes: {tfs}")
    print(f"Since: {since}")
    print(f"Min score: {args.min_score}")
    print()

    # ── Step 1: Download data ───────────────────────────────────────────────
    print("Downloading / updating OHLCV cache...")
    data = fetch_all(coins=coins, timeframes=tfs, since_iso=f"{since}T00:00:00Z", verbose=verbose)
    print(f"Data ready: {len(data)} coin/tf pairs\n")

    if args.fetch_only:
        print("--fetch-only set. Exiting.")
        return

    # ── Step 2: Walk-forward backtest ───────────────────────────────────────
    print("Running walk-forward backtest...")
    results = run_walk_forward(
        data=data,
        coins=coins,
        timeframes=tfs,
        train_days=args.train_days,
        val_days=args.val_days,
        total_days=total_days,
        data_start=since,
        min_score=args.min_score,
        verbose=verbose,
    )

    # ── Step 3: Save results ────────────────────────────────────────────────
    save_results(results, label=label)


if __name__ == "__main__":
    main()

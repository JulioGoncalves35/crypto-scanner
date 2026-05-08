"""Cron-driven: review every active trade once and act.

Usage:
    python run_risk_review.py            # respects COUNCIL_DRY_RUN
    python run_risk_review.py --dry-run
    python run_risk_review.py --live
"""
import argparse
import logging
import sys
import httpx

from src import config
from src.backend_client import (
    get_active_trades, tighten_stop, close_trade,
)
from src.agents.risk_reviewer import run as run_reviewer

def _current_price(coin: str) -> float | None:
    try:
        r = httpx.get(
            "https://api.bybit.com/v5/market/tickers",
            params={"category": "linear", "symbol": f"{coin}USDT"},
            timeout=5,
        )
        return float(r.json()["result"]["list"][0]["lastPrice"])
    except Exception:
        return None

def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser()
    g = parser.add_mutually_exclusive_group()
    g.add_argument("--dry-run", action="store_true")
    g.add_argument("--live", action="store_true")
    args = parser.parse_args(argv)

    logging.basicConfig(level=config.LOG_LEVEL,
                        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
    log = logging.getLogger("run_risk_review")

    dry = True if args.dry_run else (False if args.live else config.DRY_RUN)

    trades = get_active_trades()
    log.info("reviewing %d active trades (dry_run=%s)", len(trades), dry)

    for t in trades:
        price = _current_price(t["coin"])
        if price is None:
            log.warning("no price for %s, skipping", t["coin"])
            continue
        verdict = run_reviewer(t, current_price=price)
        log.info("trade %s (%s): %s — %s",
                 t["id"], t["coin"], verdict["action"], verdict["reason"])
        if dry:
            continue
        if verdict["action"] == "EXIT":
            close_trade(t["id"])
        elif verdict["action"] == "TIGHTEN_STOP" and verdict.get("new_stop"):
            res = tighten_stop(t["id"], float(verdict["new_stop"]))
            if res.get("blocked"):
                log.warning("  tighten rejected: %s", res["reason"])

    return 0

if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

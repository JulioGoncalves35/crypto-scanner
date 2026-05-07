"""Entry point: fetch latest scan candidates and run the council on each.

Usage:
    python run_council.py            # uses .env, lives by COUNCIL_DRY_RUN
    python run_council.py --dry-run  # never opens trades regardless of env
    python run_council.py --live     # forces live mode (still paper trade)
"""
import argparse
import logging
import sys

from src import config
from src.db import ensure_table, insert_decision
from src.backend_client import get_latest_scan_candidates, open_trade
from src.schemas import Candidate
from src.graph import run_council

def _setup_logging(level: str) -> None:
    logging.basicConfig(
        level=level,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser()
    g = parser.add_mutually_exclusive_group()
    g.add_argument("--dry-run", action="store_true")
    g.add_argument("--live", action="store_true")
    args = parser.parse_args(argv)

    _setup_logging(config.LOG_LEVEL)
    log = logging.getLogger("run_council")

    dry = True if args.dry_run else (False if args.live else config.DRY_RUN)
    log.info("council starting (dry_run=%s, min_score=%s)", dry, config.MIN_SCORE)

    ensure_table()
    scan_id, raw_candidates = get_latest_scan_candidates()
    log.info("scan_id=%s, %d raw candidates", scan_id, len(raw_candidates))

    eligible = [c for c in raw_candidates if int(c.get("score", 0)) >= config.MIN_SCORE]
    log.info("%d candidates pass min_score=%s", len(eligible), config.MIN_SCORE)

    for c in eligible:
        try:
            candidate = Candidate(**c, scan_id=scan_id)
        except Exception as e:
            log.warning("skip malformed candidate %s: %s", c.get("coin"), e)
            continue

        log.info("→ council on %s %s %s (score=%d)",
                 candidate.coin, candidate.direction, candidate.timeframe, candidate.score)
        final = run_council(candidate)
        trader = final.get("trader") or {}
        decision = trader.get("decision", "ERROR")
        reason = trader.get("reason", "no trader output")

        trade_id = None
        if decision in ("OPEN", "OPEN_REDUCED") and not dry:
            payload = trader["payload"]
            res = open_trade(__import__("src.schemas", fromlist=["OpenPayload"])
                             .OpenPayload(**payload))
            if res.get("blocked"):
                decision = "BLOCKED"
                reason = f"{reason} | backend blocked: {res['reason']}"
            else:
                trade_id = res.get("id")

        agent_outputs = {
            k: final.get(k) for k in
            ("technical", "sentiment", "news", "bull", "bear", "trader")
        }
        insert_decision(
            scan_id=scan_id, candidate_coin=candidate.coin,
            candidate_tf=candidate.timeframe, candidate_score=candidate.score,
            candidate_dir=candidate.direction, agent_outputs=agent_outputs,
            final_decision=decision, final_reason=reason, trade_id=trade_id,
        )
        log.info("  decision=%s trade_id=%s", decision, trade_id)

    return 0

if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

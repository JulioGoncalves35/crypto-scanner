"""
report.py - Backtest result reporting.

Generates:
  - results/summary.txt   - human-readable metrics
  - results/trades.csv    - all individual trades
  - results/windows.csv   - per-window stats
"""

import json
import csv
from pathlib import Path
from datetime import datetime

RESULTS_DIR = Path(__file__).parent.parent / "results"
RESULTS_DIR.mkdir(exist_ok=True)


def save_results(results: dict, label: str = "") -> None:
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    prefix = f"{label}_{ts}" if label else ts

    # ── Trades CSV ─────────────────────────────────────────────────────────
    trades_path = RESULTS_DIR / f"{prefix}_trades.csv"
    all_trades = results.get("all_trades", [])
    if all_trades:
        fieldnames = list(all_trades[0].keys())
        with open(trades_path, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=fieldnames)
            w.writeheader()
            w.writerows(all_trades)
        print(f"Trades saved: {trades_path}")

    # ── Per-window CSV ─────────────────────────────────────────────────────
    windows_path = RESULTS_DIR / f"{prefix}_windows.csv"
    windows = results.get("windows", [])
    if windows:
        rows = []
        for w in windows:
            row = {"window": w["window"], "start": w["start"], "end": w["end"]}
            row.update(w["stats"])
            rows.append(row)
        if rows:
            all_keys = list(dict.fromkeys(k for row in rows for k in row))
            with open(windows_path, "w", newline="", encoding="utf-8") as f:
                wr = csv.DictWriter(f, fieldnames=all_keys, extrasaction="ignore")
                wr.writeheader()
                wr.writerows(rows)
            print(f"Windows saved: {windows_path}")

    # ── Summary TXT ────────────────────────────────────────────────────────
    summary_path = RESULTS_DIR / f"{prefix}_summary.txt"
    agg = results.get("aggregate", {})
    lines = [
        "=" * 60,
        f"  BACKTEST SUMMARY - {ts}",
        "=" * 60,
        "",
        "AGGREGATE METRICS (all validation windows combined):",
        "",
        f"  Total trades:       {agg.get('total_trades', 'N/A')}",
        f"  Win rate:           {_fmt_pct(agg.get('win_rate'))}",
        f"  Profit factor:      {_fmt_num(agg.get('profit_factor'))}",
        f"  Sharpe ratio:       {_fmt_num(agg.get('sharpe'))}",
        f"  Sortino ratio:      {_fmt_num(agg.get('sortino'))}",
        f"  Max drawdown:       {_fmt_pct(agg.get('max_drawdown'))}",
        f"  Total return:       {_fmt_pct(agg.get('total_return'))}",
        f"  Avg win:            {_fmt_pct(agg.get('avg_win'))}",
        f"  Avg loss:           {_fmt_pct(agg.get('avg_loss'))}",
        f"  Expectancy:         {_fmt_pct(agg.get('expectancy'))}",
        "",
        "GO/NO-GO CRITERIA (from scanner-strategy/00-MASTER.md):",
        "",
    ]

    sharpe = agg.get("sharpe")
    mdd    = agg.get("max_drawdown")
    pf     = agg.get("profit_factor")
    wr     = agg.get("win_rate")

    def check(val, target, label, invert=False):
        if val is None:
            return f"  {label}: N/A (insufficient data)"
        ok = (val >= target) if not invert else (val <= target)
        icon = "PASS" if ok else "FAIL"
        return f"  {icon}  {label}: {val:.4f} (target {'<=' if invert else '>='} {target})"

    lines += [
        check(sharpe, 1.5, "Sharpe Ratio >= 1.5"),
        check(mdd,    0.25, "Max Drawdown <= 25%", invert=True),
        check(pf,     1.8,  "Profit Factor >= 1.8"),
        check(wr,     0.45, "Win Rate >= 45%"),
        "",
    ]

    if all(v is not None for v in [sharpe, mdd, pf, wr]):
        passed = sum([
            sharpe >= 1.5,
            mdd <= 0.25,
            pf >= 1.8,
            wr >= 0.45,
        ])
        verdict = "GO - System meets criteria. Consider paper trading." if passed == 4 else f"NO-GO - {4-passed}/4 criteria failed. Review and iterate."
        lines.append(f"VERDICT: {verdict}")
    else:
        lines.append("VERDICT: Insufficient data to assess.")

    lines += [
        "",
        "PER-WINDOW STATS:",
        "",
    ]
    for w in windows:
        s = w["stats"]
        lines.append(
            f"  Window {w['window']:2d} ({w['start']} to {w['end']}): "
            f"trades={s.get('total_trades', 0):3d}  "
            f"WR={_fmt_pct(s.get('win_rate'))}  "
            f"PF={_fmt_num(s.get('profit_factor'))}"
        )

    lines.append("")
    text = "\n".join(lines)
    summary_path.write_text(text, encoding="utf-8")
    print(f"Summary saved: {summary_path}")
    print()
    print(text)


def _fmt_pct(v) -> str:
    if v is None:
        return "N/A"
    return f"{v*100:.2f}%"


def _fmt_num(v) -> str:
    if v is None:
        return "N/A"
    return f"{v:.4f}"




"""Standalone agent — does NOT use CouncilState. Called per active trade."""
import logging
from src.llm_client import call_llm
from src.prompts.risk_reviewer import build
from src.schemas import RiskReviewerOutput

log = logging.getLogger(__name__)

def run(trade: dict, *, current_price: float) -> dict:
    sys, user = build(trade, current_price=current_price)
    try:
        raw = call_llm("risk_reviewer", system=sys, user=user, as_json=True)
        raw["trade_id"] = trade["id"]
        out = RiskReviewerOutput(**raw)
        return out.model_dump()
    except Exception as e:
        log.error("risk reviewer failed for %s: %s", trade["id"], e)
        return {"trade_id": trade["id"], "action": "HOLD",
                "new_stop": None, "reason": f"reviewer error: {e}"}

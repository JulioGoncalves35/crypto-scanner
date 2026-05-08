import logging
from src.llm_client import call_llm
from src.prompts.technical import build
from src.schemas import Candidate, TechnicalOutput

log = logging.getLogger(__name__)

def run(state: dict) -> dict:
    cand = Candidate(**state["candidate"])
    sys, user = build(cand)
    try:
        raw = call_llm("technical", system=sys, user=user, as_json=True)
        out = TechnicalOutput(**raw)
        return {"technical": out.model_dump()}
    except Exception as e:
        log.error("technical agent failed: %s — using fallback", e)
        fallback = TechnicalOutput(
            regime="unclear", confluences=[], red_flags=[f"agent_error: {e}"],
            confidence_0_100=0, tf_alignment="unclear",
        )
        return {
            "technical": fallback.model_dump(),
            "errors": [f"technical: {e}"],
        }

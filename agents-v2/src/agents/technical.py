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
        log.error("technical agent failed: %s", e)
        return {"errors": state.get("errors", []) + [f"technical: {e}"]}

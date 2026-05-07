import logging
from src.llm_client import call_llm
from src.prompts.news import build
from src.schemas import Candidate, NewsOutput

log = logging.getLogger(__name__)

def run(state: dict) -> dict:
    cand = Candidate(**state["candidate"])
    sys, user = build(cand)
    try:
        raw = call_llm("news", system=sys, user=user, as_json=True)
        out = NewsOutput(**raw)
        return {"news": out.model_dump()}
    except Exception as e:
        log.error("news agent failed: %s", e)
        return {"errors": state.get("errors", []) + [f"news: {e}"]}

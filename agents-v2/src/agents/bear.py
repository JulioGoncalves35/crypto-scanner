import logging
from src.llm_client import call_llm
from src.prompts.bear import build
from src.schemas import (
    Candidate, TechnicalOutput, SentimentOutput, NewsOutput, ResearcherOutput,
)

log = logging.getLogger(__name__)

def run(state: dict) -> dict:
    cand = Candidate(**state["candidate"])
    t = TechnicalOutput(**state["technical"])
    s = SentimentOutput(**state["sentiment"])
    n = NewsOutput(**state["news"])
    sys, user = build(cand, t, s, n)
    try:
        raw = call_llm("bear", system=sys, user=user, as_json=True)
        raw["side"] = "bear"
        out = ResearcherOutput(**raw)
        return {"bear": out.model_dump()}
    except Exception as e:
        log.error("bear agent failed: %s", e)
        return {"errors": state.get("errors", []) + [f"bear: {e}"]}

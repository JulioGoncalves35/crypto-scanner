import logging
from src.llm_client import call_llm
from src.prompts.bull import build
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
        raw = call_llm("bull", system=sys, user=user, as_json=True)
        raw["side"] = "bull"
        out = ResearcherOutput(**raw)
        return {"bull": out.model_dump()}
    except Exception as e:
        log.error("bull agent failed: %s — using fallback", e)
        fallback = ResearcherOutput(
            side="bull", thesis=f"agent_error: {e}",
            evidence=["agent failed"], counter_to_other_side="n/a",
            expected_rr=0.0,
        )
        return {
            "bull": fallback.model_dump(),
            "errors": [f"bull: {e}"],
        }

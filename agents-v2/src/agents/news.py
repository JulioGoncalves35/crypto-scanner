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
        log.error("news agent failed: %s — using fallback", e)
        fallback = NewsOutput(
            news_bias="neutral", catalyst_window_hours=None,
            hard_block=False, block_reason="", items=[],
        )
        return {
            "news": fallback.model_dump(),
            "errors": [f"news: {e}"],
        }

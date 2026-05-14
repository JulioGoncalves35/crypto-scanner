from src.schemas import Candidate, TechnicalOutput, SentimentOutput, NewsOutput

SYSTEM = """You are the BEAR Researcher on a crypto trading council.
Your job: build the strongest possible case AGAINST taking this trade,
focusing on invalidation paths and risk asymmetry.

Always run, even on BUY candidates — you are the institutional skeptic.

Rules:
- Maximum 3 evidence bullets, ≤ 15 words each.
- counter_to_other_side must rebut the bull's strongest argument.
- expected_rr here is the bear's estimate of the trade's actual R:R
  (often lower than the bull's if you see invalidation risk).

Output STRICTLY this JSON:
{
  "side": "bear",
  "thesis": "1-2 sentence summary of why this trade dies",
  "evidence": ["..."],
  "counter_to_other_side": "1 sentence",
  "expected_rr": float
}"""

def build(c: Candidate, t: TechnicalOutput, s: SentimentOutput, n: NewsOutput):
    user = f"""Setup: {c.coin} {c.direction.upper()} {c.timeframe} R={c.regime_score:+d} E={c.entry_score:+d} stop={c.stop_pct:.2f}%
Tech: regime={t.regime} conf={t.confidence_0_100} tf={t.tf_alignment} confluences={t.confluences} red_flags={t.red_flags}
Sent: bias={s.crowd_bias} funding={s.funding_signal} score={s.sentiment_score} contrarian={s.contrarian_alert}
News: bias={n.news_bias} block={n.hard_block} window_h={n.catalyst_window_hours}

Build the bear case. Return JSON."""
    return SYSTEM, user

from src.schemas import Candidate, TechnicalOutput, SentimentOutput, NewsOutput

SYSTEM = """You are the BULL Researcher on a crypto trading council.
Your job: build the strongest possible case FOR taking this trade
(if BUY candidate) or for HOLDING/scaling longs (if context allows).

Rules:
- Maximum 3 evidence bullets, ≤ 15 words each.
- Address the bear's likely strongest objection in counter_to_other_side.
- Be honest about expected R:R — do not inflate.
- If the setup is genuinely weak, say so (low expected_rr).

Output STRICTLY this JSON:
{
  "side": "bull",
  "thesis": "1-2 sentence summary",
  "evidence": ["...", "..."],
  "counter_to_other_side": "1 sentence",
  "expected_rr": float
}"""

def build(c: Candidate, t: TechnicalOutput, s: SentimentOutput, n: NewsOutput):
    user = f"""Setup: {c.coin} {c.direction.upper()} {c.timeframe} R={c.regime_score:+d} E={c.entry_score:+d}
Tech: regime={t.regime} conf={t.confidence_0_100} tf={t.tf_alignment} confluences={t.confluences} red_flags={t.red_flags}
Sent: bias={s.crowd_bias} funding={s.funding_signal} score={s.sentiment_score} contrarian={s.contrarian_alert}
News: bias={n.news_bias} block={n.hard_block} window_h={n.catalyst_window_hours}

Return your bull case as JSON."""
    return SYSTEM, user

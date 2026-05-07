from src.schemas import Candidate, TechnicalOutput, SentimentOutput, NewsOutput

SYSTEM = """You are the BULL Researcher on a crypto trading council.
Your job: build the strongest possible case FOR taking this trade
(if BUY candidate) or for HOLDING/scaling longs (if context allows).

Rules:
- Maximum 5 evidence bullets, each ≤ 20 words.
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
    user = f"""Setup: {c.coin} {c.direction.upper()} on {c.timeframe}, score {c.score}.
Entry={c.entry} Stop={c.stop} ({c.stop_pct:.2f}%) M1={c.m1} M2={c.m2} M3={c.m3}.

Technical view:
- regime={t.regime}, confidence={t.confidence_0_100}, tf={t.tf_alignment}
- confluences: {t.confluences}
- red_flags: {t.red_flags}

Sentiment view:
- crowd_bias={s.crowd_bias}, funding={s.funding_signal}, score={s.sentiment_score}
- contrarian_alert={s.contrarian_alert} ({s.notes})

News view:
- bias={n.news_bias}, hard_block={n.hard_block} ({n.block_reason})
- catalyst_window_hours={n.catalyst_window_hours}

Return your bull case as JSON."""
    return SYSTEM, user

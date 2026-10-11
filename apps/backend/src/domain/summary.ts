import { SessionSummarySchema, type Sentiment, type SessionSummary } from '@app/contracts';
import type { SessionCounters } from '../session/types.js';

/** Taxonomy tie-break order (nuance-taxonomy §1): the label the negotiator must act on wins a tie. */
const TIE_ORDER: readonly Sentiment[] = [
  'aggressive',
  'sarcastic',
  'deflecting',
  'appeasement',
  'negative',
  'positive',
  'neutral',
];

/** SPEC §5.4 from the running counters (never from the capped record list). Pure; schema-validated. */
export function buildSummary(sessionId: string, c: SessionCounters): SessionSummary {
  let dominant: Sentiment = 'neutral';
  let best = -1;
  for (const s of TIE_ORDER) {
    const n = c.sentiment_counts[s];
    if (n > best) {
      best = n;
      dominant = s;
    }
  }
  return SessionSummarySchema.parse({
    session_id: sessionId,
    chunk_count: c.chunk_count,
    aggregated_volatility_score: Math.round((c.flagged_count / c.chunk_count) * 100) / 100,
    dominant_sentiment: dominant,
    top_risk_moments: c.top_risk_moments,
  });
}

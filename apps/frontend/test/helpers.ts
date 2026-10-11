import type { TelemetryResponse } from '@app/contracts';
import type { StreamItem } from '../src/lib/store';

export const result = (id: string, extra: Partial<TelemetryResponse> = {}): TelemetryResponse => ({
  chunk_id: id,
  processing_latency_ms: 5,
  sentiment: 'neutral',
  confidence: 0.5,
  volatility_flag: false,
  hidden_intent: 'x',
  mitigation_suggestion: 'y',
  risk_level: 'low',
  ...extra,
});

export const item = (
  id: string,
  session = 's',
  extra: Partial<StreamItem> = {},
  res: Partial<TelemetryResponse> = {},
): StreamItem => ({
  chunk_id: id,
  session_id: session,
  speaker: null,
  text_excerpt: '',
  timestamp_ms: 1,
  received_at: 0,
  result: result(id, res),
  ...extra,
});

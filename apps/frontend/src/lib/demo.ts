import type { TelemetryRequestWire } from '@app/contracts';

type Step = Pick<TelemetryRequestWire, 'speaker' | 'text' | 'acoustic_metadata'>;

/** Scripted negotiation (invented content). */
export const DEMO_SCRIPT: readonly Step[] = [
  { speaker: 'counterpart', text: 'Thanks for coming. Let us talk about the contract terms.' },
  { speaker: 'candidate', text: 'Happy to. I am looking for a base of 140 thousand.' },
  {
    speaker: 'counterpart',
    text: 'That is well above our band. Honestly, I did not expect that number.',
    acoustic_metadata: { pitch_volatility: 0.6, speech_rate_wpm: 170, pause_duration_ms: 500 },
  },
  { speaker: 'candidate', text: 'I can be flexible, maybe we can just meet in the middle?' },
  {
    speaker: 'counterpart',
    text: 'Oh sure, because that is clearly how budgets work around here.',
    acoustic_metadata: { pitch_volatility: 0.7, speech_rate_wpm: 160, volume_intensity: 0.6 },
  },
  {
    speaker: 'counterpart',
    text: 'I need an answer today or we move to the next candidate.',
    acoustic_metadata: { pitch_volatility: 0.9, speech_rate_wpm: 200, volume_intensity: 0.9 },
  },
  { speaker: 'candidate', text: 'Okay, fine, whatever works for you. I just want this settled.' },
  {
    speaker: 'counterpart',
    text: 'I will have to check with legal and the board before we can commit.',
    acoustic_metadata: { pause_duration_ms: 1200 },
  },
  { speaker: 'candidate', text: 'Could we agree on a review date and a signing bonus instead?' },
  { speaker: 'counterpart', text: 'That could work. Let me draft something and send it over.' },
];

/** Build wire requests for a fresh session. Ids use crypto.randomUUID(). */
export function buildDemoRequests(startMs: number = Date.now()): TelemetryRequestWire[] {
  const session = `demo-${crypto.randomUUID().slice(0, 8)}`;
  return DEMO_SCRIPT.map((s, i) => ({
    chunk_id: crypto.randomUUID(),
    session_id: session,
    timestamp_ms: startMs + i * 2000,
    ...s,
  }));
}

import type {
  AcousticField,
  AcousticMetadata,
  RiskLevel,
  Sentiment,
  Speaker,
} from '@app/contracts';
import { ACOUSTIC_DEFAULTS } from '@app/contracts';
import type { Classifier, ClassifyInput, LlmVerdict } from '../llm/classifier.js';
import * as L from './lexicon.js';
import { COPY } from './copy.js';

const CONF_CAP = 0.6;

/** Arousal as a mean z-score against population priors (weak evidence; imputed fields contribute 0). */
export function arousal(a: AcousticMetadata, imputed: readonly AcousticField[]): number {
  const z = (f: AcousticField, mean: number, sd: number): number =>
    imputed.includes(f) ? 0 : (a[f] - mean) / sd;
  return (
    (z('pitch_volatility', ACOUSTIC_DEFAULTS.pitch_volatility, 0.25) +
      z('volume_intensity', ACOUSTIC_DEFAULTS.volume_intensity, 0.2) +
      z('speech_rate_wpm', ACOUSTIC_DEFAULTS.speech_rate_wpm, 30)) /
    3
  );
}

interface Pick {
  sentiment: Sentiment;
  hits: number;
  ultimatum: boolean;
}

function pick(text: string, speaker: Speaker, slow: boolean): Pick {
  const count = (re: RegExp): number => text.match(new RegExp(re.source, 'g'))?.length ?? 0;
  const ult = count(L.ULTIMATUM);
  const blame = count(L.BLAME);
  if (ult + blame > 0) return { sentiment: 'aggressive', hits: ult + blame, ultimatum: ult > 0 };
  const benign = text.replace(L.BENIGN_NO, ' ');
  const pos = count(L.POSITIVE);
  const strong = count(L.SARCASM_STRONG);
  const weak = pos > 0 && L.INTENSIFIER.test(text) && (L.CONTEXT_NEG.test(text) || slow);
  if (strong > 0 || weak) return { sentiment: 'sarcastic', hits: strong + 1, ultimatum: false };
  const def = count(L.DEFLECT);
  if (def > 0) return { sentiment: 'deflecting', hits: def, ultimatum: false };
  const app = count(L.APPEASE);
  if (app > 0 || (speaker === 'candidate' && /\bwhatever\b/.test(text)))
    return { sentiment: 'appeasement', hits: Math.max(app, 1), ultimatum: false };
  const neg = benign.match(new RegExp(L.NEGATIVE.source, 'g'))?.length ?? 0;
  if (neg > pos) return { sentiment: 'negative', hits: neg, ultimatum: false };
  if (pos > 0) return { sentiment: 'positive', hits: pos, ultimatum: false };
  return { sentiment: 'neutral', hits: 0, ultimatum: false };
}

function risk(p: Pick, speaker: Speaker, hot: boolean, longPause: boolean): RiskLevel {
  switch (p.sentiment) {
    case 'aggressive':
      return p.ultimatum || hot ? 'critical' : 'high';
    case 'sarcastic':
      return 'high';
    case 'deflecting':
      return longPause ? 'high' : 'medium';
    case 'appeasement':
      return speaker === 'candidate' ? 'high' : 'medium';
    case 'negative':
      return hot ? 'high' : 'medium';
    default:
      return 'low';
  }
}

/** Pure, sub-millisecond rule-based verdict. Confidence is capped at 0.6 (it is a fallback). */
export function classifyRules(input: ClassifyInput): LlmVerdict {
  const a = input.acoustics;
  const text = L.normalise(input.text);
  const hot = arousal(a, input.imputed) >= 1.5;
  const longPause = !input.imputed.includes('pause_duration_ms') && a.pause_duration_ms >= 800;
  const slow = !input.imputed.includes('speech_rate_wpm') && a.speech_rate_wpm <= 110;
  const p = pick(text, input.speaker, slow);
  const base = p.sentiment === 'neutral' ? 0.4 : 0.45 + 0.05 * Math.min(p.hits, 2);
  const corroborated =
    (p.sentiment === 'aggressive' && hot) || (p.sentiment === 'deflecting' && longPause);
  const copy = COPY[p.sentiment][input.speaker];
  return {
    sentiment: p.sentiment,
    confidence: Math.min(CONF_CAP, base + (corroborated ? 0.05 : 0)),
    hidden_intent: copy.intent,
    mitigation: copy.mitigation,
    risk: risk(p, input.speaker, hot, longPause),
  };
}

export const heuristicClassifier: Classifier = {
  name: 'heuristic',
  classify(input) {
    const t = performance.now();
    return Promise.resolve({
      ok: true as const,
      provider: 'heuristic',
      verdict: classifyRules(input),
      ms: performance.now() - t,
    });
  },
};

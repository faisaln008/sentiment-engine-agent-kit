import type {
  AcousticField,
  AcousticMetadata,
  RiskLevel,
  Sentiment,
  Speaker,
} from '@app/contracts';

/** Semantic verdict (pre-fusion). Numbers like volatility are computed by domain code, never by the model. */
export interface LlmVerdict {
  sentiment: Sentiment;
  confidence: number;
  hidden_intent: string;
  mitigation: string;
  risk: RiskLevel;
}

export interface ClassifyInput {
  text: string;
  speaker: Speaker;
  acoustics: AcousticMetadata;
  imputed: readonly AcousticField[];
}

export type ClassifyResult =
  | { ok: true; verdict: LlmVerdict; provider: string; ms: number }
  | {
      ok: false;
      reason: 'timeout' | 'rate_limited' | 'http' | 'bad_json' | 'circuit_open' | 'no_key';
      provider: string;
      ms: number;
    };

/** Port. Implementations never throw. */
export interface Classifier {
  readonly name: string;
  classify(input: ClassifyInput, signal: AbortSignal): Promise<ClassifyResult>;
}

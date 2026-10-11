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

export interface ContextTurn {
  speaker: Speaker;
  sentiment: Sentiment;
  text: string;
}

export interface ClassifyInput {
  text: string;
  speaker: Speaker;
  acoustics: AcousticMetadata;
  imputed: readonly AcousticField[];
  /** Last <=3 turns, oldest first (S5a fills this; absent until then). */
  context?: readonly ContextTurn[];
  /** Pre-rendered acoustic descriptors vs the speaker's norm (S5a); else derived from population priors. */
  acousticNote?: string;
  /** Arousal z vs this speaker's baseline (S5a); the heuristic falls back to population priors without it. */
  arousalZ?: number;
}

export type ClassifyResult =
  | { ok: true; verdict: LlmVerdict; provider: string; ms: number; finishReason?: string }
  | {
      ok: false;
      reason: 'timeout' | 'rate_limited' | 'http' | 'bad_json' | 'circuit_open' | 'no_key';
      provider: string;
      ms: number;
      finishReason?: string;
      /** HTTP status when known (S4a: 401/403 disables a provider). */
      status?: number;
      /** From the `retry-after` header on 429 (S4a breaker cooldown floor). */
      retryAfterMs?: number;
      /** Chain-internal: why a provider was skipped without being called. */
      skip?: 'breaker' | 'cap' | 'disabled';
    };

/** Port. Implementations never throw. */
export interface Classifier {
  readonly name: string;
  classify(input: ClassifyInput, signal: AbortSignal): Promise<ClassifyResult>;
}

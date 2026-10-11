import type { Classifier, ClassifyInput, ClassifyResult } from './classifier.js';
import { buildMessages } from './prompt.js';
import { extractContent, parseVerdict } from './parse.js';
import type { FetchFn } from '../infra/http-agent.js';

export interface AdapterLog {
  warn(obj: object, msg: string): void;
  info(obj: object, msg: string): void;
}

export interface AdapterOptions {
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  maxTokens: number;
  /** Empty/undefined => field omitted. */
  reasoningEffort?: string | undefined;
  fetchFn: FetchFn;
  log?: AdapterLog;
}

type Raw =
  | { kind: 'response'; status: number; body: unknown; retryAfterMs?: number }
  | { kind: 'error'; reason: 'timeout' | 'http' };

type Failure = Extract<ClassifyResult, { ok: false }>;

/** Seconds only; an HTTP-date `retry-after` is ignored (Groq sends seconds). */
function retryAfter(h: string | null): number | undefined {
  const n = h === null ? NaN : Number(h);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 1000) : undefined;
}

const JSON_MODE_RE = /response_format|json_object|json mode/i;

const REASONING_RE = /reasoning_effort|include_reasoning/i;

/** Which quota a 429 hit (TPM/TPD/RPM/RPD), from the provider's message; never logs the message itself. */
function limitType(body: unknown): 'TPM' | 'TPD' | 'RPM' | 'RPD' | undefined {
  const m = (body as { error?: { message?: unknown } } | null)?.error?.message;
  const hit = typeof m === 'string' ? /\b(TPM|TPD|RPM|RPD)\b/.exec(m)?.[1] : undefined;
  return hit === 'TPM' || hit === 'TPD' || hit === 'RPM' || hit === 'RPD' ? hit : undefined;
}

function errorInfo(body: unknown): {
  code: string;
  namesJsonMode: boolean;
  namesReasoning: boolean;
} {
  const e = (body as { error?: { code?: unknown; message?: unknown } } | null)?.error;
  const code = typeof e?.code === 'string' ? e.code : '';
  const message = typeof e?.message === 'string' ? e.message : '';
  const text = `${code} ${message}`;
  return { code, namesJsonMode: JSON_MODE_RE.test(text), namesReasoning: REASONING_RE.test(text) };
}

/**
 * One class for Groq, Gemini (OpenAI-compat), Cerebras, Ollama. Never throws; failures are values. */
export class OpenAiCompatClassifier implements Classifier {
  readonly name: string;
  // Deliberate per-provider capability state (not request state): flipped off once, only when a 400 explicitly
  // names response_format/json mode, then every later call for this provider omits it.
  private jsonMode = true;
  // Same idea for reasoning_effort/include_reasoning: off for good once a 400 names them.
  private reasoning = true;
  private jsonModeLogged = false;

  constructor(private readonly o: AdapterOptions) {
    this.name = o.name;
  }

  async classify(input: ClassifyInput, signal: AbortSignal): Promise<ClassifyResult> {
    const t = performance.now();
    const ms = (): number => performance.now() - t;
    const fail = (reason: Failure['reason'], extra: Partial<Failure> = {}): ClassifyResult => ({
      ok: false,
      reason,
      provider: this.name,
      ms: ms(),
      ...extra,
    });
    if (this.o.apiKey === '') return fail('no_key');
    try {
      const messages = buildMessages(input);
      let raw = await this.post(messages, this.jsonMode, signal);
      if (raw.kind === 'response' && raw.status === 400) {
        const e = errorInfo(raw.body);
        // Groq reports invalid/truncated JSON-mode output as 400 json_validate_failed: that is bad_json, one call.
        if (e.code === 'json_validate_failed') return fail('bad_json', { status: 400 });
        if (this.jsonMode && e.namesJsonMode) {
          this.jsonMode = false;
          this.logJsonModeOnce();
          raw = await this.post(messages, false, signal);
        } else if (this.reasoning && this.sendsReasoning() && e.namesReasoning) {
          // Model rejects reasoning_effort/include_reasoning (e.g. a llama model with the default effort):
          // capability state, like jsonMode. Retry once without and stay off.
          this.reasoning = false;
          this.o.log?.warn(
            { provider: this.name, status: 400 },
            'adapter.reasoning-unsupported: retrying without reasoning_effort',
          );
          raw = await this.post(messages, this.jsonMode, signal);
        }
      }
      if (raw.kind === 'error') return fail(raw.reason);
      if (raw.status === 429) {
        const limit = limitType(raw.body);
        return fail('rate_limited', {
          status: 429,
          ...(limit !== undefined ? { limit } : {}),
          ...(raw.retryAfterMs !== undefined ? { retryAfterMs: raw.retryAfterMs } : {}),
        });
      }
      if (raw.status < 200 || raw.status >= 300) return fail('http', { status: raw.status });
      const { content, finishReason } = extractContent(raw.body);
      const fr = finishReason === null ? {} : { finishReason };
      const verdict = content === null ? null : parseVerdict(content, input.speaker);
      if (verdict === null) return fail('bad_json', fr);
      return { ok: true, verdict, provider: this.name, ms: ms(), ...fr };
    } catch {
      return fail(signal.aborted ? 'timeout' : 'http');
    }
  }

  /** Fire-and-forget boot request to pay DNS/TLS before the first scored chunk. */
  warmUp(timeoutMs = 5000): Promise<void> {
    const input: ClassifyInput = {
      text: 'Hello.',
      speaker: 'counterpart',
      acoustics: {
        pitch_volatility: 0.3,
        speech_rate_wpm: 150,
        pause_duration_ms: 300,
        volume_intensity: 0.5,
      },
      imputed: [],
    };
    return this.classify(input, AbortSignal.timeout(timeoutMs)).then(
      (r) => {
        const detail = r.ok
          ? { ok: true }
          : {
              ok: false,
              reason: r.reason,
              ...(r.status === undefined ? {} : { status: r.status }),
            };
        this.o.log?.info({ provider: this.name, ...detail }, 'adapter.warm-up');
      },
      () => undefined,
    );
  }

  private logJsonModeOnce(): void {
    if (this.jsonModeLogged) return;
    this.jsonModeLogged = true;
    this.o.log?.warn(
      { provider: this.name },
      'adapter.json-mode-unsupported: retrying without response_format',
    );
  }

  /** True when a non-empty reasoning effort is configured, i.e. the fields were actually sent. */
  private sendsReasoning(): boolean {
    const r = this.o.reasoningEffort;
    return r !== undefined && r !== '';
  }

  private body(messages: unknown, jsonMode: boolean): string {
    const { model, maxTokens, baseUrl } = this.o;
    const effort = this.reasoning && this.sendsReasoning() ? this.o.reasoningEffort : undefined;
    return JSON.stringify({
      model,
      temperature: 0,
      max_tokens: maxTokens,
      ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
      ...(effort !== undefined ? { reasoning_effort: effort } : {}),
      ...(effort !== undefined && baseUrl.includes('groq') ? { include_reasoning: false } : {}),
      messages,
    });
  }

  private async post(messages: unknown, jsonMode: boolean, signal: AbortSignal): Promise<Raw> {
    let res: Response;
    try {
      res = await this.o.fetchFn(`${this.o.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${this.o.apiKey}` },
        body: this.body(messages, jsonMode),
        signal,
      });
    } catch {
      // adapter.network-error-is-http: DNS/TLS/reset are `http`; only our own abort is `timeout`.
      return { kind: 'error', reason: signal.aborted ? 'timeout' : 'http' };
    }
    const ra = retryAfter(res.headers.get('retry-after'));
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      if (signal.aborted) return { kind: 'error', reason: 'timeout' };
      body = null;
    }
    return {
      kind: 'response',
      status: res.status,
      body,
      ...(ra !== undefined ? { retryAfterMs: ra } : {}),
    };
  }
}

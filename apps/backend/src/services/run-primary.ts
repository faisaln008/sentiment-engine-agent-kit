import type { Classifier, ClassifyInput, ClassifyResult } from '../llm/classifier.js';

/**
 * Runs the primary under a deadline counted from t0. Races the signal too, so a classifier that ignores it
 * cannot overrun; the abort cancels any in-flight provider call.
 */
export async function runPrimary(
  c: Classifier,
  input: ClassifyInput,
  deadlineMs: number,
  t0: number,
): Promise<ClassifyResult> {
  const remaining = Math.max(1, Math.floor(deadlineMs - (performance.now() - t0)));
  const ac = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  const expired = new Promise<ClassifyResult>((resolve) => {
    timer = setTimeout(() => {
      ac.abort();
      resolve({ ok: false, reason: 'timeout', provider: c.name, ms: remaining });
    }, remaining);
  });
  try {
    return await Promise.race([c.classify(input, ac.signal), expired]);
  } finally {
    clearTimeout(timer);
  }
}

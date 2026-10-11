/**
 * Streams a scripted negotiation to the backend at real cadence (1–3 s between chunks) to feed the dashboard.
 *   npm run simulate -- [--target http://localhost:3000] [--speed 1] [--session <id>]
 * Script: eval/fixtures/demo-negotiation.json (invented; not from the brief or the eval dataset), validated at
 * start-up. Each run uses a fresh session id so repeated runs never collide with earlier session state.
 */
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import {
  AcousticMetadataWireSchema,
  SpeakerSchema,
  type TelemetryRequestWire,
} from '@app/contracts';
import { getHealth, normTarget, postChunk, sleep } from './lib/http.js';

const ScriptSchema = z.object({
  description: z.string(),
  turns: z
    .array(
      z.object({
        delay_ms: z.number().int().min(1000).max(3000),
        speaker: SpeakerSchema,
        text: z.string().min(1),
        acoustic_metadata: AcousticMetadataWireSchema,
      }),
    )
    .min(8),
});
const SCRIPT_PATH = new URL('./fixtures/demo-negotiation.json', import.meta.url);

const { values: a } = parseArgs({
  options: {
    target: { type: 'string', default: 'http://localhost:3000' },
    speed: { type: 'string', default: '1' },
    session: { type: 'string' },
  },
});

function line(t: number, who: string, r: Awaited<ReturnType<typeof postChunk>>): string {
  const ts = `${(t / 1000).toFixed(1).padStart(5)}s ${who}`;
  const x = r.response;
  if (!x) return `${ts} ERROR ${r.error ?? 'unknown'}`;
  const vol = x.volatility_flag ? 'VOLATILE ' : '         ';
  const lat = String(x.processing_latency_ms).padStart(4);
  return `${ts} ${x.sentiment.padEnd(11)} ${x.risk_level.padEnd(8)} ${vol}${lat} ms  ${x.hidden_intent}`;
}

async function main(): Promise<void> {
  const script = ScriptSchema.parse(JSON.parse(readFileSync(SCRIPT_PATH, 'utf8')));
  const target = normTarget(a.target);
  const health = await getHealth(target);
  if (!health) {
    console.error(`simulate: no /health at ${target}; start the backend first`);
    process.exit(2);
  }
  const speed = Math.max(0.1, Number(a.speed) || 1);
  const sessionId = a.session ?? `demo-${Date.now().toString(36)}`;
  console.log(
    `simulate: ${script.turns.length} chunks → ${target} [mode ${health.mode}] session ${sessionId}`,
  );
  const start = Date.now();
  for (const [i, turn] of script.turns.entries()) {
    await sleep(turn.delay_ms / speed);
    const body: TelemetryRequestWire = {
      chunk_id: `${sessionId}-c${String(i + 1).padStart(2, '0')}`,
      session_id: sessionId,
      timestamp_ms: Date.now(),
      speaker: turn.speaker,
      text: turn.text,
      acoustic_metadata: turn.acoustic_metadata,
    };
    const r = await postChunk(target, body);
    console.log(line(Date.now() - start, turn.speaker === 'candidate' ? 'You ' : 'Them', r));
  }
}

await main();

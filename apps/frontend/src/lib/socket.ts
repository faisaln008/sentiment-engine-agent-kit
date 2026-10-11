import { LIMITS, ServerMessageSchema, WS_PATH } from '@app/contracts';
import type { StreamItem } from './store';

export type WsStatus = 'connecting' | 'live' | 'reconnecting' | 'offline' | 'rejected';
export type WsEvent = { kind: 'hello'; mode: string } | { kind: 'item'; item: StreamItem };

/** Validate one raw frame (string JSON). Invalid, oversized or non-text frames are dropped. */
export function frameToEvent(data: unknown, now: number): WsEvent | null {
  if (typeof data !== 'string' || data.length > LIMITS.WS_MAX_MESSAGE_BYTES) {
    console.warn('ws frame dropped (type/size)');
    return null;
  }
  let json: unknown;
  try {
    json = JSON.parse(data);
  } catch {
    console.warn('ws frame dropped (not JSON)');
    return null;
  }
  const parsed = ServerMessageSchema.safeParse(json);
  if (!parsed.success) {
    console.warn('ws frame dropped (invalid)');
    return null;
  }
  const m = parsed.data;
  if (m.type === 'hello') return { kind: 'hello', mode: m.mode };
  return {
    kind: 'item',
    item: {
      chunk_id: m.result.chunk_id,
      session_id: m.session_id,
      speaker: m.speaker,
      text_excerpt: m.text_excerpt,
      timestamp_ms: m.timestamp_ms,
      received_at: now,
      result: m.result,
    },
  };
}

/** 0.5 s doubling to an 8 s cap, with +-25% jitter (never above the cap). */
export function backoffMs(attempt: number, random: () => number): number {
  const base = Math.min(8000, 500 * 2 ** attempt);
  return Math.min(8000, Math.round(base * (0.75 + 0.5 * random())));
}

export function defaultWsUrl(loc: Pick<Location, 'protocol' | 'host'>): string {
  return `${loc.protocol === 'https:' ? 'wss' : 'ws'}://${loc.host}${WS_PATH}`;
}

export interface WebSocketLike {
  onopen: (() => void) | null;
  onmessage: ((e: { data: unknown }) => void) | null;
  onclose: ((e: { code: number }) => void) | null;
  onerror: (() => void) | null;
  close(): void;
}

export interface SocketOptions {
  url: string;
  onEvent: (e: WsEvent) => void;
  onStatus: (s: WsStatus) => void;
  create?: (url: string) => WebSocketLike;
  random?: () => number;
  now?: () => number;
}

const OFFLINE_AFTER_FAILURES = 3;
/** Policy-violation close (e.g. Origin rejected after upgrade): retrying cannot help. */
const CLOSE_POLICY = 1008;
/** Backoff resets only after a valid hello or this long a stable open (prevents accept-then-close storms). */
const STABLE_OPEN_MS = 5000;

/** Connect with reconnect/backoff. Returns a function that closes for good. Not React-specific. */
export function connectSocket(o: SocketOptions): () => void {
  const create = o.create ?? ((u: string) => new WebSocket(u) as unknown as WebSocketLike);
  const random = o.random ?? Math.random;
  const now = o.now ?? Date.now;
  let attempt = 0;
  let everOpened = false;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let ws: WebSocketLike | null = null;
  let stable: ReturnType<typeof setTimeout> | undefined;

  const failed = (e?: { code: number }) => {
    if (stopped) return;
    clearTimeout(stable);
    ws = null;
    if (e?.code === CLOSE_POLICY) {
      stopped = true;
      o.onStatus('rejected');
      return;
    }
    const wait = backoffMs(attempt, random);
    attempt++;
    o.onStatus(!everOpened && attempt >= OFFLINE_AFTER_FAILURES ? 'offline' : 'reconnecting');
    timer = setTimeout(open, wait);
  };

  function open() {
    if (stopped) return;
    if (!everOpened && attempt === 0) o.onStatus('connecting');
    let sock: WebSocketLike;
    try {
      sock = create(o.url);
    } catch {
      failed();
      return;
    }
    ws = sock;
    sock.onopen = () => {
      everOpened = true;
      o.onStatus('live');
      stable = setTimeout(() => (attempt = 0), STABLE_OPEN_MS);
    };
    sock.onmessage = (e) => {
      const ev = frameToEvent(e.data, now());
      if (ev?.kind === 'hello') attempt = 0;
      if (ev) o.onEvent(ev);
    };
    sock.onclose = failed;
  }

  open();
  return () => {
    stopped = true;
    clearTimeout(stable);
    if (timer) clearTimeout(timer);
    if (ws) {
      ws.onclose = null;
      ws.close();
    }
  };
}

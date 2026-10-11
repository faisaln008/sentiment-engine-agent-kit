import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  backoffMs,
  connectSocket,
  defaultWsUrl,
  frameToEvent,
  type WebSocketLike,
  type WsEvent,
  type WsStatus,
} from '../src/lib/socket';
import { result } from './helpers';

const analysis = {
  type: 'analysis',
  session_id: 's',
  speaker: 'candidate',
  text_excerpt: 'hi',
  timestamp_ms: 5,
  result: result('c1'),
};

describe('frameToEvent', () => {
  beforeEach(() => void vi.spyOn(console, 'warn').mockImplementation(() => undefined));
  afterEach(() => vi.restoreAllMocks());

  it('hello', () => {
    expect(frameToEvent('{"type":"hello","mode":"heuristic"}', 1)).toEqual({
      kind: 'hello',
      mode: 'heuristic',
    });
  });
  it('analysis becomes a store item with received_at', () => {
    const e = frameToEvent(JSON.stringify(analysis), 42);
    expect(e?.kind === 'item' && e.item.received_at).toBe(42);
    expect(e?.kind === 'item' && e.item.speaker).toBe('candidate');
  });
  it('drops invalid shape, extra result key, bad JSON, binary, oversized', () => {
    expect(frameToEvent('{"type":"nope"}', 1)).toBeNull();
    expect(
      frameToEvent(JSON.stringify({ ...analysis, result: { ...analysis.result, x: 1 } }), 1),
    ).toBeNull();
    expect(frameToEvent('{', 1)).toBeNull();
    expect(frameToEvent(new ArrayBuffer(4), 1)).toBeNull();
    expect(frameToEvent('x'.repeat(16 * 1024 + 1), 1)).toBeNull();
  });
});

describe('backoffMs', () => {
  it('doubles from 0.5 s to an 8 s cap, jitter within +-25%', () => {
    expect(backoffMs(0, () => 0.5)).toBe(500);
    expect(backoffMs(1, () => 0.5)).toBe(1000);
    expect(backoffMs(4, () => 0.5)).toBe(8000);
    expect(backoffMs(10, () => 1)).toBe(8000);
    expect(backoffMs(0, () => 0)).toBe(375);
  });
});

describe('defaultWsUrl', () => {
  it('maps protocol', () => {
    expect(defaultWsUrl({ protocol: 'http:', host: 'a:1' })).toBe('ws://a:1/ws/telemetry');
    expect(defaultWsUrl({ protocol: 'https:', host: 'a' })).toBe('wss://a/ws/telemetry');
  });
});

class FakeWs implements WebSocketLike {
  static all: FakeWs[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  constructor() {
    FakeWs.all.push(this);
  }
  close() {
    this.closed = true;
  }
}

describe('connectSocket', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeWs.all = [];
  });
  afterEach(() => vi.useRealTimers());

  const start = () => {
    const statuses: WsStatus[] = [];
    const events: WsEvent[] = [];
    const stop = connectSocket({
      url: 'ws://x',
      create: () => new FakeWs(),
      random: () => 0.5,
      onStatus: (s) => statuses.push(s),
      onEvent: (e) => events.push(e),
    });
    return { statuses, events, stop };
  };

  it('goes offline after repeated failures and keeps retrying with growing delay', () => {
    const { statuses } = start();
    FakeWs.all[0]?.onclose?.({ code: 1006 });
    vi.advanceTimersByTime(499);
    expect(FakeWs.all).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FakeWs.all).toHaveLength(2);
    FakeWs.all[1]?.onclose?.({ code: 1006 });
    vi.advanceTimersByTime(1000);
    expect(FakeWs.all).toHaveLength(3);
    FakeWs.all[2]?.onclose?.({ code: 1006 });
    expect(statuses.at(-1)).toBe('offline');
    vi.advanceTimersByTime(2000);
    expect(FakeWs.all).toHaveLength(4);
  });

  it('live on open, delivers validated events, resets backoff, reconnects after close', () => {
    const { statuses, events } = start();
    const a = FakeWs.all[0];
    a?.onopen?.();
    expect(statuses.at(-1)).toBe('live');
    a?.onmessage?.({ data: '{"type":"hello","mode":"heuristic"}' });
    a?.onmessage?.({ data: 'garbage' });
    expect(events).toEqual([{ kind: 'hello', mode: 'heuristic' }]);
    a?.onclose?.({ code: 1006 });
    expect(statuses.at(-1)).toBe('reconnecting');
    vi.advanceTimersByTime(500);
    expect(FakeWs.all).toHaveLength(2);
  });

  it('accept-then-close storm: backoff keeps growing (no reset on bare open)', () => {
    const { statuses } = start();
    const delays = [500, 1000, 2000, 4000, 8000, 8000];
    delays.forEach((d, i) => {
      FakeWs.all[i]?.onopen?.();
      vi.advanceTimersByTime(100);
      FakeWs.all[i]?.onclose?.({ code: 1006 });
      vi.advanceTimersByTime(d - 1);
      expect(FakeWs.all).toHaveLength(i + 1);
      vi.advanceTimersByTime(1);
      expect(FakeWs.all).toHaveLength(i + 2);
    });
    expect(statuses.at(-1)).toBe('reconnecting');
  });

  it('valid hello or 5 s stable open resets backoff', () => {
    start();
    FakeWs.all[0]?.onopen?.();
    FakeWs.all[0]?.onclose?.({ code: 1006 });
    vi.advanceTimersByTime(500);
    FakeWs.all[1]?.onopen?.();
    FakeWs.all[1]?.onmessage?.({ data: '{"type":"hello","mode":"m"}' });
    FakeWs.all[1]?.onclose?.({ code: 1006 });
    vi.advanceTimersByTime(500);
    expect(FakeWs.all).toHaveLength(3);
    FakeWs.all[2]?.onopen?.();
    vi.advanceTimersByTime(5000);
    FakeWs.all[2]?.onclose?.({ code: 1006 });
    vi.advanceTimersByTime(500);
    expect(FakeWs.all).toHaveLength(4);
  });

  it('1008 is final: status rejected, no reconnect', () => {
    const { statuses } = start();
    FakeWs.all[0]?.onopen?.();
    FakeWs.all[0]?.onclose?.({ code: 1008 });
    expect(statuses.at(-1)).toBe('rejected');
    vi.advanceTimersByTime(60000);
    expect(FakeWs.all).toHaveLength(1);
  });

  it('stop closes the socket and cancels reconnects', () => {
    const { stop } = start();
    const a = FakeWs.all[0];
    stop();
    expect(a?.closed).toBe(true);
    a?.onclose?.({ code: 1006 });
    vi.advanceTimersByTime(20000);
    expect(FakeWs.all).toHaveLength(1);
  });
});

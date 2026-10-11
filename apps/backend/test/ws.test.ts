import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { ServerMessageSchema, TelemetryResponseSchema } from '@app/contracts';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { WsGateway, type WsLike } from '../src/http/ws-gateway.js';
import { createServer } from 'node:http';

const ORIGIN = 'http://localhost:5173';
const headers = { 'content-type': 'application/json' };

async function start(env: Record<string, string> = {}) {
  const app = buildApp(loadConfig({ LOG_LEVEL: 'silent', ...env }), { mode: () => 'heuristic' });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const port = (app.server.address() as AddressInfo).port;
  return { app, port };
}

/** Collects frames and the close code of one client. */
function connect(port: number, origin?: string) {
  const ws = new WebSocket(
    `ws://127.0.0.1:${port}/ws/telemetry`,
    origin === undefined ? {} : { origin },
  );
  const frames: string[] = [];
  const waiters: Array<() => void> = [];
  ws.on('message', (d, isBinary) => {
    expect(isBinary).toBe(false);
    frames.push(d.toString());
    waiters.splice(0).forEach((w) => w());
  });
  ws.on('error', () => undefined);
  const closed = new Promise<number>((res) => ws.on('close', (code) => res(code)));
  const next = async (n: number): Promise<string[]> => {
    while (frames.length < n) await new Promise<void>((r) => waiters.push(r));
    return frames;
  };
  return { ws, frames, closed, next };
}

describe('ws gateway', () => {
  it('ws.e2e-receive: hello (== /health mode) then analysis with a schema-valid frame, text only', async () => {
    const { app, port } = await start();
    try {
      const c = connect(port, ORIGIN);
      const [hello] = await c.next(1);
      const health = (await app.inject({ method: 'GET', url: '/health' })).json();
      expect(ServerMessageSchema.parse(JSON.parse(hello ?? ''))).toEqual({
        type: 'hello',
        mode: health.mode,
      });
      const text =
        'Our legal team needs to review this before we can respond to anything at all, so please be patient with us today.';
      const res = await app.inject({
        method: 'POST',
        url: '/api/telemetry/stream',
        headers,
        payload: JSON.stringify({
          chunk_id: 'w1',
          session_id: 'ws-s',
          speaker: 'Candidate',
          timestamp_ms: 1234,
          text,
        }),
      });
      const frames = await c.next(2);
      const msg = ServerMessageSchema.parse(JSON.parse(frames[1] ?? ''));
      expect(msg.type).toBe('analysis');
      if (msg.type !== 'analysis') return;
      expect(msg).toMatchObject({ session_id: 'ws-s', speaker: 'candidate', timestamp_ms: 1234 });
      expect(msg.text_excerpt.length).toBeLessThanOrEqual(80);
      expect(text.startsWith(msg.text_excerpt)).toBe(true);
      expect(msg.result.chunk_id).toBe('w1');
      expect(TelemetryResponseSchema.parse(msg.result)).toEqual(res.json());
      expect(Buffer.byteLength(frames[1] ?? '')).toBeLessThan(16 * 1024);
      c.ws.close();
    } finally {
      await app.close();
    }
  });

  it('ws.origin-rejected: mismatching Origin (incl. 127.0.0.1:5173) is closed with 1008, no hello', async () => {
    const { app, port } = await start();
    try {
      for (const origin of ['http://evil.example', 'http://127.0.0.1:5173']) {
        const c = connect(port, origin);
        expect(await c.closed).toBe(1008);
        expect(c.frames).toEqual([]);
      }
    } finally {
      await app.close();
    }
  });

  it('ws.origin-missing-rejected', async () => {
    const { app, port } = await start();
    try {
      const c = connect(port);
      expect(await c.closed).toBe(1008);
      expect(c.frames).toEqual([]);
    } finally {
      await app.close();
    }
  });

  it('CORS_ORIGIN list is honoured and wildcards are ignored', async () => {
    const { app, port } = await start({ CORS_ORIGIN: 'http://a.example, * ,http://b.example' });
    try {
      const ok = connect(port, 'http://b.example');
      await ok.next(1);
      ok.ws.close();
      expect(await connect(port, 'http://c.example').closed).toBe(1008);
    } finally {
      await app.close();
    }
  });

  it('inbound client messages are ignored (connection stays up); other paths are refused', async () => {
    const { app, port } = await start();
    try {
      const c = connect(port, ORIGIN);
      await c.next(1);
      c.ws.send('hello server');
      await app.inject({
        method: 'POST',
        url: '/api/telemetry/stream',
        headers,
        payload: JSON.stringify({ chunk_id: 'i1', session_id: 'i', text: 'hello' }),
      });
      expect((await c.next(2)).length).toBe(2);
      c.ws.close();
      const other = new WebSocket(`ws://127.0.0.1:${port}/nope`, { origin: ORIGIN });
      const err = await new Promise<boolean>((res) => {
        other.on('error', () => res(true));
        other.on('open', () => res(false));
      });
      expect(err).toBe(true);
    } finally {
      await app.close();
    }
  });

  it('ws.slow-client-dropped: > 1 MB buffered => terminated, others unaffected, errors caught per client', () => {
    const gw = new WsGateway({
      server: createServer(),
      allowedOrigins: [ORIGIN],
      maxClients: 50,
      pingIntervalMs: 60_000,
      mode: () => 'heuristic',
      warn: () => undefined,
    });
    const mk = (over: Partial<WsLike> = {}) => {
      const sent: string[] = [];
      let terminated = false;
      const ws: WsLike = {
        readyState: 1,
        bufferedAmount: 0,
        send: (d) => void sent.push(d),
        close: () => undefined,
        terminate: () => void (terminated = true),
        ...over,
      };
      return { ws, sent, terminated: () => terminated };
    };
    const slow = mk({ bufferedAmount: 2 * 1024 * 1024 });
    const throws = mk({
      send: () => {
        throw new Error('boom');
      },
    });
    const fine = mk();
    for (const c of [slow, throws, fine]) gw.attach(c.ws, ORIGIN);
    slow.sent.length = 0;
    gw.broadcast({
      type: 'analysis',
      session_id: 's',
      speaker: 'candidate',
      text_excerpt: 'x',
      timestamp_ms: 1,
      result: {
        chunk_id: 'c',
        processing_latency_ms: 1,
        sentiment: 'neutral',
        confidence: 0.5,
        volatility_flag: false,
        hidden_intent: 'none_detected',
        mitigation_suggestion: 'm',
        risk_level: 'low',
      },
    });
    expect(slow.terminated()).toBe(true);
    expect(slow.sent).toHaveLength(0);
    expect(throws.terminated()).toBe(true);
    expect(fine.sent).toHaveLength(2); // hello + analysis
    expect(gw.size).toBe(1);
    gw.close();
  });

  it('broadcast rejects a frame that fails the schema (extra key never leaves the server)', () => {
    const warns: string[] = [];
    const gw = new WsGateway({
      server: createServer(),
      allowedOrigins: [ORIGIN],
      maxClients: 50,
      pingIntervalMs: 60_000,
      mode: () => 'heuristic',
      warn: (_o, m) => void warns.push(m),
    });
    const sent: string[] = [];
    gw.attach(
      {
        readyState: 1,
        bufferedAmount: 0,
        send: (d) => void sent.push(d),
        close: () => undefined,
        terminate: () => undefined,
      },
      ORIGIN,
    );
    gw.broadcast({ type: 'analysis' } as never);
    expect(sent).toHaveLength(1);
    expect(warns).toEqual(['ws frame rejected by schema']);
    gw.close();
  });
});

describe('CORS on HTTP routes', () => {
  it('allowed origin gets exact-origin headers; others get none; preflight is 204', async () => {
    const app = buildApp(loadConfig({ LOG_LEVEL: 'silent' }));
    const ok = await app.inject({ method: 'GET', url: '/health', headers: { origin: ORIGIN } });
    expect(ok.headers['access-control-allow-origin']).toBe(ORIGIN);
    const bad = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'http://evil.example' },
    });
    expect(bad.headers['access-control-allow-origin']).toBeUndefined();
    const none = await app.inject({ method: 'GET', url: '/health' });
    expect(none.headers['access-control-allow-origin']).toBeUndefined();
    const pre = await app.inject({
      method: 'OPTIONS',
      url: '/api/telemetry/stream',
      headers: { origin: ORIGIN },
    });
    expect(pre.statusCode).toBe(204);
    expect(pre.headers['access-control-allow-methods']).toContain('POST');
    await app.close();
  });
});

const fakeWs = (over: Partial<WsLike> = {}) => {
  const closed: number[] = [];
  let terminated = false;
  const sent: string[] = [];
  const ws: WsLike = {
    readyState: 1,
    bufferedAmount: 0,
    send: (d) => void sent.push(d),
    close: (code) => void closed.push(code ?? 0),
    terminate: () => void (terminated = true),
    ...over,
  };
  return { ws, closed, sent, terminated: () => terminated };
};
const gw = (o: Partial<ConstructorParameters<typeof WsGateway>[0]> = {}) =>
  new WsGateway({
    server: createServer(),
    allowedOrigins: [ORIGIN],
    maxClients: 50,
    pingIntervalMs: 60_000,
    mode: () => 'heuristic',
    warn: () => undefined,
    ...o,
  });

describe('ws gateway hardening', () => {
  it('ws.max-clients: connections above the cap are closed with 1013', () => {
    const g = gw({ maxClients: 1 });
    const a = fakeWs();
    const b = fakeWs();
    g.attach(a.ws, ORIGIN);
    g.attach(b.ws, ORIGIN);
    expect(b.closed).toEqual([1013]);
    expect(g.size).toBe(1);
    g.close();
  });

  it('ws.hello-failure: a throwing mode() closes 1011 and warns instead of throwing', () => {
    const warns: string[] = [];
    const g = gw({
      mode: () => {
        throw new Error('boom');
      },
      warn: (_o, m) => void warns.push(m),
    });
    const a = fakeWs();
    expect(() => g.attach(a.ws, ORIGIN)).not.toThrow();
    expect(a.closed).toEqual([1011]);
    expect(warns).toEqual(['ws hello failed']);
    g.close();
  });

  it('ws.heartbeat: a client that misses a ping is terminated, an answering one stays', async () => {
    const g = gw({ pingIntervalMs: 20 });
    let pings = 0;
    const dead = fakeWs({ ping: () => void (pings += 1) });
    g.attach(dead.ws, ORIGIN);
    await new Promise((r) => setTimeout(r, 90));
    expect(pings).toBeGreaterThanOrEqual(1);
    expect(dead.terminated()).toBe(true);
    expect(g.size).toBe(0);
    g.close();
  });

  it('ws.no-clients: broadcast returns before parsing anything', () => {
    const warns: string[] = [];
    const g = gw({ warn: (_o, m) => void warns.push(m) });
    g.broadcast({ type: 'analysis' } as never); // would warn if it were parsed
    expect(warns).toEqual([]);
    g.close();
  });

  it('ws.oversized-frame is warned and dropped', () => {
    const warns: string[] = [];
    const g = gw({ warn: (_o, m) => void warns.push(m) });
    const a = fakeWs();
    g.attach(a.ws, ORIGIN);
    g.broadcast({
      type: 'analysis',
      session_id: 'x'.repeat(17_000),
      speaker: 'candidate',
      text_excerpt: 'x',
      timestamp_ms: 1,
      result: {
        chunk_id: 'c',
        processing_latency_ms: 1,
        sentiment: 'neutral',
        confidence: 0.5,
        volatility_flag: false,
        hidden_intent: 'none_detected',
        mitigation_suggestion: 'm',
        risk_level: 'low',
      },
    });
    expect(warns).toEqual(['ws frame over 16 KB dropped']);
    expect(a.sent).toHaveLength(1); // hello only
    g.close();
  });

  it('a duplicate chunk (not committed) is not re-broadcast', async () => {
    const { app, port } = await start();
    try {
      const c = connect(port, ORIGIN);
      await c.next(1);
      const body = JSON.stringify({ chunk_id: 'dupw', session_id: 'dw', text: 'hello there' });
      await app.inject({ method: 'POST', url: '/api/telemetry/stream', headers, payload: body });
      await app.inject({ method: 'POST', url: '/api/telemetry/stream', headers, payload: body });
      await new Promise((r) => setTimeout(r, 100));
      expect(c.frames).toHaveLength(2); // hello + one analysis
      c.ws.close();
    } finally {
      await app.close();
    }
  });

  it('Vary: Origin whenever an Origin header is present (even disallowed)', async () => {
    const app = buildApp(loadConfig({ LOG_LEVEL: 'silent' }));
    const r = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'http://evil.example' },
    });
    expect(r.headers['vary']).toContain('Origin');
    expect(r.headers['access-control-allow-origin']).toBeUndefined();
    await app.close();
  });
});

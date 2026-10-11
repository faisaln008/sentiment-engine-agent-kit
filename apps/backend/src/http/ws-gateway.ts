import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { ServerMessageSchema, WS_PATH, type ServerMessage } from '@app/contracts';
import { WebSocketServer, type WebSocket } from 'ws';

export const MAX_BUFFERED_BYTES = 1024 * 1024;
const MAX_FRAME_BYTES = 16 * 1024;
const MAX_INBOUND_BYTES = 1024;

/** The slice of `ws.WebSocket` the gateway uses (lets tests pass fakes). */
export interface WsLike {
  readyState: number;
  bufferedAmount: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  terminate(): void;
  /** Real sockets only; fakes may omit it. */
  ping?(): void;
}

export interface GatewayOptions {
  server: Server;
  allowedOrigins: readonly string[];
  /** Connections above this are closed with 1013 (try again later). */
  maxClients: number;
  /** Heartbeat period; a client that missed the previous ping is terminated. */
  pingIntervalMs: number;
  mode: () => string;
  warn: (obj: object, msg: string) => void;
}

const OPEN = 1;

/**
 * Server -> client only WebSocket broadcast on `/ws/telemetry` (SPEC §2.3). Origin must be in the allow-list
 * (missing or other => close 1008). Frames are text, built with ServerMessageSchema, <= 16 KB. A slow client
 * (> 1 MB buffered) is terminated; one client's failure never affects the others or the POST path.
 */
export class WsGateway {
  private readonly clients = new Set<WsLike>();
  private readonly wss = new WebSocketServer({ noServer: true, maxPayload: MAX_INBOUND_BYTES });

  private readonly alive = new Map<WsLike, boolean>();
  private readonly heartbeat: NodeJS.Timeout;

  constructor(private readonly o: GatewayOptions) {
    o.server.on('upgrade', (req, socket, head) => this.onUpgrade(req, socket, head));
    this.heartbeat = setInterval(() => this.beat(), o.pingIntervalMs);
    this.heartbeat.unref();
  }

  get size(): number {
    return this.clients.size;
  }

  /** Registers an already-upgraded socket: origin check, hello, lifecycle. Exposed for tests. */
  attach(ws: WsLike, origin: string | undefined): void {
    if (origin === undefined || !this.o.allowedOrigins.includes(origin)) {
      ws.close(1008, 'origin not allowed');
      return;
    }
    if (this.clients.size >= this.o.maxClients) {
      ws.close(1013, 'too many clients');
      return;
    }
    let hello: string;
    try {
      hello = JSON.stringify(ServerMessageSchema.parse({ type: 'hello', mode: this.o.mode() }));
    } catch (e) {
      this.o.warn({ err: e instanceof Error ? e.name : 'unknown' }, 'ws hello failed');
      ws.close(1011, 'internal error');
      return;
    }
    this.clients.add(ws);
    this.alive.set(ws, true);
    this.sendTo(ws, hello);
  }

  /** Sends one frame to every open client. Never throws. */
  broadcast(msg: ServerMessage): void {
    if (this.clients.size === 0) return; // nobody listening: skip schema parse and stringify
    let frame: string;
    try {
      frame = JSON.stringify(ServerMessageSchema.parse(msg));
    } catch (e) {
      this.o.warn({ err: e instanceof Error ? e.name : 'unknown' }, 'ws frame rejected by schema');
      return;
    }
    if (Buffer.byteLength(frame) > MAX_FRAME_BYTES) {
      this.o.warn({ bytes: Buffer.byteLength(frame) }, 'ws frame over 16 KB dropped');
      return;
    }
    for (const ws of [...this.clients]) this.sendTo(ws, frame);
  }

  close(): void {
    clearInterval(this.heartbeat);
    for (const ws of this.clients) ws.terminate();
    this.clients.clear();
    this.alive.clear();
    this.wss.close();
  }

  /** A pong arrived: the client is alive for the next heartbeat. */
  onPong(ws: WsLike): void {
    if (this.clients.has(ws)) this.alive.set(ws, true);
  }

  /** One heartbeat tick: ping everyone, terminate clients that never answered the previous ping. */
  private beat(): void {
    for (const ws of [...this.clients]) {
      if (this.alive.get(ws) === false) {
        this.drop(ws);
        continue;
      }
      this.alive.set(ws, false);
      try {
        ws.ping?.();
      } catch {
        this.drop(ws);
      }
    }
  }

  private drop(ws: WsLike): void {
    this.clients.delete(ws);
    this.alive.delete(ws);
    try {
      ws.terminate();
    } catch {
      // already gone
    }
  }

  private sendTo(ws: WsLike, frame: string): void {
    if (ws.readyState !== OPEN) {
      this.clients.delete(ws);
      this.alive.delete(ws);
      return;
    }
    if (ws.bufferedAmount > MAX_BUFFERED_BYTES) {
      this.drop(ws);
      return;
    }
    try {
      ws.send(frame);
    } catch {
      this.drop(ws);
    }
  }

  private onUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    const path = (req.url ?? '').split('?')[0];
    if (path !== WS_PATH) {
      socket.destroy();
      return;
    }
    this.wss.handleUpgrade(req, socket, head, (ws: WebSocket) => {
      ws.on('message', () => undefined); // server -> client only: inbound frames are ignored
      ws.on('pong', () => this.onPong(ws));
      ws.on('error', () => this.drop(ws));
      ws.on('close', () => {
        this.clients.delete(ws);
        this.alive.delete(ws);
      });
      this.attach(ws, req.headers.origin);
    });
  }
}

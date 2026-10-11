import { useCallback, useEffect, useReducer, useState } from 'react';
import type { TelemetryRequestWire } from '@app/contracts';
import { fetchMode, postChunk } from '../lib/api';
import { connectSocket, defaultWsUrl, type WsEvent, type WsStatus } from '../lib/socket';
import { emptyState, ingest, pinSession, type StoreState } from '../lib/store';

const EXCERPT_MAX = 80;

type Action = { type: 'event'; event: WsEvent } | { type: 'pin'; sessionId: string; at: number };

function reducer(state: StoreState, a: Action): StoreState {
  if (a.type === 'pin') return pinSession(state, a.sessionId, a.at);
  return a.event.kind === 'item' ? ingest(state, a.event.item) : state;
}

export interface Telemetry {
  state: StoreState;
  ws: WsStatus;
  /** Backend mode: WS hello wins, else GET /health. Free text. */
  mode: string | null;
  /** POST a chunk; the validated response is merged into the store (dedupe by chunk_id). */
  send: (req: TelemetryRequestWire, signal?: AbortSignal) => Promise<boolean>;
  /** Choose which session the UI shows. */
  pin: (sessionId: string) => void;
}

/**
 * Single owner of telemetry state AND the WebSocket. Everything entering the store is validated
 * here (POST via TelemetryResponseSchema, WS via ServerMessageSchema); nothing unvalidated is exposed.
 * Without WS the POST path works on its own.
 */
export function useTelemetry(): Telemetry {
  const [state, dispatch] = useReducer(reducer, emptyState);
  const [ws, setWs] = useState<WsStatus>('connecting');
  const [mode, setMode] = useState<string | null>(null);

  useEffect(() => {
    const ctl = new AbortController();
    void fetchMode(ctl.signal).then((m) => setMode((cur) => cur ?? m));
    const close = connectSocket({
      url: defaultWsUrl(window.location),
      onStatus: setWs,
      onEvent: (event) => {
        if (event.kind === 'hello') setMode(event.mode);
        dispatch({ type: 'event', event });
      },
    });
    return () => {
      ctl.abort();
      close();
    };
  }, []);

  const send = useCallback(async (req: TelemetryRequestWire, signal?: AbortSignal) => {
    const result = await postChunk(req, signal);
    if (!result) return false;
    dispatch({
      type: 'event',
      event: {
        kind: 'item',
        item: {
          chunk_id: result.chunk_id,
          session_id: req.session_id,
          speaker: req.speaker,
          text_excerpt: req.text.slice(0, EXCERPT_MAX),
          timestamp_ms: req.timestamp_ms,
          received_at: Date.now(),
          result,
        },
      },
    });
    return true;
  }, []);

  const pin = useCallback(
    (sessionId: string) => dispatch({ type: 'pin', sessionId, at: Date.now() }),
    [],
  );

  return { state, ws, mode, send, pin };
}

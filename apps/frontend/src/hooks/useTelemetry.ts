import { useCallback, useReducer } from 'react';
import type { TelemetryRequestWire } from '@app/contracts';
import { postChunk } from '../lib/api';
import { emptyState, ingest, type StoreState, type StreamItem } from '../lib/store';

const EXCERPT_MAX = 80;

function reducer(state: StoreState, item: StreamItem): StoreState {
  return ingest(state, item);
}

export interface Telemetry {
  state: StoreState;
  /** POST a chunk; the validated response is merged into the store (dedupe by chunk_id). */
  send: (req: TelemetryRequestWire) => Promise<boolean>;
  /** Merge an already-validated item (used by the WS path in S6c). */
  push: (item: StreamItem) => void;
}

/** Single owner of telemetry state. S6c adds the WebSocket here; POST path works on its own. */
export function useTelemetry(): Telemetry {
  const [state, push] = useReducer(reducer, emptyState);

  const send = useCallback(async (req: TelemetryRequestWire) => {
    const result = await postChunk(req);
    if (!result) return false;
    push({
      chunk_id: result.chunk_id,
      session_id: req.session_id,
      speaker: req.speaker,
      text_excerpt: req.text.slice(0, EXCERPT_MAX),
      timestamp_ms: req.timestamp_ms,
      result,
    });
    return true;
  }, []);

  return { state, send, push };
}

import type { Speaker, TelemetryResponse } from '@app/contracts';

/** Max items kept per session (ring buffer). */
export const MAX_PER_SESSION = 200;

export interface StreamItem {
  chunk_id: string;
  session_id: string;
  /** Unknown when the item only arrived via a POST response without request context. */
  speaker: Speaker | null;
  text_excerpt: string;
  timestamp_ms: number;
  result: TelemetryResponse;
}

/** Newest first. Immutable: every function returns a new state. */
export interface StoreState {
  sessions: Readonly<Record<string, readonly StreamItem[]>>;
  /** Session of the most recently ingested item. */
  activeSessionId: string | null;
}

export const emptyState: StoreState = { sessions: {}, activeSessionId: null };

/**
 * Insert an item (dedupe by chunk_id within the session). A duplicate may enrich an existing
 * item (e.g. WS frame carries speaker/excerpt that the POST response lacks) but never reorders it.
 */
export function ingest(state: StoreState, item: StreamItem): StoreState {
  const list = state.sessions[item.session_id] ?? [];
  const idx = list.findIndex((i) => i.chunk_id === item.chunk_id);
  let next: StreamItem[];
  if (idx >= 0) {
    const prev = list[idx];
    if (!prev) return state;
    const merged: StreamItem = {
      ...prev,
      speaker: prev.speaker ?? item.speaker,
      text_excerpt: prev.text_excerpt || item.text_excerpt,
    };
    next = list.slice();
    next[idx] = merged;
  } else {
    next = [item, ...list];
    // Keep sorted newest first by arrival; cap to the ring size.
    if (next.length > MAX_PER_SESSION) next.length = MAX_PER_SESSION;
  }
  return {
    sessions: { ...state.sessions, [item.session_id]: next },
    activeSessionId: idx >= 0 ? state.activeSessionId : item.session_id,
  };
}

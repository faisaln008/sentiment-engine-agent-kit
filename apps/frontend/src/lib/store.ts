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
  /** Client clock (ms) at first ingest; drives the volatility decay, never server time. */
  received_at: number;
  result: TelemetryResponse;
}

/** Newest first. Immutable: every function returns a new state. */
export interface StoreState {
  sessions: Readonly<Record<string, readonly StreamItem[]>>;
  /** Session shown in the UI: set via pinSession, or the newest session once the shown one is idle. */
  activeSessionId: string | null;
  /** Client time of the last explicit pin (counts as activity of the pinned session). */
  pinnedAt: number;
}

/** A new session takes over the view only after the shown session was quiet this long. */
export const SESSION_IDLE_MS = 10_000;
/** Sessions kept besides the shown one (LRU by last activity). */
export const MAX_OTHER_SESSIONS = 5;

export const emptyState: StoreState = { sessions: {}, activeSessionId: null, pinnedAt: 0 };

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
  const sessions = { ...state.sessions, [item.session_id]: next };
  const active = idx >= 0 ? state.activeSessionId : chooseActive(state, item);
  return { ...state, sessions: prune(sessions, active), activeSessionId: active };
}

function lastActivity(state: StoreState, id: string): number {
  const newest = state.sessions[id]?.[0]?.received_at ?? 0;
  return id === state.activeSessionId ? Math.max(newest, state.pinnedAt) : newest;
}

/** Follow a new session only if nothing is shown or the shown one has been idle. */
function chooseActive(state: StoreState, item: StreamItem): string {
  const cur = state.activeSessionId;
  if (cur === null || cur === item.session_id) return item.session_id;
  return item.received_at - lastActivity(state, cur) >= SESSION_IDLE_MS ? item.session_id : cur;
}

function prune(
  sessions: Record<string, readonly StreamItem[]>,
  active: string | null,
): Record<string, readonly StreamItem[]> {
  const others = Object.keys(sessions).filter((id) => id !== active);
  if (others.length <= MAX_OTHER_SESSIONS) return sessions;
  const byAge = others.sort(
    (a, b) => (sessions[b]?.[0]?.received_at ?? 0) - (sessions[a]?.[0]?.received_at ?? 0),
  );
  const out = { ...sessions };
  for (const id of byAge.slice(MAX_OTHER_SESSIONS)) delete out[id];
  return out;
}

export function pinSession(state: StoreState, sessionId: string, now: number): StoreState {
  return { ...state, activeSessionId: sessionId, pinnedAt: now };
}

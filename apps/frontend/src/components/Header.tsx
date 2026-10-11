import type { WsStatus } from '../lib/socket';

const WS_LABEL: Record<WsStatus, string> = {
  connecting: 'WS: connecting…',
  live: 'WS: live',
  reconnecting: 'WS: reconnecting…',
  offline: 'WS: offline (POST only)',
  rejected: 'WS: offline (origin rejected)',
};

interface Props {
  sessionId: string | null;
  ws: WsStatus;
  mode: string | null;
  p50: number | null;
  playing: boolean;
  onPlay: () => void;
}

export function Header({ sessionId, ws, mode, p50, playing, onPlay }: Props) {
  return (
    <header className="header">
      <h1>Negotiation Copilot</h1>
      <span className="dim">Session: {sessionId ?? '—'}</span>
      <span className={`dim ws ws-${ws}`}>
        <span aria-hidden="true">{ws === 'live' ? '●' : '○'}</span> {WS_LABEL[ws]}
      </span>
      <span className="dim">Mode: {mode ?? '—'}</span>
      <span className="dim">Server p50: {p50 === null ? '—' : `${p50} ms`}</span>
      <button type="button" className="btn" disabled={playing} onClick={onPlay}>
        {playing ? 'Playing…' : 'Play demo'}
      </button>
    </header>
  );
}

// Dev-staging trace: the optimiser's reasoning per daily trip, plus the captured-data
// inventory and the active-mode fetch button.

import type { DebugInfo } from './debug';

export interface DebugPanelProps {
  info: DebugInfo;
  /** Active mode: provided only on the live page when there are segments worth fetching. */
  onFetchMissing?: () => void;
  fetching?: boolean;
  progress?: { done: number; total: number } | null;
}

export function DebugPanel({ info, onFetchMissing, fetching, progress }: DebugPanelProps): JSX.Element {
  return (
    <div className="nrc-debug">
      <div className="nrc-debug-title">Optimiser trace</div>

      {info.trips.length === 0 && <div className="nrc-debug-row">No route searched yet.</div>}

      {info.trips.map((t, i) => {
        const d = t.decision;
        return (
          <div key={i} className="nrc-debug-block">
            <div className="nrc-debug-trip">
              {t.label} — <b>{d.status}</b>
            </div>
            <div className="nrc-debug-reason">{d.reason}</div>
            {d.adjacentHops.map((h, j) => (
              <div key={j} className={'nrc-debug-hop' + (h.present ? '' : ' miss')}>
                {h.present ? '✓' : '✗'} {h.fromCode}→{h.toCode} —{' '}
                {h.present ? (h.seats === 0 ? 'sold out' : `${h.seats} seats`) : 'no data'}
              </div>
            ))}
            {d.blockers.length > 0 && (
              <div className="nrc-debug-hop miss">⛔ blocked at {d.blockers.join(', ')}</div>
            )}
          </div>
        );
      })}

      <div className="nrc-debug-block">
        <div className="nrc-debug-sub">
          Captured: {info.stationsCount} stations · {info.capturedSegments.length} segments ·{' '}
          {info.seatMapsCount} seat maps
        </div>
        {info.capturedSegments.map((s, i) => (
          <div key={i} className="nrc-debug-seg">
            {s}
          </div>
        ))}
      </div>

      {onFetchMissing && (
        <button className="nrc-debug-btn" disabled={fetching} onClick={onFetchMissing}>
          {fetching
            ? `Fetching ${progress?.done ?? 0}/${progress?.total ?? 0}…`
            : 'Fetch missing segments'}
        </button>
      )}
    </div>
  );
}

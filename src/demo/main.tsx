// Standalone browser demo. Drives the real optimiser from a control bar and shows the
// per-trip results panel update live. Three synthetic daily trips (see scenario.ts).

import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { optimise } from '../optimiser/optimiser';
import type { ClassPolicy } from '../optimiser/optimiser';
import { ResultsPanel, CollapsedCard } from '../ui/ResultsPanel';
import type { TripView } from '../ui/ResultsPanel';
import { DebugPanel } from '../ui/DebugPanel';
import { collectDebugInfo } from '../ui/debug';
import { PANEL_CSS } from '../ui/panelCss';
import { buildScenario, STATIONS } from './scenario';

const shortName = (full: string) => full.replace(/ Station /g, ' · ');

function App(): JSX.Element {
  const [originSeq, setOriginSeq] = useState(1); // Ebute Metta
  const [destSeq, setDestSeq] = useState(9); // Moniya
  const [classPolicy, setClassPolicy] = useState<ClassPolicy>('cheapest');
  const [maxTickets, setMaxTickets] = useState<number | undefined>(undefined);
  const [showTrace, setShowTrace] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const fromSeq = Math.min(originSeq, destSeq);
  const toSeq = Math.max(originSeq, destSeq);

  const { trips: tripViews, debugInfo } = useMemo(() => {
    const { provider, trips } = buildScenario({ fromSeq, toSeq });
    const views: TripView[] = trips.map((t) => ({
      label: t.label,
      result: optimise(provider, { tripId: t.tripId, fromSeq, toSeq, classPolicy, maxTickets }),
    }));
    const debug = collectDebugInfo(
      provider,
      { fromSeq, toSeq },
      trips.map((t) => ({ label: t.label, tripId: t.tripId })),
    );
    return { trips: views, debugInfo: debug };
  }, [fromSeq, toSeq, classPolicy, maxTickets]);

  const codeOf = (seq: number) => STATIONS.find((s) => s.seq === seq)!.code;

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '28px 20px', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>NRC Seat Optimiser — live demo</h1>
      <p style={{ color: '#6b7689', marginTop: 0 }}>
        Three synthetic daily trips over the real Lagos–Ibadan line. Each trip is priced and
        recommended on its own — morning has seats, afternoon needs a split, evening is blocked.
      </p>

      <div style={panelStyle}>
        <label style={labelStyle}>
          From
          <select value={originSeq} onChange={(e) => setOriginSeq(Number(e.target.value))} style={selectStyle}>
            {STATIONS.map((s) => (
              <option key={s.seq} value={s.seq}>
                {s.code} — {shortName(s.name)}
              </option>
            ))}
          </select>
        </label>
        <label style={labelStyle}>
          To
          <select value={destSeq} onChange={(e) => setDestSeq(Number(e.target.value))} style={selectStyle}>
            {STATIONS.map((s) => (
              <option key={s.seq} value={s.seq}>
                {s.code} — {shortName(s.name)}
              </option>
            ))}
          </select>
        </label>
        <label style={labelStyle}>
          Class
          <select
            value={classPolicy}
            onChange={(e) => setClassPolicy(e.target.value as ClassPolicy)}
            style={selectStyle}
          >
            <option value="cheapest">Any (cheapest)</option>
            <option value="Standard">Standard</option>
            <option value="Business">Business</option>
            <option value="First">First</option>
          </select>
        </label>
        <label style={labelStyle}>
          Ticket limit
          <select
            value={maxTickets ?? 'none'}
            onChange={(e) => setMaxTickets(e.target.value === 'none' ? undefined : Number(e.target.value))}
            style={selectStyle}
          >
            <option value="none">No limit</option>
            <option value="2">2</option>
            <option value="3">3</option>
            <option value="4">4</option>
          </select>
        </label>
        <label style={{ ...labelStyle, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={showTrace} onChange={(e) => setShowTrace(e.target.checked)} />
          Show optimiser trace
        </label>
      </div>

      {collapsed ? (
        <CollapsedCard from={codeOf(fromSeq)} to={codeOf(toSeq)} trips={tripViews} onExpand={() => setCollapsed(false)} />
      ) : (
        <ResultsPanel
          from={codeOf(fromSeq)}
          to={codeOf(toSeq)}
          trips={tripViews}
          onCollapse={() => setCollapsed(true)}
        />
      )}

      {showTrace && (
        <div style={{ marginTop: 16 }}>
          <DebugPanel info={debugInfo} />
        </div>
      )}
    </div>
  );
}

const panelStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 14,
  padding: 16,
  border: '1px solid #e6ebf2',
  borderRadius: 12,
  marginBottom: 18,
  background: '#fafbfd',
};
const labelStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: '#5a6679' };
const selectStyle: CSSProperties = { padding: '6px 8px', borderRadius: 8, border: '1px solid #cdd6e3', fontSize: 14 };

if (!document.getElementById('nrc-demo-style')) {
  const style = document.createElement('style');
  style.id = 'nrc-demo-style';
  style.textContent = PANEL_CSS;
  document.head.appendChild(style);
}

const store = window as unknown as { __nrcRoot?: Root };
store.__nrcRoot ??= createRoot(document.getElementById('root')!);
store.__nrcRoot.render(<App />);

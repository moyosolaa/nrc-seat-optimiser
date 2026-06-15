// User-facing results, grouped per daily trip (morning / afternoon / evening). Each trip
// gets its own section — combinations are never mixed across trips (one physical train).
// The panel collapses to a small pill so it doesn't block the page. Tap an option for
// per-leg steps.

import { useState } from 'react';
import type { Combination } from '../shared/types';
import type { OptimiseResult } from '../optimiser/optimiser';

const naira = new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: 'NGN',
  maximumFractionDigits: 0,
});

export interface TripView {
  label: string;
  result: OptimiseResult;
}

export interface ResultsPanelProps {
  from: string;
  to: string;
  trips: TripView[];
  onCollapse?: () => void;
  onRefresh?: () => void;
}

const MAX_SHOWN = 10;

export function ResultsPanel({ from, to, trips, onCollapse, onRefresh }: ResultsPanelProps): JSX.Element | null {
  const shown = trips.filter((t) => t.result.status !== 'not-applicable');
  if (!shown.length) return null;

  return (
    <div className="nrc-optimiser">
      <div className="nrc-card">
        <div className="nrc-card-head">
          <div className="nrc-card-head-row">
            <b>{from} → {to}</b>
            {onCollapse && (
              <button className="nrc-collapse-btn" onClick={onCollapse} title="Collapse">
                ▾
              </button>
            )}
          </div>
          <span className="nrc-card-sub">
            {shown.length} trip{shown.length === 1 ? '' : 's'} today · each priced on its own train
          </span>
        </div>
        <div className="nrc-card-body">
          {shown.map((t, i) => (
            <TripSection key={i} label={t.label} result={t.result} />
          ))}
        </div>
        <div className="nrc-card-foot">
          Availability can be up to 5 min old — a seat may sell before you book.
          {onRefresh && (
            <div className="nrc-foot-actions">
              <button className="nrc-link" onClick={onRefresh}>
                Refresh page
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Compact pill shown when the panel is collapsed. */
export function CollapsedCard({
  from,
  to,
  trips,
  onExpand,
}: {
  from: string;
  to: string;
  trips: TripView[];
  onExpand: () => void;
}): JSX.Element {
  const withSplits = trips.filter((t) => t.result.status === 'splits-found');
  const prices = withSplits.flatMap((t) => t.result.combinations.map((c) => c.totalPrice));
  const meta = prices.length
    ? `${withSplits.length} train${withSplits.length === 1 ? '' : 's'} · from ${naira.format(Math.min(...prices))}`
    : 'sold out — tap for details';

  return (
    <button className="nrc-optimiser nrc-collapsed" onClick={onExpand}>
      <span className="nrc-collapsed-route">🚂 {from} → {to}</span>
      <span className="nrc-collapsed-meta">{meta}</span>
      <span className="nrc-collapsed-exp">▸</span>
    </button>
  );
}

function TripSection({ label, result }: TripView): JSX.Element {
  const all = result.combinations;
  const combos = all.slice(0, MAX_SHOWN); // top 10 — already ranked tickets → changes → price
  const cheapest = combos.length ? Math.min(...combos.map((c) => c.totalPrice)) : 0;
  const cheapestIdx = combos.findIndex((c) => c.totalPrice === cheapest);

  return (
    <div className="nrc-trip">
      <div className="nrc-trip-head">{label}</div>
      {result.status === 'direct-available' && (
        <div className="nrc-trip-note nrc-trip-ok">Seats available — book directly.</div>
      )}
      {result.status === 'no-options' && (
        <div className="nrc-trip-note nrc-trip-warn">Sold out — no combination completes it on this train.</div>
      )}
      {result.status === 'splits-found' && (
        <ul className="nrc-options">
          {combos.map((c, i) => (
            <Option key={i} combo={c} best={i === 0} cheapest={i === cheapestIdx && cheapestIdx !== 0} />
          ))}
          {all.length > MAX_SHOWN && (
            <li className="nrc-trip-more">+{all.length - MAX_SHOWN} more (more tickets / higher price)</li>
          )}
        </ul>
      )}
    </div>
  );
}

function Option({
  combo,
  best,
  cheapest,
}: {
  combo: Combination;
  best: boolean;
  cheapest: boolean;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const uniformClass =
    new Set(combo.legs.map((l) => l.className)).size === 1 ? combo.legs[0].className : null;
  const stops = [combo.legs[0].fromCode, ...combo.legs.map((l) => l.toCode)];

  return (
    <li className={'nrc-opt' + (best ? ' nrc-opt-best' : '')}>
      <button className="nrc-opt-head" onClick={() => setOpen((v) => !v)}>
        <div className="nrc-opt-top">
          <span className="nrc-opt-price">{naira.format(combo.totalPrice)}</span>
          <span className="nrc-opt-meta">
            {combo.ticketCount} tickets · {combo.seatSwitches} change{combo.seatSwitches === 1 ? '' : 's'}
            {uniformClass ? ` · ${uniformClass}` : ''}
          </span>
        </div>
        {(best || cheapest || !uniformClass) && (
          <div className="nrc-opt-tags">
            {best && <span className="nrc-tag nrc-tag-best">fewest tickets</span>}
            {cheapest && <span className="nrc-tag nrc-tag-cheap">cheapest</span>}
            {!uniformClass && <span className="nrc-tag nrc-tag-mix">mixed class</span>}
          </div>
        )}
        <div className="nrc-opt-route">{stops.join('  →  ')}</div>
        <div className="nrc-opt-toggle">{open ? 'Hide steps ▾' : 'Show steps ▸'}</div>
      </button>
      {open && (
        <ol className="nrc-steps">
          {combo.legs.map((l, i) => (
            <li key={i}>
              <span className="nrc-step-route">
                {i + 1}. {l.fromCode}→{l.toCode}
              </span>
              <span className="nrc-step-detail">
                {l.className}
                {l.seatNumber ? ` · ${l.coachName} seat ${l.seatNumber}` : ''} · {naira.format(l.fare)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </li>
  );
}

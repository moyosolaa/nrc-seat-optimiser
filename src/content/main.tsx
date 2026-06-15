// Isolated-world content script: glue + auto active-mode, per daily trip.
//
// On the first search where some trip is sold out, it AUTOMATICALLY fetches the adjacent
// hops (~8 calls — enough to tell if the journey is possible) — no button. Each O-D fetch
// populates every daily trip (matched by vehicleCode); each trip is optimised separately.
// "Find fewer-ticket options" fetches the multi-hop pieces on demand. Data is cached 5 min
// and reused across searches; after that the panel suggests refreshing the page.
//
// These are simple public GETs (the NRC search API needs no auth), tied to a user action,
// throttled and capped. See README "active mode".

import { createRoot } from 'react-dom/client';
import {
  ACTIVE_FETCH,
  ACTIVE_READY,
  ACTIVE_RESULT,
  CAPTURE_CHANNEL,
} from '../inject/intercept';
import { parseAvailableSeats, parseRouteWiseStations, parseSearchTrips } from '../api/parse';
import { InMemoryProvider } from '../api/provider';
import type { CacheDump } from '../api/provider';
import { optimise } from '../optimiser/optimiser';
import { planSegments } from '../active/plan';
import { tripLabel } from '../shared/labels';
import { ResultsPanel, CollapsedCard } from '../ui/ResultsPanel';
import type { TripView } from '../ui/ResultsPanel';
import { DebugPanel } from '../ui/DebugPanel';
import { collectDebugInfo } from '../ui/debug';
import { PANEL_CSS } from '../ui/panelCss';

const SEARCH_TRIPS = 'https://api.gsds.ng/search/search-trips';
const MAX_ACTIVE_REQUESTS = 40;
const CONCURRENCY = 3;

console.info('[NRC Optimiser] content script loaded on', location.href);

interface CandidateTrip {
  tripId: string;
  vehicleCode: string;
  label: string;
}

const provider = new InMemoryProvider();
let captures = 0;
let journey: { fromSeq: number; toSeq: number; travelDate: string; routeNumber: string } | null = null;
let candidateTrips: CandidateTrip[] = [];
let tripResults: TripView[] = [];
let activeReady = false;
let fetching = false;
let progress: { done: number; total: number } | null = null;
let debugOpen = false;
let collapsed = false;
let autoFetchedKey: string | null = null;
const pending = new Map<string, () => void>();

const jkey = () => (journey ? `${journey.fromSeq}-${journey.toSeq}-${journey.travelDate}` : '');

// --- shadow-DOM host ---
const host = document.createElement('div');
host.id = 'nrc-seat-optimiser-host';
Object.assign(host.style, {
  position: 'fixed',
  right: '16px',
  bottom: '16px',
  width: '380px',
  maxWidth: 'calc(100vw - 32px)',
  zIndex: '2147483647',
});
const shadow = host.attachShadow({ mode: 'open' });
const style = document.createElement('style');
style.textContent = PANEL_CSS;
shadow.appendChild(style);
const mount = document.createElement('div');
shadow.appendChild(mount);
document.documentElement.appendChild(host);
const root = createRoot(mount);

const seqOf = (id: string) => provider.getStations().find((s) => s.id === id)?.seq;
const idOf = (seq: number) => provider.getStations().find((s) => s.seq === seq)?.id;
const codeOf = (seq: number) => provider.getStations().find((s) => s.seq === seq)?.code ?? String(seq);

function recompute(): void {
  if (!journey || !candidateTrips.length) {
    tripResults = [];
    return;
  }
  tripResults = candidateTrips.map((t) => ({
    label: t.label,
    result: optimise(provider, { tripId: t.tripId, fromSeq: journey!.fromSeq, toSeq: journey!.toSeq }),
  }));
}

// --- 5-minute cross-search cache, persisted so it survives reloads/navigation ---
const CACHE_KEY = 'nrc_cache_v1';
let saveTimer: ReturnType<typeof setTimeout> | undefined;
function persistCache(): void {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      void chrome.storage?.local?.set({ [CACHE_KEY]: provider.serialize() });
    } catch {
      /* storage unavailable */
    }
  }, 500);
}
try {
  void chrome.storage?.local?.get(CACHE_KEY).then((r: Record<string, unknown>) => {
    const dump = r?.[CACHE_KEY] as CacheDump | undefined;
    if (dump) {
      provider.hydrate(dump);
      recompute();
      render();
    }
  });
} catch {
  /* storage unavailable */
}

function ingest(url: string, body: unknown, active: boolean): void {
  if (url.includes('/search/route-wise-stations')) {
    const stations = parseRouteWiseStations(body);
    if (stations.length) provider.setStations(stations);
  } else if (url.includes('/search/search-trips')) {
    const trips = parseSearchTrips(body);
    if (active) {
      for (const sub of trips) {
        const cand = candidateTrips.find((c) => c.vehicleCode === sub.vehicleCode);
        if (cand) {
          provider.addTrip({
            ...sub,
            tripId: cand.tripId,
            fromSeq: seqOf(sub.fromStationId) ?? sub.fromSeq,
            toSeq: seqOf(sub.toStationId) ?? sub.toSeq,
          });
        }
      }
    } else {
      for (const trip of trips) {
        provider.addTrip({
          ...trip,
          fromSeq: seqOf(trip.fromStationId) ?? trip.fromSeq,
          toSeq: seqOf(trip.toStationId) ?? trip.toSeq,
        });
      }
    }
  } else if (url.includes('/search/getAvailableSeats')) {
    const q = new URL(url).searchParams;
    const fromSeq = seqOf(q.get('fromStation') ?? '');
    const toSeq = seqOf(q.get('toStation') ?? '');
    const tripId = q.get('tripId');
    const coachTypeId = q.get('coachTypeId');
    if (tripId && coachTypeId && fromSeq && toSeq) {
      provider.addSeatMap(tripId, fromSeq, toSeq, coachTypeId, parseAvailableSeats(body));
    }
  }
}

window.addEventListener('message', (ev: MessageEvent) => {
  if (ev.source !== window) return;
  const data = ev.data as { channel?: string; url?: string; body?: unknown };
  if (!data?.channel) return;

  if (data.channel === ACTIVE_READY) {
    activeReady = true;
    maybeAutoFetch();
    render();
    return;
  }

  if (data.channel === CAPTURE_CHANNEL && data.url) {
    captures++;
    ingest(data.url, data.body, false);
    persistCache();
    if (data.url.includes('/search/search-trips')) {
      const trips = parseSearchTrips(data.body);
      if (trips.length) {
        const sorted = [...trips].sort((a, b) => a.departureTime.localeCompare(b.departureTime));
        candidateTrips = sorted.map((t) => ({
          tripId: t.tripId,
          vehicleCode: t.vehicleCode,
          label: tripLabel(t.departureTime, t.vehicleCode),
        }));
        const u = new URL(data.url);
        const next = {
          fromSeq: seqOf(sorted[0].fromStationId) ?? sorted[0].fromSeq,
          toSeq: seqOf(sorted[0].toStationId) ?? sorted[0].toSeq,
          travelDate: u.searchParams.get('travelDate') ?? '',
          routeNumber: u.searchParams.get('routeNumber') ?? 'LI',
        };
        const changed = !journey || jkeyOf(next) !== jkey();
        journey = next;
        if (changed) collapsed = false; // a fresh search reopens the panel
      }
    }
    recompute();
    maybeAutoFetch();
    render();
    return;
  }

  if (data.channel === ACTIVE_RESULT && data.url) {
    ingest(data.url, data.body, true);
    persistCache();
    pending.get(data.url)?.();
    pending.delete(data.url);
    recompute();
    render();
    return;
  }
});

const jkeyOf = (j: { fromSeq: number; toSeq: number; travelDate: string }) =>
  `${j.fromSeq}-${j.toSeq}-${j.travelDate}`;

/** Auto-fetch the adjacent hops the first time a sold-out search is seen for this journey. */
function maybeAutoFetch(): void {
  if (!activeReady || !journey || fetching) return;
  if (!tripResults.some((t) => t.result.fired)) return; // only when a trip is sold out
  if (autoFetchedKey === jkey()) return;
  autoFetchedKey = jkey();
  void runActiveMode();
}

function activeFetch(url: string): Promise<void> {
  return new Promise((resolve) => {
    pending.set(url, resolve);
    window.postMessage({ channel: ACTIVE_FETCH, url }, location.origin);
  });
}

async function runActiveMode(): Promise<void> {
  if (!journey || !candidateTrips.length || fetching) return;
  const have = (a: number, b: number) => candidateTrips.some((c) => provider.getSegment(c.tripId, a, b) != null);
  const urls = planSegments(journey.fromSeq, journey.toSeq, have)
    .map(([a, b]) => {
      const fa = idOf(a);
      const fb = idOf(b);
      return fa && fb
        ? `${SEARCH_TRIPS}?fromStation=${fa}&toStation=${fb}&travelDate=${journey!.travelDate}&routeNumber=${journey!.routeNumber}`
        : null;
    })
    .filter((u): u is string => u != null)
    .slice(0, MAX_ACTIVE_REQUESTS);

  fetching = true;
  progress = { done: 0, total: urls.length };
  render();

  let i = 0;
  const worker = async () => {
    while (i < urls.length) {
      await activeFetch(urls[i++]);
      if (progress) progress.done++;
      render();
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  fetching = false;
  progress = null;
  render();
}

function render(): void {
  const stations = provider.getStations().length;
  const sel = journey ? `${codeOf(journey.fromSeq)}→${codeOf(journey.toSeq)}` : null;
  const soldOutTrips = tripResults.filter((t) => t.result.fired).length;
  const anySoldOut = soldOutTrips > 0;
  const from = journey ? codeOf(journey.fromSeq) : '';
  const to = journey ? codeOf(journey.toSeq) : '';

  root.render(
    <div className="nrc-optimiser">
      <div className="nrc-stack">
        {anySoldOut && journey && (
          collapsed ? (
            <CollapsedCard from={from} to={to} trips={tripResults} onExpand={() => { collapsed = false; render(); }} />
          ) : (
            <ResultsPanel
              from={from}
              to={to}
              trips={tripResults}
              onCollapse={() => { collapsed = true; render(); }}
              onRefresh={() => location.reload()}
            />
          )
        )}
        {debugOpen && (
          <DebugPanel
            info={collectDebugInfo(
              provider,
              journey,
              candidateTrips.map((t) => ({ label: t.label, tripId: t.tripId })),
            )}
          />
        )}
        <div
          className="nrc-statuschip"
          title="Click to show the optimiser trace"
          style={{ cursor: 'pointer' }}
          onClick={() => { debugOpen = !debugOpen; render(); }}
        >
          {debugOpen ? '▾' : '▸'} NRC Optimiser · {stations} st · {captures} cap
          {fetching ? ` · fetching ${progress?.done ?? 0}/${progress?.total ?? 0}…` : ''}
          {sel ? ` · ${sel} · ${candidateTrips.length} trips (${soldOutTrips} sold out)` : ' · waiting…'}
        </div>
      </div>
    </div>,
  );
}

render();

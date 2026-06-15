// Snapshot of what the optimiser knows + why it decided what it did, per daily trip.
// Used by the live extension's trace panel and the demo's "show trace" toggle.

import type { InMemoryProvider } from '../api/provider';
import { explain } from '../optimiser/optimiser';
import type { OptimiseExplanation } from '../optimiser/optimiser';

export interface DebugTrip {
  label: string;
  tripId: string;
}

export interface DebugInfo {
  stationsCount: number;
  seatMapsCount: number;
  capturedSegments: string[];
  trips: Array<{ label: string; decision: OptimiseExplanation }>;
}

export function collectDebugInfo(
  provider: InMemoryProvider,
  journey: { fromSeq: number; toSeq: number } | null,
  trips: DebugTrip[],
): DebugInfo {
  const stations = provider.getStations();
  const codeOf = (seq: number) => stations.find((s) => s.seq === seq)?.code ?? String(seq);

  const capturedSegments = provider
    .debugOffers()
    .map((o) => {
      const cls = o.classes.map((c) => `${c.className[0]}:${c.availableSeats}`).join(' ');
      return `${codeOf(o.fromSeq)}→${codeOf(o.toSeq)}  ${cls}`;
    })
    .sort();

  const tripDecisions =
    journey && trips.length
      ? trips.map((t) => ({
          label: t.label,
          decision: explain(provider, { tripId: t.tripId, fromSeq: journey.fromSeq, toSeq: journey.toSeq }),
        }))
      : [];

  return {
    stationsCount: stations.length,
    seatMapsCount: provider.seatMapCount(),
    capturedSegments,
    trips: tripDecisions,
  };
}

// Server-side equivalent of the extension's "active mode": for one origin→destination,
// fetch the direct O-D (to learn the daily trips), and — only if a trip is sold out —
// fetch the in-between segments and optimise each trip separately.
//
// Capped at 4 tickets (NRC's per-booking limit from the HAR): the bot must never suggest
// a combination a passenger can't actually book.

import { InMemoryProvider } from '../api/provider';
import { optimise } from '../optimiser/optimiser';
import { planSegments } from '../active/plan';
import { tripLabel } from '../shared/labels';
import type { Station } from '../shared/types';
import type { TripView } from '../ui/ResultsPanel';
import type { NrcClient } from './nrcClient';

export async function gatherJourney(
  client: NrcClient,
  stations: Station[],
  fromSeq: number,
  toSeq: number,
  travelDate: string,
  routeNumber: string,
  maxTickets = 4,
): Promise<{ tripResults: TripView[]; fetchCount: number }> {
  const provider = new InMemoryProvider(stations);
  const idOf = (seq: number) => stations.find((s) => s.seq === seq)?.id;
  const seqOf = (id: string) => stations.find((s) => s.id === id)?.seq;

  let fetchCount = 0;
  const fromId = idOf(fromSeq);
  const toId = idOf(toSeq);
  if (!fromId || !toId) return { tripResults: [], fetchCount };

  // The user's direct O-D defines the candidate trips (morning/afternoon/evening).
  const directTrips = await client.fetchTrips(fromId, toId, travelDate, routeNumber);
  fetchCount++;
  for (const t of directTrips) {
    provider.addTrip({ ...t, fromSeq: seqOf(t.fromStationId) ?? t.fromSeq, toSeq: seqOf(t.toStationId) ?? t.toSeq });
  }
  const candidateTrips = [...directTrips]
    .sort((a, b) => a.departureTime.localeCompare(b.departureTime))
    .map((t) => ({ tripId: t.tripId, vehicleCode: t.vehicleCode, label: tripLabel(t.departureTime, t.vehicleCode) }));

  const optimiseAll = (): TripView[] =>
    candidateTrips.map((t) => ({ label: t.label, result: optimise(provider, { tripId: t.tripId, fromSeq, toSeq, maxTickets }) }));

  if (!candidateTrips.length) return { tripResults: [], fetchCount };

  // Only spend calls when at least one trip is actually sold out.
  if (!optimiseAll().some((t) => !t.result.directAvailable)) {
    return { tripResults: optimiseAll(), fetchCount };
  }

  // Fetch the in-between segments — one fetch per O-D serves every daily trip.
  const have = (a: number, b: number) => candidateTrips.some((c) => provider.getSegment(c.tripId, a, b) != null);
  for (const [a, b] of planSegments(fromSeq, toSeq, have)) {
    const fa = idOf(a);
    const fb = idOf(b);
    if (!fa || !fb) continue;
    const subTrips = await client.fetchTrips(fa, fb, travelDate, routeNumber);
    fetchCount++;
    for (const sub of subTrips) {
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
  }

  return { tripResults: optimiseAll(), fetchCount };
}

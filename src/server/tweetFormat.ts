// Turns optimiser results into a passenger-facing tweet. Returns '' when there's nothing
// worth posting (every trip has a direct seat). Each trip's best option is already ranked
// fewest tickets → fewest seat changes → lowest price, and capped at 4 tickets.

import type { Station } from '../shared/types';
import type { TripView } from '../ui/ResultsPanel';

/** "Mobolaji Johnson Station Ebute Metta" → "Ebute Metta"; falls back to the last word. */
export function townOf(name: string): string {
  const parts = name.split(/\s*Station\s*/i);
  if (parts.length > 1 && parts[parts.length - 1].trim()) return parts[parts.length - 1].trim();
  return name.split(' ').slice(-1)[0] ?? name;
}

const naira = new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: 'NGN',
  maximumFractionDigits: 0,
});
const MAX = 280;
const trunc = (s: string) => (s.length <= MAX ? s : s.slice(0, MAX - 1).trimEnd() + '…');

export function formatJourneyTweet(from: string, to: string, trips: TripView[]): string {
  const splits = trips.filter((t) => t.result.status === 'splits-found');

  if (!splits.length) {
    if (trips.length > 0 && trips.every((t) => t.result.directAvailable)) return ''; // seats — nothing to recover
    if (trips.some((t) => t.result.status === 'no-options')) {
      return `🚆 ${from} → ${to}: sold out today, and no ticket combination completes it on any train. 😕`;
    }
    return '';
  }

  const lines = splits.map((t) => {
    const [period, time] = t.label.split(' · ');
    const best = t.result.combinations[0];
    const path = [best.legs[0].fromCode, ...best.legs.map((l) => l.toCode)].join('→');
    return `• ${period}${time ? ` ${time}` : ''}: ${path} · ${best.ticketCount} tickets · ${naira.format(best.totalPrice)}`;
  });

  return trunc(
    `🚆 ${from} → ${to} is SOLD OUT — but you can still get there:\n` +
      `${lines.join('\n')}\n` +
      `(seats change fast — book quickly)`,
  );
}

/** A per-departure post: one train near its departure, sold out but splittable. */
export function formatDepartureTweet(
  fromCode: string,
  toCode: string,
  trip: TripView,
  minutesToDeparture: number,
  stations: Station[],
): string {
  if (trip.result.status !== 'splits-found') return '';
  const town = (code: string) => townOf(stations.find((s) => s.code === code)?.name ?? code);
  const best = trip.result.combinations[0];
  const path = [best.legs[0].fromCode, ...best.legs.map((l) => l.toCode)].map(town).join(' → ');
  const [, time] = trip.label.split(' · ');
  return trunc(
    `🚆 ${town(fromCode)} → ${town(toCode)} · ${time ?? ''} train departs in ~${minutesToDeparture} min.\n` +
      `SOLD OUT — but you can still go:\n` +
      `${path}\n` +
      `${best.ticketCount} tickets · ${naira.format(best.totalPrice)} · book fast`,
  );
}

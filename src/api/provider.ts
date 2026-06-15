// The optimiser reads availability/fares through this interface, so it doesn't care
// whether the data came from passive interception, active fetching, or test seeds.
//
// The in-memory provider is a TTL cache: every entry is timestamped and reused for
// CACHE_TTL_MS (5 min) across *any* O-D search, then treated as stale. Because getSegment
// returns null for stale entries, the active-mode dedup re-fetches them automatically, and
// the optimiser never builds results from data older than the window.

import { CACHE_TTL_MS } from '../shared/config';
import type { CoachSeats, SegmentOffer, Station, Trip } from '../shared/types';

export interface AvailabilityProvider {
  getStations(): Station[];
  /** Fresh offer for the segment [fromSeq, toSeq] on `tripId`, or null if unknown/stale. */
  getSegment(tripId: string, fromSeq: number, toSeq: number): SegmentOffer | null;
  /** Fresh seat map for a segment + class, or null if we haven't captured it (or it's stale). */
  getSeats(tripId: string, fromSeq: number, toSeq: number, coachTypeId: string): CoachSeats[] | null;
}

const key = (tripId: string, a: number, b: number) => `${tripId}:${a}-${b}`;
const seatKey = (tripId: string, a: number, b: number, coachTypeId: string) =>
  `${tripId}:${a}-${b}:${coachTypeId}`;

interface Stamped<T> {
  value: T;
  at: number;
}

/** Serialisable snapshot for chrome.storage persistence across reloads. */
export interface CacheDump {
  stations: Station[];
  offers: Array<{ k: string; v: SegmentOffer; at: number }>;
  seatMaps: Array<{ k: string; v: CoachSeats[]; at: number }>;
}

export class InMemoryProvider implements AvailabilityProvider {
  private stations: Station[];
  private offers = new Map<string, Stamped<SegmentOffer>>();
  private seatMaps = new Map<string, Stamped<CoachSeats[]>>();
  private ttlMs: number;
  private clock: () => number;

  constructor(stations: Station[] = [], opts: { ttlMs?: number; clock?: () => number } = {}) {
    this.stations = stations;
    this.ttlMs = opts.ttlMs ?? CACHE_TTL_MS;
    this.clock = opts.clock ?? (() => Date.now());
  }

  private fresh<T>(e: Stamped<T> | undefined): T | null {
    if (!e) return null;
    return this.clock() - e.at <= this.ttlMs ? e.value : null;
  }

  setStations(stations: Station[]): void {
    this.stations = stations;
  }

  getStations(): Station[] {
    return this.stations;
  }

  addTrip(trip: Trip): void {
    this.offers.set(key(trip.tripId, trip.fromSeq, trip.toSeq), {
      value: { tripId: trip.tripId, fromSeq: trip.fromSeq, toSeq: trip.toSeq, classes: trip.classes },
      at: this.clock(),
    });
  }

  addOffer(offer: SegmentOffer): void {
    this.offers.set(key(offer.tripId, offer.fromSeq, offer.toSeq), { value: offer, at: this.clock() });
  }

  getSegment(tripId: string, a: number, b: number): SegmentOffer | null {
    return this.fresh(this.offers.get(key(tripId, a, b)));
  }

  addSeatMap(tripId: string, a: number, b: number, coachTypeId: string, coaches: CoachSeats[]): void {
    this.seatMaps.set(seatKey(tripId, a, b, coachTypeId), { value: coaches, at: this.clock() });
  }

  getSeats(tripId: string, a: number, b: number, coachTypeId: string): CoachSeats[] | null {
    return this.fresh(this.seatMaps.get(seatKey(tripId, a, b, coachTypeId)));
  }

  // --- debug introspection (only counts fresh entries) ---
  debugOffers(): SegmentOffer[] {
    return [...this.offers.values()].map((e) => this.fresh(e)).filter((v): v is SegmentOffer => v != null);
  }

  seatMapCount(): number {
    return [...this.seatMaps.values()].filter((e) => this.fresh(e) != null).length;
  }

  /** Oldest still-fresh offer timestamp, for an "as of" label (null if nothing cached). */
  oldestFreshAt(): number | null {
    const now = this.clock();
    const times = [...this.offers.values()].filter((e) => now - e.at <= this.ttlMs).map((e) => e.at);
    return times.length ? Math.min(...times) : null;
  }

  // --- persistence ---
  serialize(): CacheDump {
    return {
      stations: this.stations,
      offers: [...this.offers.entries()].map(([k, e]) => ({ k, v: e.value, at: e.at })),
      seatMaps: [...this.seatMaps.entries()].map(([k, e]) => ({ k, v: e.value, at: e.at })),
    };
  }

  /** Load a snapshot, dropping anything already past the TTL. */
  hydrate(dump: CacheDump | null | undefined): void {
    if (!dump) return;
    if (dump.stations?.length && !this.stations.length) this.stations = dump.stations;
    const now = this.clock();
    for (const { k, v, at } of dump.offers ?? []) {
      if (now - at <= this.ttlMs) this.offers.set(k, { value: v, at });
    }
    for (const { k, v, at } of dump.seatMaps ?? []) {
      if (now - at <= this.ttlMs) this.seatMaps.set(k, { value: v, at });
    }
  }
}

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { parseAvailableSeats, parseRouteWiseStations, parseSearchTrips } from './parse';

const load = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`../../fixtures/${name}`, import.meta.url), 'utf8'));

describe('parseRouteWiseStations (real capture)', () => {
  const stations = parseRouteWiseStations(load('route-wise-stations.json'));

  it('returns the full 9-station line in travel order', () => {
    expect(stations).toHaveLength(9);
    expect(stations[0]).toMatchObject({ seq: 1, code: 'MJS' });
    expect(stations[0].name).toContain('Ebute Metta');
    expect(stations[5]).toMatchObject({ seq: 6, code: 'PWS' }); // Abeokuta
    expect(stations[8]).toMatchObject({ seq: 9, code: 'OA' }); // Moniya
  });
});

describe('parseSearchTrips (real capture)', () => {
  const trips = parseSearchTrips(load('search-trips.mjs-oa.json'));

  it('parses both daily trips for MJS -> OA (seq 1 -> 9)', () => {
    expect(trips).toHaveLength(2);
    for (const t of trips) {
      expect(t.fromSeq).toBe(1);
      expect(t.toSeq).toBe(9);
    }
  });

  it('reads per-class availability and fares from real data', () => {
    const evening = trips.find((t) => t.vehicleCode === 'LI3')!;
    expect(evening.departureTime).toBe('16:00'); // used to label morning/afternoon/evening
    expect(evening.classes.find((c) => c.className === 'Standard')!).toMatchObject({
      availableSeats: 305,
      fareAdult: 3600,
      fareChild: 3000,
    });
    expect(evening.classes.find((c) => c.className === 'Business')!.availableSeats).toBe(71);
    expect(evening.classes.find((c) => c.className === 'First')!.availableSeats).toBe(3);

    const morning = trips.find((t) => t.vehicleCode === 'LI1')!;
    expect(morning.classes.find((c) => c.className === 'Standard')!.availableSeats).toBe(169);
    expect(morning.classes.find((c) => c.className === 'Business')!.availableSeats).toBe(0);
    expect(morning.classes.find((c) => c.className === 'First')!.availableSeats).toBe(0);
  });
});

describe('parseAvailableSeats (real capture)', () => {
  const coaches = parseAvailableSeats(load('seats.business.evening.json'));

  it('parses coaches and per-seat booked status', () => {
    expect(coaches).toHaveLength(2);
    expect(coaches[0]).toMatchObject({ coachName: 'C02', coachNumber: 'C02', availableSeatsCount: 14 });
    expect(coaches[1]).toMatchObject({ coachName: 'C03', coachNumber: 'C03A', availableSeatsCount: 57 });
    expect(coaches[0].seats.find((s) => s.seatNumber === '1')!.booked).toBe(true);
    expect(coaches[0].seats.find((s) => s.seatNumber === '23')!.booked).toBe(false);
  });
});

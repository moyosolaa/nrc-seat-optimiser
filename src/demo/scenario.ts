// Synthetic data for the browser demo: three daily trips, each in a different state, so the
// per-trip UI can be exercised. Real sub-segment fares aren't captured yet (see README).

import { InMemoryProvider } from '../api/provider';
import { parseRouteWiseStations } from '../api/parse';
import { tripLabel } from '../shared/labels';
import type { ClassAvailability, ClassName, CoachSeats, Seat, Station } from '../shared/types';
import stationsEnvelope from '../../fixtures/route-wise-stations.json';

export const STATIONS: Station[] = parseRouteWiseStations(stationsEnvelope);

const HOP = [0, 1200, 900, 1500, 1100, 1000, 1300, 800, 1400];
const SURCHARGE = 300;
const MULTIPLIER: Record<ClassName, number> = { Standard: 1, Business: 1.8, First: 2.6 };
const BASE_SEATS: Record<ClassName, number> = { Standard: 40, Business: 15, First: 4 };

// 'available' → direct has seats (dormant). 'splits' → direct sold out, sub-segments open.
// 'blocked'  → direct sold out and the seq 4→5 (PYO→ORK) leg is full, so no split exists.
interface DemoTrip {
  tripId: string;
  vehicleCode: string;
  departureTime: string;
  mode: 'available' | 'splits' | 'blocked';
}
const TRIPS: DemoTrip[] = [
  { tripId: 'DEMO-1', vehicleCode: 'LI1', departureTime: '08:00', mode: 'available' },
  { tripId: 'DEMO-2', vehicleCode: 'LI2', departureTime: '13:00', mode: 'splits' },
  { tripId: 'DEMO-3', vehicleCode: 'LI3', departureTime: '16:00', mode: 'blocked' },
];

const seatKey = (a: number, b: number) => `${a}-${b}`;

function makeCoach(a: number, b: number, className: ClassName): CoachSeats[] {
  const seats: Seat[] = [];
  for (let n = 1; n <= 12; n++) {
    seats.push({
      seatNumber: String(n),
      row: Math.ceil(n / 2),
      column: ((n - 1) % 2) + 1,
      booked: (n + a + b) % 3 !== 0,
    });
  }
  if (seats.every((s) => s.booked)) seats[0].booked = false;
  const coachName = ({ Standard: 'C03', Business: 'C02', First: 'C01' } as const)[className];
  return [
    {
      coachId: `${className}-${a}-${b}`,
      coachName,
      coachNumber: coachName,
      availableSeatsCount: seats.filter((s) => !s.booked).length,
      seats,
    },
  ];
}

export interface ScenarioTrip {
  tripId: string;
  vehicleCode: string;
  departureTime: string;
  label: string;
}

export function buildScenario(opts: { fromSeq: number; toSeq: number }): {
  provider: InMemoryProvider;
  trips: ScenarioTrip[];
} {
  const provider = new InMemoryProvider(STATIONS);
  const directKey = seatKey(opts.fromSeq, opts.toSeq);

  for (const t of TRIPS) {
    for (let a = 1; a <= STATIONS.length; a++) {
      for (let b = a + 1; b <= STATIONS.length; b++) {
        let standardFare = SURCHARGE;
        for (let k = a; k < b; k++) standardFare += HOP[k];
        const isDirect = seatKey(a, b) === directKey;
        const spansBlockedHop = a <= 4 && b >= 5; // crosses the seq 4→5 leg

        const classes: ClassAvailability[] = (['Standard', 'Business', 'First'] as ClassName[]).map(
          (className) => {
            let seats = BASE_SEATS[className];
            if (t.mode !== 'available' && isDirect) seats = 0; // direct sold out
            if (t.mode === 'blocked' && spansBlockedHop) seats = 0; // full leg → no through-ticket
            return {
              coachTypeId: `${className}-coach`,
              className,
              availableSeats: seats,
              fareAdult: Math.round(standardFare * MULTIPLIER[className]),
              fareChild: Math.round(standardFare * MULTIPLIER[className] * 0.85),
            };
          },
        );
        provider.addOffer({ tripId: t.tripId, fromSeq: a, toSeq: b, classes });
        for (const className of ['Standard', 'Business', 'First'] as ClassName[]) {
          provider.addSeatMap(t.tripId, a, b, `${className}-coach`, makeCoach(a, b, className));
        }
      }
    }
  }

  return {
    provider,
    trips: TRIPS.map((t) => ({
      tripId: t.tripId,
      vehicleCode: t.vehicleCode,
      departureTime: t.departureTime,
      label: tripLabel(t.departureTime, t.vehicleCode),
    })),
  };
}

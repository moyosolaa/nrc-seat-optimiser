import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { InMemoryProvider } from '../api/provider';
import { parseRouteWiseStations, parseSearchTrips } from '../api/parse';
import { explain, optimise } from './optimiser';
import type { ClassAvailability, SegmentOffer, Station } from '../shared/types';

const load = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`../../fixtures/${name}`, import.meta.url), 'utf8'));

const std = (avail: number, fareAdult: number, fareChild = fareAdult): ClassAvailability => ({
  coachTypeId: 'std',
  className: 'Standard',
  availableSeats: avail,
  fareAdult,
  fareChild,
});

// Stations A..E (seq 1..5). Direct A->D is sold out; every sub-segment has a seat.
function provider5(): InMemoryProvider {
  const stations: Station[] = ['A', 'B', 'C', 'D', 'E'].map((code, i) => ({
    id: code,
    code,
    name: code,
    seq: i + 1,
  }));
  const p = new InMemoryProvider(stations);
  const off = (a: number, b: number, classes: ClassAvailability[]): SegmentOffer => ({
    tripId: 'T1',
    fromSeq: a,
    toSeq: b,
    classes,
  });
  p.addOffer(off(1, 4, [std(0, 2500)])); // A->D direct: SOLD OUT
  p.addOffer(off(1, 2, [std(10, 1000)])); // A->B
  p.addOffer(off(2, 3, [std(10, 1000)])); // B->C
  p.addOffer(off(3, 4, [std(10, 1000)])); // C->D
  p.addOffer(off(1, 3, [std(10, 1800)])); // A->C
  p.addOffer(off(2, 4, [std(10, 1800)])); // B->D
  return p;
}

describe('optimise — direct sold out, A -> D', () => {
  const result = optimise(provider5(), { tripId: 'T1', fromSeq: 1, toSeq: 4 });

  it('fires for a 4-station journey with no direct seat', () => {
    expect(result.applicable).toBe(true);
    expect(result.directAvailable).toBe(false);
    expect(result.fired).toBe(true);
    expect(result.status).toBe('splits-found');
  });

  it('finds every feasible combination, cheapest first', () => {
    const summary = result.combinations.map((c) => ({
      route: c.legs.map((l) => `${l.fromCode}->${l.toCode}`).join(' + '),
      tickets: c.ticketCount,
      switches: c.seatSwitches,
      price: c.totalPrice,
    }));
    expect(summary).toEqual([
      { route: 'A->B + B->D', tickets: 2, switches: 1, price: 2800 },
      { route: 'A->C + C->D', tickets: 2, switches: 1, price: 2800 },
      { route: 'A->B + B->C + C->D', tickets: 3, switches: 2, price: 3000 },
    ]);
  });

  it('respects the per-identity ticket cap', () => {
    const capped = optimise(provider5(), { tripId: 'T1', fromSeq: 1, toSeq: 4, maxTickets: 2 });
    expect(capped.combinations).toHaveLength(2);
    expect(capped.combinations.every((c) => c.ticketCount <= 2)).toBe(true);
  });
});

describe('optimise — guards', () => {
  it('does not engage for adjacent stations (2-station journey)', () => {
    const r = optimise(provider5(), { tripId: 'T1', fromSeq: 1, toSeq: 2 });
    expect(r.applicable).toBe(false);
    expect(r.fired).toBe(false);
    expect(r.status).toBe('not-applicable');
    expect(r.combinations).toEqual([]);
  });

  it('stays dormant when the selected route still has a seat', () => {
    const p = provider5();
    p.addOffer({ tripId: 'T1', fromSeq: 1, toSeq: 4, classes: [std(5, 2500)] }); // direct now available
    const r = optimise(p, { tripId: 'T1', fromSeq: 1, toSeq: 4 });
    expect(r.directAvailable).toBe(true);
    expect(r.fired).toBe(false);
    expect(r.status).toBe('direct-available');
    expect(r.combinations).toEqual([]);
  });

  it('picks the cheapest available class on each leg', () => {
    const stations: Station[] = ['A', 'B', 'C'].map((code, i) => ({
      id: code,
      code,
      name: code,
      seq: i + 1,
    }));
    const p = new InMemoryProvider(stations);
    p.addOffer({ tripId: 'T1', fromSeq: 1, toSeq: 3, classes: [std(0, 5000)] }); // direct gone
    p.addOffer({
      tripId: 'T1',
      fromSeq: 1,
      toSeq: 2,
      classes: [
        { coachTypeId: 'b', className: 'Business', availableSeats: 5, fareAdult: 2000, fareChild: 2000 },
        std(5, 1200),
      ],
    });
    p.addOffer({ tripId: 'T1', fromSeq: 2, toSeq: 3, classes: [std(5, 1200)] });

    const r = optimise(p, { tripId: 'T1', fromSeq: 1, toSeq: 3 });
    expect(r.combinations[0].totalPrice).toBe(2400);
    expect(r.combinations[0].legs[0].className).toBe('Standard'); // cheaper than Business
  });

  it('flags a mixed-class combination', () => {
    const stations: Station[] = ['A', 'B', 'C'].map((code, i) => ({
      id: code,
      code,
      name: code,
      seq: i + 1,
    }));
    const p = new InMemoryProvider(stations);
    p.addOffer({ tripId: 'T1', fromSeq: 1, toSeq: 3, classes: [std(0, 5000)] }); // direct sold out
    p.addOffer({ tripId: 'T1', fromSeq: 1, toSeq: 2, classes: [std(5, 1000)] }); // A->B Standard only
    p.addOffer({
      tripId: 'T1',
      fromSeq: 2,
      toSeq: 3,
      classes: [
        { coachTypeId: 'b', className: 'Business', availableSeats: 5, fareAdult: 1500, fareChild: 1500 },
      ],
    }); // B->C Business only

    const r = optimise(p, { tripId: 'T1', fromSeq: 1, toSeq: 3 });
    expect(r.fired).toBe(true);
    expect(r.combinations[0].mixedClass).toBe(true);
    expect(r.combinations[0].legs.map((l) => l.className)).toEqual(['Standard', 'Business']);
  });
});

describe('optimise — ordering (fewest tickets first) and no default cap', () => {
  const stations4: Station[] = ['A', 'B', 'C', 'D'].map((code, i) => ({
    id: code,
    code,
    name: code,
    seq: i + 1,
  }));

  it('ranks fewer-ticket options ahead of a cheaper many-ticket one', () => {
    const p = new InMemoryProvider(stations4);
    const off = (a: number, b: number, fare: number, avail = 5) =>
      p.addOffer({ tripId: 'T1', fromSeq: a, toSeq: b, classes: [std(avail, fare)] });
    off(1, 4, 9999, 0); // A->D direct: sold out
    off(1, 3, 2500); // A->C
    off(3, 4, 100); //  C->D  → A->C + C->D = 2600 (2 tickets)
    off(1, 2, 100); //  A->B
    off(2, 4, 3000); // B->D  → A->B + B->D = 3100 (2 tickets)
    off(2, 3, 100); //  B->C  → A->B + B->C + C->D = 300 (3 tickets, cheapest overall)

    const r = optimise(p, { tripId: 'T1', fromSeq: 1, toSeq: 4 });
    expect(r.combinations.map((c) => c.ticketCount)).toEqual([2, 2, 3]);
    expect(r.combinations[0]).toMatchObject({ ticketCount: 2, totalPrice: 2600 }); // cheapest 2-ticket first
    expect(r.combinations[2]).toMatchObject({ ticketCount: 3, totalPrice: 300 }); // cheapest overall, ranked last
  });

  it('has no default ticket cap (an 8-ticket all-stops split survives)', () => {
    const stations9: Station[] = Array.from({ length: 9 }, (_, i) => ({
      id: `S${i + 1}`,
      code: `S${i + 1}`,
      name: `S${i + 1}`,
      seq: i + 1,
    }));
    const p = new InMemoryProvider(stations9);
    // Only adjacent hops have seats, so the only way through is all 8 hops.
    for (let a = 1; a <= 9; a++) {
      for (let b = a + 1; b <= 9; b++) {
        p.addOffer({ tripId: 'T1', fromSeq: a, toSeq: b, classes: [std(b - a === 1 ? 5 : 0, 1000 * (b - a))] });
      }
    }
    const r = optimise(p, { tripId: 'T1', fromSeq: 1, toSeq: 9 });
    expect(r.fired).toBe(true);
    expect(r.combinations).toHaveLength(1);
    expect(r.combinations[0].ticketCount).toBe(8); // would have been excluded by the old cap of 4
  });
});

describe('optimise — tiebreak by seat changes before price', () => {
  const stations: Station[] = ['A', 'B', 'C', 'D'].map((code, i) => ({
    id: code,
    code,
    name: code,
    seq: i + 1,
  }));
  const coach = (name: string, free: string[]) => [
    {
      coachId: name,
      coachName: name,
      coachNumber: name,
      availableSeatsCount: free.length,
      seats: Array.from({ length: 10 }, (_, i) => {
        const sn = String(i + 1);
        return { seatNumber: sn, row: 1, column: 1, booked: !free.includes(sn) };
      }),
    },
  ];

  it('prefers the same-ticket-count option with fewer seat changes', () => {
    const p = new InMemoryProvider(stations);
    p.addOffer({ tripId: 'T1', fromSeq: 1, toSeq: 4, classes: [std(0, 9999)] }); // direct sold out
    // two 2-ticket paths, equal total price (2000), no 3-ticket path (B→C not offered)
    p.addOffer({ tripId: 'T1', fromSeq: 1, toSeq: 2, classes: [std(5, 1000)] });
    p.addOffer({ tripId: 'T1', fromSeq: 2, toSeq: 4, classes: [std(5, 1000)] });
    p.addOffer({ tripId: 'T1', fromSeq: 1, toSeq: 3, classes: [std(5, 1000)] });
    p.addOffer({ tripId: 'T1', fromSeq: 3, toSeq: 4, classes: [std(5, 1000)] });
    // A→B + B→D keeps seat 5 the whole way (0 changes); A→C + C→D must move (1 change)
    p.addSeatMap('T1', 1, 2, 'std', coach('X', ['5']));
    p.addSeatMap('T1', 2, 4, 'std', coach('X', ['5']));
    p.addSeatMap('T1', 1, 3, 'std', coach('X', ['5']));
    p.addSeatMap('T1', 3, 4, 'std', coach('X', ['9']));

    const r = optimise(p, { tripId: 'T1', fromSeq: 1, toSeq: 4 });
    expect(r.combinations).toHaveLength(2);
    expect(r.combinations[0].legs.map((l) => `${l.fromCode}->${l.toCode}`)).toEqual(['A->B', 'B->D']);
    expect(r.combinations[0].seatSwitches).toBe(0);
    expect(r.combinations[1].seatSwitches).toBe(1);
  });
});

describe('explain — decision trace', () => {
  const stations: Station[] = ['A', 'B', 'C', 'D'].map((code, i) => ({
    id: code,
    code,
    name: code,
    seq: i + 1,
  }));

  it('flags missing in-between segments when sold out with no sub-segment data', () => {
    const p = new InMemoryProvider(stations);
    p.addOffer({ tripId: 'T1', fromSeq: 1, toSeq: 4, classes: [std(0, 9999)] }); // direct sold out only
    const e = explain(p, { tripId: 'T1', fromSeq: 1, toSeq: 4 });
    expect(e.status).toBe('no-options');
    expect(e.adjacentHops.map((h) => h.present)).toEqual([false, false, false]);
    expect(e.missingHops).toBe(3);
    expect(e.reason).toContain('not captured yet');
  });

  it('names the bottleneck leg when a fully-captured route is blocked', () => {
    const p = new InMemoryProvider(stations);
    const sold = (a: number, b: number) => p.addOffer({ tripId: 'T1', fromSeq: a, toSeq: b, classes: [std(0, 100)] });
    const open = (a: number, b: number) => p.addOffer({ tripId: 'T1', fromSeq: a, toSeq: b, classes: [std(5, 100)] });
    open(1, 2); // A→B has seats
    sold(2, 3); // B→C full  ← bottleneck
    open(3, 4); // C→D has seats
    sold(1, 3); // every through-ticket spanning B→C is also full
    sold(2, 4);
    sold(1, 4); // direct

    const e = explain(p, { tripId: 'T1', fromSeq: 1, toSeq: 4 });
    expect(e.status).toBe('no-options');
    expect(e.missingHops).toBe(0); // everything captured — not a "fetch more" case
    expect(e.blockers).toEqual(['B→C']);
    expect(e.reason).toContain('full');
  });

  it('explains the dormant case when a direct seat exists', () => {
    const p = new InMemoryProvider(stations);
    p.addOffer({ tripId: 'T1', fromSeq: 1, toSeq: 4, classes: [std(5, 1000)] });
    const e = explain(p, { tripId: 'T1', fromSeq: 1, toSeq: 4 });
    expect(e.status).toBe('direct-available');
    expect(e.reason).toContain('dormant');
  });
});

describe('optimise — reverse direction (Ibadan→Lagos, high seq → low seq)', () => {
  const stations: Station[] = ['A', 'B', 'C', 'D'].map((code, i) => ({
    id: code,
    code,
    name: code,
    seq: i + 1,
  }));

  it('lists legs in travel order when the journey runs D→A', () => {
    const p = new InMemoryProvider(stations);
    p.addOffer({ tripId: 'T1', fromSeq: 4, toSeq: 1, classes: [std(0, 9999)] }); // direct sold out
    p.addOffer({ tripId: 'T1', fromSeq: 4, toSeq: 3, classes: [std(5, 100)] });
    p.addOffer({ tripId: 'T1', fromSeq: 3, toSeq: 2, classes: [std(5, 100)] });
    p.addOffer({ tripId: 'T1', fromSeq: 2, toSeq: 1, classes: [std(5, 100)] });

    const r = optimise(p, { tripId: 'T1', fromSeq: 4, toSeq: 1 });
    expect(r.fired).toBe(true);
    expect(r.combinations[0].legs.map((l) => `${l.fromCode}->${l.toCode}`)).toEqual([
      'D->C',
      'C->B',
      'B->A',
    ]);
  });

  it('stays dormant on a reverse route that still has a direct seat', () => {
    const p = new InMemoryProvider(stations);
    p.addOffer({ tripId: 'T1', fromSeq: 4, toSeq: 1, classes: [std(5, 2000)] });
    const r = optimise(p, { tripId: 'T1', fromSeq: 4, toSeq: 1 });
    expect(r.fired).toBe(false);
    expect(r.status).toBe('direct-available');
  });
});

describe('optimise — recommends coach + seat per leg, with seat continuity', () => {
  const stations: Station[] = ['A', 'B', 'C', 'D'].map((code, i) => ({
    id: code,
    code,
    name: code,
    seq: i + 1,
  }));
  const coach = (name: string, free: string[]) => [
    {
      coachId: name,
      coachName: name,
      coachNumber: name,
      availableSeatsCount: free.length,
      seats: Array.from({ length: 10 }, (_, i) => {
        const sn = String(i + 1);
        return { seatNumber: sn, row: 1, column: 1, booked: !free.includes(sn) };
      }),
    },
  ];
  const adjacentOnly = () => {
    const p = new InMemoryProvider(stations);
    p.addOffer({ tripId: 'T1', fromSeq: 1, toSeq: 4, classes: [std(0, 9999)] }); // direct sold out
    p.addOffer({ tripId: 'T1', fromSeq: 1, toSeq: 2, classes: [std(5, 100)] });
    p.addOffer({ tripId: 'T1', fromSeq: 2, toSeq: 3, classes: [std(5, 100)] });
    p.addOffer({ tripId: 'T1', fromSeq: 3, toSeq: 4, classes: [std(5, 100)] });
    return p;
  };

  it('keeps the same seat when free and only moves when it must', () => {
    const p = adjacentOnly();
    p.addSeatMap('T1', 1, 2, 'std', coach('CA', ['5', '6']));
    p.addSeatMap('T1', 2, 3, 'std', coach('CA', ['5', '8'])); // seat 5 still free → keep it
    p.addSeatMap('T1', 3, 4, 'std', coach('CA', ['9'])); //      seat 5 gone → move to 9

    const c = optimise(p, { tripId: 'T1', fromSeq: 1, toSeq: 4 }).combinations[0];
    expect(c.legs.map((l) => l.coachName)).toEqual(['CA', 'CA', 'CA']);
    expect(c.legs.map((l) => l.seatNumber)).toEqual(['5', '5', '9']);
    expect(c.seatSwitches).toBe(1); // kept seat 5 across B, moved once at C — not two moves
  });

  it('falls back to a move per boundary when no seat map is captured', () => {
    const c = optimise(adjacentOnly(), { tripId: 'T1', fromSeq: 1, toSeq: 4 }).combinations[0];
    expect(c.legs[0].seatNumber).toBeUndefined();
    expect(c.seatSwitches).toBe(2); // 3 tickets, no seat data → assume a move at each boundary
  });
});

describe('optimise — the dormant gate, on real captured data', () => {
  const stations = parseRouteWiseStations(load('route-wise-stations.json'));
  const trips = parseSearchTrips(load('search-trips.mjs-oa.json'));
  const evening = trips.find((t) => t.vehicleCode === 'LI3')!;
  const morning = trips.find((t) => t.vehicleCode === 'LI1')!;

  it('does NOT fire when the selected route has Standard seats (evening, 305 free)', () => {
    const p = new InMemoryProvider(stations);
    p.addTrip(evening);
    const r = optimise(p, { tripId: evening.tripId, fromSeq: 1, toSeq: 9, classPolicy: 'Standard' });
    expect(r.directAvailable).toBe(true);
    expect(r.fired).toBe(false);
    expect(r.status).toBe('direct-available');
    expect(r.combinations).toEqual([]);
  });

  it('fires when the selected class is sold out on the direct route (morning Business = 0)', () => {
    const p = new InMemoryProvider(stations);
    p.addTrip(morning);
    const r = optimise(p, { tripId: morning.tripId, fromSeq: 1, toSeq: 9, classPolicy: 'Business' });
    expect(r.directAvailable).toBe(false);
    expect(r.fired).toBe(true);
    expect(r.status).toBe('no-options'); // no sub-segment fares seeded to split into yet
  });
});

describe('demo — splits across the real 9-station line, direct sold out', () => {
  const stations = parseRouteWiseStations(load('route-wise-stations.json'));
  // Synthetic but structured fares: per-hop price + a per-ticket booking surcharge, so
  // fewer tickets is cheaper. (Real sub-segment fares await a capture; see README.)
  const hop = [0, 1200, 900, 1500, 1100, 1000, 1300, 800, 1400]; // hop[k] = seq k -> k+1
  const SURCHARGE = 300;
  const soldOut = new Set(['1-9', '1-6', '4-9']); // through-ticket + two long segments gone
  const p = new InMemoryProvider(stations);
  for (let a = 1; a <= 9; a++) {
    for (let b = a + 1; b <= 9; b++) {
      let fare = SURCHARGE;
      for (let k = a; k < b; k++) fare += hop[k];
      p.addOffer({
        tripId: 'LI3',
        fromSeq: a,
        toSeq: b,
        classes: [std(soldOut.has(`${a}-${b}`) ? 0 : 40, fare)],
      });
    }
  }

  const r = optimise(p, { tripId: 'LI3', fromSeq: 1, toSeq: 9 });

  it('covers Ebute Metta -> Moniya with contiguous legs and prints the options', () => {
    expect(r.directAvailable).toBe(false);
    expect(r.fired).toBe(true);
    expect(r.status).toBe('splits-found');
    expect(r.combinations.length).toBeGreaterThan(0);

    const best = r.combinations[0];
    expect(best.legs[0].fromSeq).toBe(1);
    expect(best.legs.at(-1)!.toSeq).toBe(9);
    for (let i = 1; i < best.legs.length; i++) {
      expect(best.legs[i].fromSeq).toBe(best.legs[i - 1].toSeq);
    }

    const table = r.combinations
      .slice(0, 5)
      .map(
        (c, i) =>
          `  ${i + 1}. ${c.legs.map((l) => `${l.fromCode}->${l.toCode}`).join('  +  ')}` +
          `   |  ${c.ticketCount} tickets, ${c.seatSwitches} switch(es)  |  NGN ${c.totalPrice.toLocaleString()}`,
      )
      .join('\n');
    // eslint-disable-next-line no-console
    console.log(
      `\nEbute Metta (MJS) -> Moniya (OA) — through-ticket sold out, ${r.combinations.length} feasible combinations:\n${table}\n`,
    );
  });
});

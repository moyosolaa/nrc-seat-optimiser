import { describe, it, expect } from 'vitest';
import { InMemoryProvider } from './provider';
import type { SegmentOffer, Station } from '../shared/types';

const stations: Station[] = ['A', 'B'].map((c, i) => ({ id: c, code: c, name: c, seq: i + 1 }));
const offer = (avail: number): SegmentOffer => ({
  tripId: 'T1',
  fromSeq: 1,
  toSeq: 2,
  classes: [{ coachTypeId: 'std', className: 'Standard', availableSeats: avail, fareAdult: 100, fareChild: 100 }],
});

describe('InMemoryProvider — TTL cache', () => {
  it('reuses a segment within the window and expires it after', () => {
    let now = 1000;
    const p = new InMemoryProvider(stations, { ttlMs: 60_000, clock: () => now });
    p.addOffer(offer(5));
    expect(p.getSegment('T1', 1, 2)).not.toBeNull(); // just fetched
    now += 59_000;
    expect(p.getSegment('T1', 1, 2)).not.toBeNull(); // still inside the window → reuse
    now += 2_000;
    expect(p.getSegment('T1', 1, 2)).toBeNull(); // past TTL → stale, forces a re-fetch
  });

  it('hydrate keeps fresh entries and drops already-stale ones', () => {
    let now = 1_000_000;
    const p = new InMemoryProvider(stations, { ttlMs: 60_000, clock: () => now });
    p.hydrate({
      stations,
      offers: [
        { k: 'T1:1-2', v: offer(5), at: now - 10_000 }, // 10s old → kept
        { k: 'T1:1-3', v: { ...offer(5), toSeq: 3 }, at: now - 120_000 }, // 2m old → dropped
      ],
      seatMaps: [],
    });
    expect(p.getSegment('T1', 1, 2)).not.toBeNull();
    expect(p.getSegment('T1', 1, 3)).toBeNull();
  });
});

import { describe, it, expect } from 'vitest';
import { InMemoryProvider } from '../api/provider';
import { optimise } from '../optimiser/optimiser';
import { formatDepartureTweet, formatJourneyTweet, townOf } from './tweetFormat';
import type { ClassAvailability, Station } from '../shared/types';
import type { TripView } from '../ui/ResultsPanel';

const stations: Station[] = ['A', 'B', 'C'].map((c, i) => ({ id: c, code: c, name: c, seq: i + 1 }));
const std = (avail: number, fare: number): ClassAvailability => ({
  coachTypeId: 'std',
  className: 'Standard',
  availableSeats: avail,
  fareAdult: fare,
  fareChild: fare,
});
const tripView = (provider: InMemoryProvider): TripView => ({
  label: 'Morning · 08:00 · LI1',
  result: optimise(provider, { tripId: 'T1', fromSeq: 1, toSeq: 3 }),
});

describe('formatJourneyTweet', () => {
  it('posts a split (≤280 chars) when the route is sold out', () => {
    const p = new InMemoryProvider(stations);
    p.addOffer({ tripId: 'T1', fromSeq: 1, toSeq: 3, classes: [std(0, 5000)] }); // direct sold out
    p.addOffer({ tripId: 'T1', fromSeq: 1, toSeq: 2, classes: [std(5, 1200)] });
    p.addOffer({ tripId: 'T1', fromSeq: 2, toSeq: 3, classes: [std(5, 1300)] });

    const tweet = formatJourneyTweet('A', 'C', [tripView(p)]);
    expect(tweet).toContain('SOLD OUT');
    expect(tweet).toContain('A→B→C');
    expect(tweet).toContain('₦2,500');
    expect(tweet.length).toBeLessThanOrEqual(280);
  });

  it('posts nothing when seats are available', () => {
    const p = new InMemoryProvider(stations);
    p.addOffer({ tripId: 'T1', fromSeq: 1, toSeq: 3, classes: [std(5, 5000)] }); // direct available
    expect(formatJourneyTweet('A', 'C', [tripView(p)])).toBe('');
  });

  it('townOf extracts the town from a station name', () => {
    expect(townOf('Mobolaji Johnson Station Ebute Metta')).toBe('Ebute Metta');
    expect(townOf('Professor Wole Soyinka Station Abeokuta')).toBe('Abeokuta');
    expect(townOf('Aremo Olusegun Osoba Olodo')).toBe('Olodo'); // no "Station" → last word
  });

  it('formatDepartureTweet posts one train near departure (≤280)', () => {
    const named: Station[] = [
      { id: 'A', code: 'A', name: 'Alpha Station Lagos', seq: 1 },
      { id: 'B', code: 'B', name: 'Beta Station Middle', seq: 2 },
      { id: 'C', code: 'C', name: 'Gamma Station Ibadan', seq: 3 },
    ];
    const p = new InMemoryProvider(named);
    p.addOffer({ tripId: 'T1', fromSeq: 1, toSeq: 3, classes: [std(0, 5000)] });
    p.addOffer({ tripId: 'T1', fromSeq: 1, toSeq: 2, classes: [std(5, 1200)] });
    p.addOffer({ tripId: 'T1', fromSeq: 2, toSeq: 3, classes: [std(5, 1300)] });
    const trip = { label: 'Evening · 16:00 · LI3', result: optimise(p, { tripId: 'T1', fromSeq: 1, toSeq: 3 }) };

    const tweet = formatDepartureTweet('A', 'C', trip, 30, named);
    expect(tweet).toContain('Lagos → Ibadan');
    expect(tweet).toContain('departs in ~30 min');
    expect(tweet).toContain('Lagos → Middle → Ibadan');
    expect(tweet.length).toBeLessThanOrEqual(280);
  });
});

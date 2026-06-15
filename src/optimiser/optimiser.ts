// Core of this phase: given a journey on one trip, enumerate EVERY valid way to cover it
// with consecutive, purchasable, available segments and rank them by total price.
//
// Key facts baked in (see README):
//  - It's one physical train: all legs share the same tripId; the passenger switches
//    seats, never trains. So a leg just needs *a* free seat (count > 0), not a specific one.
//  - The journey is any user-chosen origin->destination spanning >= 3 stations.
//  - At most `maxTickets` legs (NRC's per-identity cap).
//
// The line is short (<= 8 hops), so we exhaustively enumerate the 2^(intermediates)
// partitions — no clever search needed, and we return all of them, not just the best.

import { CONFIG } from '../shared/config';
import type { AvailabilityProvider } from '../api/provider';
import type {
  ClassAvailability,
  ClassName,
  CoachSeats,
  Combination,
  ItineraryLeg,
  SegmentOffer,
} from '../shared/types';

export type ClassPolicy = ClassName | 'cheapest';
export type PassengerType = 'adult' | 'child';

export interface OptimiseInput {
  tripId: string;
  fromSeq: number;
  toSeq: number;
  /**
   * 'cheapest' (default) works across ALL classes/coaches and picks the lowest-fare
   * available seat on each leg. Pass a specific class only to restrict to it.
   */
  classPolicy?: ClassPolicy;
  passengerType?: PassengerType;
  /** Cap on tickets per combination. Default: no limit. */
  maxTickets?: number;
}

export type OptimiseStatus =
  | 'not-applicable' // journey spans < minStationsForSplit (nothing to split)
  | 'direct-available' // selected route has a seat — tool stays dormant, does NOT fire
  | 'splits-found' // direct sold out; one or more combinations surfaced
  | 'no-options'; // direct sold out and nothing feasible within the ticket cap

export interface OptimiseResult {
  status: OptimiseStatus;
  /** True only when the tool engages: journey is splittable AND the selected route is sold out. */
  fired: boolean;
  /** False when the journey spans < minStationsForSplit (nothing to split). */
  applicable: boolean;
  /** Whether a single through-ticket is available under the class policy. */
  directAvailable: boolean;
  /** Feasible split combinations, fewest tickets first (then cheapest). Empty unless fired. */
  combinations: Combination[];
}

interface PickedClass {
  className: ClassName;
  coachTypeId: string;
  fare: number;
  availableSeats: number;
}

function pickClass(
  offer: SegmentOffer | null,
  policy: ClassPolicy,
  pax: PassengerType,
): PickedClass | null {
  if (!offer) return null;
  const fareOf = (c: ClassAvailability) => (pax === 'child' ? c.fareChild : c.fareAdult);
  let cands = offer.classes.filter((c) => c.availableSeats > 0);
  if (policy !== 'cheapest') cands = cands.filter((c) => c.className === policy);
  if (!cands.length) return null;
  const best = [...cands].sort((a, b) => fareOf(a) - fareOf(b))[0];
  return {
    className: best.className,
    coachTypeId: best.coachTypeId,
    fare: fareOf(best),
    availableSeats: best.availableSeats,
  };
}

type SeatPick = { coachName: string; seatNumber: string };

/**
 * Recommend a seat for a leg from its seat map. Prefers to keep the previous leg's exact
 * seat if it's still free (so the passenger only moves when they must); otherwise takes
 * the first available seat. Returns null when no seat map was captured for this leg.
 */
function pickSeat(coaches: CoachSeats[] | null, prefer: SeatPick | null): SeatPick | null {
  if (!coaches || !coaches.length) return null;
  if (prefer) {
    const coach = coaches.find((c) => c.coachName === prefer.coachName);
    const seat = coach?.seats.find((s) => s.seatNumber === prefer.seatNumber && !s.booked);
    if (coach && seat) return { coachName: coach.coachName, seatNumber: seat.seatNumber };
  }
  for (const coach of coaches) {
    const seat = coach.seats.find((s) => !s.booked);
    if (seat) return { coachName: coach.coachName, seatNumber: seat.seatNumber };
  }
  return null;
}

/** Actual seat moves: when every leg has a recommended seat, keeping a seat isn't a move. */
function countSeatSwitches(legs: ItineraryLeg[]): number {
  if (legs.length > 1 && legs.every((l) => l.seatNumber != null)) {
    let switches = 0;
    for (let i = 1; i < legs.length; i++) {
      if (legs[i].coachName !== legs[i - 1].coachName || legs[i].seatNumber !== legs[i - 1].seatNumber) {
        switches++;
      }
    }
    return switches;
  }
  return legs.length - 1; // no seat data → assume a change at each ticket boundary
}

export function optimise(provider: AvailabilityProvider, input: OptimiseInput): OptimiseResult {
  const { tripId, fromSeq, toSeq } = input;
  if (toSeq === fromSeq) {
    throw new Error(`fromSeq and toSeq must differ (got ${fromSeq})`);
  }
  const policy = input.classPolicy ?? 'cheapest';
  const pax = input.passengerType ?? 'adult';
  const maxTickets = input.maxTickets ?? Infinity; // no cap by default (NRC's per-identity limit isn't enforced for now)

  const bySeq = new Map(provider.getStations().map((s) => [s.seq, s]));
  const codeOf = (seq: number) => bySeq.get(seq)?.code ?? String(seq);

  const directAvailable =
    pickClass(provider.getSegment(tripId, fromSeq, toSeq), policy, pax) != null;
  const dir = toSeq > fromSeq ? 1 : -1; // support both travel directions (Lagos→Ibadan and back)
  const applicable = Math.abs(toSeq - fromSeq) >= CONFIG.minStationsForSplit - 1;

  // The gate: stay dormant unless the journey is splittable AND the selected route is
  // sold out. If a seat exists on the direct route, the passenger just books it — we
  // surface nothing.
  if (!applicable) {
    return { status: 'not-applicable', fired: false, applicable: false, directAvailable, combinations: [] };
  }
  if (directAvailable) {
    return {
      status: 'direct-available',
      fired: false,
      applicable: true,
      directAvailable: true,
      combinations: [],
    };
  }

  // Candidate cut points are the intermediate stations; each is in or out of a partition.
  const intermediates: number[] = [];
  for (let s = fromSeq + dir; s !== toSeq; s += dir) intermediates.push(s);
  const n = intermediates.length;

  const combinations: Combination[] = [];
  for (let mask = 0; mask < 1 << n; mask++) {
    const boundaries = [fromSeq];
    for (let k = 0; k < n; k++) if (mask & (1 << k)) boundaries.push(intermediates[k]);
    boundaries.push(toSeq);

    const ticketCount = boundaries.length - 1;
    if (ticketCount > maxTickets) continue;

    const legs: ItineraryLeg[] = [];
    let feasible = true;
    let prevSeat: SeatPick | null = null;
    for (let p = 0; p < ticketCount; p++) {
      const a = boundaries[p];
      const b = boundaries[p + 1];
      const picked = pickClass(provider.getSegment(tripId, a, b), policy, pax);
      if (!picked) {
        feasible = false;
        break;
      }
      const seat = pickSeat(provider.getSeats(tripId, a, b, picked.coachTypeId), prevSeat);
      prevSeat = seat;
      legs.push({
        fromSeq: a,
        toSeq: b,
        fromCode: codeOf(a),
        toCode: codeOf(b),
        className: picked.className,
        coachTypeId: picked.coachTypeId,
        fare: picked.fare,
        availableSeats: picked.availableSeats,
        coachName: seat?.coachName,
        seatNumber: seat?.seatNumber,
      });
    }
    if (!feasible) continue;

    const totalPrice = legs.reduce((sum, l) => sum + l.fare, 0);
    const mixedClass = new Set(legs.map((l) => l.className)).size > 1;
    combinations.push({ legs, ticketCount, seatSwitches: countSeatSwitches(legs), totalPrice, mixedClass });
  }

  // Rank: fewest tickets, then fewest seat changes, then lowest total price.
  combinations.sort(
    (a, b) =>
      a.ticketCount - b.ticketCount || a.seatSwitches - b.seatSwitches || a.totalPrice - b.totalPrice,
  );
  return {
    status: combinations.length ? 'splits-found' : 'no-options',
    fired: true,
    applicable: true,
    directAvailable: false,
    combinations,
  };
}

// --- decision trace (dev staging) ---

export interface SubSegmentStatus {
  fromCode: string;
  toCode: string;
  /** True if we've captured an offer for this hop at all. */
  present: boolean;
  /** Seats available in the chosen class; 0 = captured but sold out; null = no data captured. */
  seats: number | null;
}

export interface OptimiseExplanation {
  fromCode: string;
  toCode: string;
  applicable: boolean;
  directAvailable: boolean;
  status: OptimiseStatus;
  reason: string;
  /** Each in-between hop and whether we have data to split on it. */
  adjacentHops: SubSegmentStatus[];
  missingHops: number;
  /** Legs the train is full on with no captured through-ticket across them — why a sold-out route has no split. */
  blockers: string[];
}

/** Explain why optimise() reached its verdict — for the dev-staging trace panel. */
export function explain(provider: AvailabilityProvider, input: OptimiseInput): OptimiseExplanation {
  const result = optimise(provider, input);
  const { tripId, fromSeq, toSeq } = input;
  const policy = input.classPolicy ?? 'cheapest';
  const pax = input.passengerType ?? 'adult';
  const bySeq = new Map(provider.getStations().map((s) => [s.seq, s]));
  const codeOf = (seq: number) => bySeq.get(seq)?.code ?? String(seq);
  const dir = toSeq > fromSeq ? 1 : toSeq < fromSeq ? -1 : 0;

  const path: number[] = [];
  if (dir !== 0) for (let s = fromSeq; ; s += dir) {
    path.push(s);
    if (s === toSeq) break;
  }
  const seatsOn = (a: number, b: number): number | null => {
    const picked = pickClass(provider.getSegment(tripId, a, b), policy, pax);
    return picked ? picked.availableSeats : null;
  };

  const adjacentHops: SubSegmentStatus[] = [];
  for (let h = 0; h < path.length - 1; h++) {
    const offer = provider.getSegment(tripId, path[h], path[h + 1]);
    const seats = seatsOn(path[h], path[h + 1]);
    adjacentHops.push({
      fromCode: codeOf(path[h]),
      toCode: codeOf(path[h + 1]),
      present: offer != null,
      seats: seats != null ? seats : offer ? 0 : null,
    });
  }
  const missingHops = adjacentHops.filter((h) => !h.present).length;

  // A "blocker" is a leg the train is full on AND no captured ticket spans it with a seat —
  // i.e. no combination can ever cross it. This is the usual reason a sold-out route has no split.
  const blockers: string[] = [];
  for (let h = 0; h < path.length - 1; h++) {
    if (seatsOn(path[h], path[h + 1])) continue;
    let crossable = false;
    for (let a = 0; a <= h && !crossable; a++) {
      for (let b = h + 1; b < path.length && !crossable; b++) {
        if (seatsOn(path[a], path[b])) crossable = true;
      }
    }
    if (!crossable) blockers.push(`${codeOf(path[h])}→${codeOf(path[h + 1])}`);
  }

  let reason: string;
  if (result.status === 'not-applicable') {
    reason = 'Origin and destination are adjacent or identical — nothing to split.';
  } else if (result.status === 'direct-available') {
    reason = 'A direct seat is available on this route, so the optimiser stays dormant.';
  } else if (result.status === 'splits-found') {
    reason = `Direct sold out — found ${result.combinations.length} split combination(s).`;
  } else if (missingHops > 0) {
    reason = `Direct sold out — ${missingHops} of ${adjacentHops.length} in-between segments not captured yet; fetch them to look for a split.`;
  } else if (blockers.length > 0) {
    const legs = blockers.join(' & ');
    reason = `No split possible — the ${legs} leg${blockers.length > 1 ? 's are' : ' is'} full and no captured through-ticket crosses ${blockers.length > 1 ? 'them' : 'it'}.`;
  } else {
    reason = 'Direct sold out, and no captured combination tiles the journey.';
  }

  return {
    fromCode: codeOf(fromSeq),
    toCode: codeOf(toSeq),
    applicable: result.applicable,
    directAvailable: result.directAvailable,
    status: result.status,
    reason,
    adjacentHops,
    missingHops,
    blockers,
  };
}

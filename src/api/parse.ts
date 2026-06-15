// Normalise raw GSDS responses into the domain model. Validated against real captures
// in fixtures/ (see parse.test.ts).

import { parseEnvelope } from './envelope';
import type { ClassAvailability, ClassName, CoachSeats, Station, Trip } from '../shared/types';

export function normalizeClassName(coachTypeName: string): ClassName {
  const n = coachTypeName.toLowerCase();
  if (n.includes('first')) return 'First';
  if (n.includes('business')) return 'Business';
  return 'Standard';
}

interface RawStation {
  id: string;
  name: string;
  code: string;
}
interface RawRouteResult {
  routeId: string;
  routeName: string;
  stations: { fromStation: RawStation[]; toStation: RawStation[] };
}

/**
 * route-wise-stations returns stations WITHOUT a sequence number — but listed in route
 * order. We assign seq by 1-based array position; search-trips (which does carry
 * `sequence`) can confirm or override it later.
 */
export function parseRouteWiseStations(raw: unknown): Station[] {
  const env = parseEnvelope<RawRouteResult[]>(raw);
  if (!env.ok || !env.result?.length) return [];
  const route = env.result[0];
  const list = route.stations?.fromStation ?? route.stations?.toStation ?? [];
  return list.map((s, i) => ({ id: s.id, code: s.code, name: s.name, seq: i + 1 }));
}

interface RawTripStation {
  stationId: string;
  sequence: number;
  stationCode: string;
  stationName: string;
  departureTime: string;
}
interface RawCoach {
  coachTypeId: string;
  coachTypeName: string;
  availableSeats: number;
  travellerCategory: { name: string; fareValue: number }[];
}
interface RawTrip {
  tripId: string;
  vehicleName: string;
  vehicleCode: string;
  tripDate: string;
  fromStation: RawTripStation;
  toStation: RawTripStation;
  coaches: RawCoach[];
}

function fareFor(coach: RawCoach, who: string): number {
  const c = coach.travellerCategory.find((t) => t.name.toLowerCase() === who);
  return c ? c.fareValue : 0;
}

interface RawSeat {
  seatNumber: string;
  row: number;
  column: number;
  booked: boolean;
}
interface RawCoachSeats {
  coachId: string;
  coachName: string;
  coachNumber: string;
  availableSeatsCount: number;
  availableSeats: RawSeat[];
}

/** Parse a getAvailableSeats response (seat map for one segment + class). */
export function parseAvailableSeats(raw: unknown): CoachSeats[] {
  const env = parseEnvelope<RawCoachSeats[]>(raw);
  if (!env.ok || !env.result) return [];
  return env.result.map((c) => ({
    coachId: c.coachId,
    coachName: c.coachName,
    coachNumber: c.coachNumber,
    availableSeatsCount: c.availableSeatsCount,
    seats: (c.availableSeats ?? []).map((s) => ({
      seatNumber: s.seatNumber,
      row: s.row,
      column: s.column,
      booked: s.booked,
    })),
  }));
}

export function parseSearchTrips(raw: unknown): Trip[] {
  const env = parseEnvelope<RawTrip[]>(raw);
  if (!env.ok || !env.result) return [];
  return env.result.map((t) => ({
    tripId: t.tripId,
    vehicleCode: t.vehicleCode,
    vehicleName: t.vehicleName,
    travelDate: (t.tripDate ?? '').slice(0, 10),
    departureTime: t.fromStation.departureTime ?? '',
    fromSeq: t.fromStation.sequence,
    toSeq: t.toStation.sequence,
    fromStationId: t.fromStation.stationId,
    toStationId: t.toStation.stationId,
    classes: t.coaches.map<ClassAvailability>((co) => ({
      coachTypeId: co.coachTypeId,
      className: normalizeClassName(co.coachTypeName),
      availableSeats: co.availableSeats,
      fareAdult: fareFor(co, 'adult'),
      fareChild: fareFor(co, 'child'),
    })),
  }));
}

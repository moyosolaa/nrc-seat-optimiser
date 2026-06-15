// Domain model. Mirrors the GSDS API shapes after normalisation; see docs in README.

export type ClassName = 'First' | 'Business' | 'Standard';

export interface Station {
  id: string;
  code: string;
  name: string;
  /** 1-based position along the route, in travel order. */
  seq: number;
}

/** Availability + fares for one travel class on one purchasable segment. */
export interface ClassAvailability {
  coachTypeId: string;
  className: ClassName;
  availableSeats: number;
  fareAdult: number;
  fareChild: number;
}

/** A trip (one physical departure) for one queried O-D pair, as returned by search-trips. */
export interface Trip {
  tripId: string;
  vehicleCode: string;
  vehicleName: string;
  travelDate: string; // YYYY-MM-DD
  departureTime: string; // origin departure, e.g. "16:00"
  fromSeq: number;
  toSeq: number;
  fromStationId: string;
  toStationId: string;
  classes: ClassAvailability[];
}

/** Availability + fares for one purchasable O-D segment on one trip. */
export interface SegmentOffer {
  tripId: string;
  fromSeq: number;
  toSeq: number;
  classes: ClassAvailability[];
}

/** One physical seat, as returned by getAvailableSeats (per segment + class). */
export interface Seat {
  seatNumber: string;
  row: number;
  column: number;
  booked: boolean;
}

/** A coach's seat map for one segment + class. */
export interface CoachSeats {
  coachId: string;
  coachName: string; // e.g. "C03"
  coachNumber: string; // e.g. "C03A"
  availableSeatsCount: number;
  seats: Seat[];
}

/** One ticket within a combination (the passenger holds one ticket per leg). */
export interface ItineraryLeg {
  fromSeq: number;
  toSeq: number;
  fromCode: string;
  toCode: string;
  className: ClassName;
  coachTypeId: string;
  fare: number;
  availableSeats: number;
  /** Recommended physical coach + seat to buy for this leg (when seat-map data is present). */
  coachName?: string;
  seatNumber?: string;
}

/** A complete way to cover the journey: a sequence of consecutive legs on the same trip. */
export interface Combination {
  legs: ItineraryLeg[];
  ticketCount: number;
  /** Seat moves the passenger makes en route = ticketCount - 1. */
  seatSwitches: number;
  totalPrice: number;
  /** True when the legs are not all the same class/coach — flagged for the UI. */
  mixedClass: boolean;
}

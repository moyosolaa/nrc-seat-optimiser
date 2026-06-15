// Tunables. Anything NRC might change lives here, not inline in logic.

/** The API host the booking site talks to (NOT the site host, nrc.gsds.ng). */
export const API_HOST = 'api.gsds.ng';

/** Route code for Lagos–Ibadan. */
export const ROUTE_NUMBER = 'LI';

/** How long a fetched segment is reused before it's treated as stale and re-fetched. */
export const CACHE_TTL_MS = 5 * 60 * 1000;

export const CONFIG = {
  /**
   * NRC's real per-identity (NIN) ticket limit. Recorded for reference but NOT enforced
   * by default right now — the optimiser ranks all combinations regardless. Pass
   * `maxTickets` to optimise() to cap.
   */
  maxTicketsPerIdentity: 4,
  /** Minimum stations in a journey for a split to be possible (origin + ≥1 intermediate + destination). */
  minStationsForSplit: 3,
  /**
   * How we decide two segments are the same physical train. 'tripId' assumes every
   * sub-segment of a journey shares the user's trip's tripId (current behaviour). If NRC
   * turns out to mint a different tripId per O-D pair, switch to 'vehicleAndTime' and
   * match on vehicleCode + date + departure instead.
   */
  matchTrainBy: 'tripId' as 'tripId' | 'vehicleAndTime',
};

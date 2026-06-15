// Server-side NRC client. The search API is public (HAR-confirmed: no auth, no cookie),
// and server-to-server has no CORS — so a plain fetch works. Polite by design: one
// request at a time, with a minimum gap between calls.

import { parseRouteWiseStations, parseSearchTrips } from '../api/parse';
import type { Station, Trip } from '../shared/types';

const BASE = 'https://api.gsds.ng/search';
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class NrcClient {
  private lastAt = 0;
  constructor(private minGapMs = 200) {}

  private async get(path: string): Promise<unknown> {
    const wait = this.minGapMs - (Date.now() - this.lastAt);
    if (wait > 0) await sleep(wait);
    this.lastAt = Date.now();
    const res = await fetch(`${BASE}${path}`, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`NRC ${path} → HTTP ${res.status}`);
    return res.json();
  }

  /** All stations for the route, in order. (route-wise-stations returns one route here.) */
  async fetchRouteStations(_routeNumber: string): Promise<Station[]> {
    return parseRouteWiseStations(await this.get('/route-wise-stations'));
  }

  /** Trips (all daily departures) + per-class seats/fares for one O-D pair. */
  async fetchTrips(
    fromStation: string,
    toStation: string,
    travelDate: string,
    routeNumber: string,
  ): Promise<Trip[]> {
    const q = `?fromStation=${fromStation}&toStation=${toStation}&travelDate=${travelDate}&routeNumber=${routeNumber}`;
    return parseSearchTrips(await this.get(`/search-trips${q}`));
  }
}

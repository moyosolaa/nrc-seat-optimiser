// The bot's entry point — invoked by the GitHub Action every ~5 min.
//
// For each watched journey: cache today's departure times once (so timing costs no NRC
// calls), and when a 60/45/30/15-min window is due, fetch fresh availability, and post a
// tweet for any train that's sold out but completable via a split. No X keys → DRY mode.

import { NrcClient } from './nrcClient';
import { gatherJourney } from './gather';
import { formatDepartureTweet } from './tweetFormat';
import { makeXClient } from './xClient';
import { SLOTS, dueSlots, watMinutesOfDay } from './slots';
import { isPosted, loadState, markPosted, saveState } from './state';
import type { Station } from '../shared/types';

const ROUTE = 'LI';
const STATE_PATH = 'data/state.json';
const WATCHED: Array<{ from: string; to: string }> = [
  { from: 'MJS', to: 'OA' }, // Lagos → Ibadan
  { from: 'OA', to: 'MJS' }, // Ibadan → Lagos
];

function watDateISO(now: Date): string {
  return new Date(now.getTime() + 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function main(): Promise<void> {
  const now = new Date();
  const date = watDateISO(now);
  const watMin = watMinutesOfDay(now);
  const client = new NrcClient();
  const poster = makeXClient();
  const state = loadState(STATE_PATH);
  console.log(`[bot] ${date} ${String(Math.floor(watMin / 60)).padStart(2, '0')}:${String(watMin % 60).padStart(2, '0')} WAT · ${poster ? 'LIVE' : 'DRY (no X keys)'}`);

  const stations: Station[] = await client.fetchRouteStations(ROUTE);
  const byCode = (code: string) => stations.find((s) => s.code === code);

  for (const { from, to } of WATCHED) {
    const jkey = `${from}-${to}`;
    const fromS = byCode(from);
    const toS = byCode(to);
    if (!fromS || !toS) continue;

    // Cache today's schedule (departure times) once per day.
    let schedule = state.schedule[date]?.[jkey];
    if (!schedule) {
      const trips = await client.fetchTrips(fromS.id, toS.id, date, ROUTE);
      schedule = trips.map((t) => ({ vehicleCode: t.vehicleCode, departureTime: t.departureTime }));
      (state.schedule[date] ??= {})[jkey] = schedule;
    }

    // Which (train, slot) are due now and not already handled?
    const due = schedule
      .map((t) => {
        const done = new Set(SLOTS.filter((s) => isPosted(state, date, `${jkey}|${t.vehicleCode}|${s}`)));
        return { t, slots: dueSlots(t.departureTime, watMin, done) };
      })
      .filter((x) => x.slots.length > 0);
    if (!due.length) continue;

    // A window is due → fetch fresh availability and build the splits.
    const { tripResults } = await gatherJourney(client, stations, fromS.seq, toS.seq, date, ROUTE);

    for (const { t, slots } of due) {
      const tr = tripResults.find((r) => r.label.includes(t.vehicleCode));
      const tweet = tr ? formatDepartureTweet(from, to, tr, Math.max(...slots), stations) : '';
      if (tweet) {
        if (poster) await poster.post(tweet);
        console.log(`\n[${poster ? 'POSTED' : 'DRY'}] ${jkey} ${t.vehicleCode}\n${tweet}\n`);
      }
      for (const s of slots) markPosted(state, date, `${jkey}|${t.vehicleCode}|${s}`); // evaluated → don't re-gather this slot
    }
  }

  saveState(STATE_PATH, state);
  console.log('[bot] done');
}

main().catch((e) => {
  console.error('[bot] failed:', e);
  process.exit(1);
});

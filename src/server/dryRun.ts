// Dry run: fetch LIVE NRC data, run the optimiser, and PRINT the tweet it would post.
// Posts nothing, costs nothing, needs no X API. Usage:
//   npm run dry-run -- MJS OA            (today)
//   npm run dry-run -- MJS OA 2026-06-16 (specific date)

import { NrcClient } from './nrcClient';
import { gatherJourney } from './gather';
import { formatJourneyTweet } from './tweetFormat';

const ROUTE = 'LI';

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function main(): Promise<void> {
  const [fromCode = 'MJS', toCode = 'OA', date] = process.argv.slice(2);
  const travelDate = date ?? todayISO();
  const client = new NrcClient();

  console.log(`Fetching ${fromCode} → ${toCode} on ${travelDate} (route ${ROUTE})…`);
  const stations = await client.fetchRouteStations(ROUTE);
  const from = stations.find((s) => s.code === fromCode);
  const to = stations.find((s) => s.code === toCode);
  if (!from || !to) {
    console.error(`Unknown station code. Available: ${stations.map((s) => s.code).join(', ')}`);
    process.exit(1);
  }

  const { tripResults, fetchCount } = await gatherJourney(client, stations, from.seq, to.seq, travelDate, ROUTE);
  console.log(`\n${fetchCount} NRC call(s) · ${tripResults.length} trip(s):`);
  for (const t of tripResults) console.log(`  ${t.label} → ${t.result.status}`);

  const tweet = formatJourneyTweet(from.code, to.code, tripResults);
  console.log('\n─── DRY RUN · would post ───────────────────');
  console.log(tweet || '(nothing to post — seats available on the selected route)');
  console.log(`─── ${tweet.length} chars ──────────────────────────`);
}

main().catch((e) => {
  console.error('dry-run failed:', e);
  process.exit(1);
});

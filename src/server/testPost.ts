// Verify your X credentials post end-to-end. Set the X_* env vars, then `npm run test-post`.
// Without keys it stays in DRY mode and just prints. (Posts to your account when keys are set.)

import { makeXClient } from './xClient';

const sample = '🚆 NRC seat bot online — split-ticket alerts for sold-out Lagos–Ibadan trains. (test post)';

async function main(): Promise<void> {
  const poster = makeXClient();
  if (!poster) {
    console.log('DRY (no X_* keys set) — would post:\n' + sample);
    return;
  }
  await poster.post(sample);
  console.log('Posted ✅');
}

main().catch((e) => {
  console.error('test-post failed:', e);
  process.exit(1);
});

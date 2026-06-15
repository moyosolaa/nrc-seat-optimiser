import { describe, it, expect } from 'vitest';
import { isPosted, markPosted } from './state';
import type { BotState } from './state';

describe('state', () => {
  it('marks and checks posted keys per date', () => {
    const s: BotState = { schedule: {}, posted: {} };
    expect(isPosted(s, '2026-06-18', 'MJS-OA|LI3|30')).toBe(false);
    markPosted(s, '2026-06-18', 'MJS-OA|LI3|30');
    expect(isPosted(s, '2026-06-18', 'MJS-OA|LI3|30')).toBe(true);
    expect(isPosted(s, '2026-06-18', 'MJS-OA|LI3|15')).toBe(false); // different slot
    expect(isPosted(s, '2026-06-19', 'MJS-OA|LI3|30')).toBe(false); // different date
  });
});

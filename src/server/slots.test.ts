import { describe, it, expect } from 'vitest';
import { dueSlots, minutesUntil, watMinutesOfDay } from './slots';

describe('slots', () => {
  it('converts UTC to WAT minutes', () => {
    expect(watMinutesOfDay(new Date('2026-01-01T06:30:00Z'))).toBe(7 * 60 + 30); // 07:30 WAT
  });

  it('computes minutes until a departure', () => {
    expect(minutesUntil('16:00', 15 * 60)).toBe(60); // 15:00 → 60 min to 16:00
  });

  it('fires the 30-min window (~31 min out)', () => {
    expect(dueSlots('16:00', 16 * 60 - 31, new Set())).toEqual([30]);
  });

  it('skips slots already done', () => {
    expect(dueSlots('16:00', 16 * 60 - 30, new Set([30]))).toEqual([]);
  });

  it('is empty between windows', () => {
    expect(dueSlots('16:00', 16 * 60 - 50, new Set())).toEqual([]); // 50 min: not near 60 or 45
  });
});

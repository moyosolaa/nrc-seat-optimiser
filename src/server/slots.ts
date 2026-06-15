// Pure time math for the posting windows. NRC times are West Africa Time (UTC+1, no DST).

export const SLOTS = [60, 45, 30, 15] as const;
const WAT_OFFSET_MIN = 60;

/** Minutes since midnight in WAT for a given instant. */
export function watMinutesOfDay(now: Date): number {
  return (now.getUTCHours() * 60 + now.getUTCMinutes() + WAT_OFFSET_MIN) % 1440;
}

/** Minutes from `watMin` until a "HH:MM" WAT departure (negative once it has passed). */
export function minutesUntil(departureHHMM: string, watMin: number): number {
  const [h, m] = departureHHMM.split(':').map(Number);
  return h * 60 + (m || 0) - watMin;
}

/** Which of the 60/45/30/15 slots are due now (within ±window min) and not already done. */
export function dueSlots(
  departureHHMM: string,
  watMin: number,
  done: ReadonlySet<number>,
  window = 4,
): number[] {
  const until = minutesUntil(departureHHMM, watMin);
  return SLOTS.filter((s) => !done.has(s) && Math.abs(until - s) <= window);
}

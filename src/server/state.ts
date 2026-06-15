// Bot state, persisted to a JSON file the GitHub Action commits back. Two things:
//  - schedule: today's departure times per journey, fetched once/day (so timing checks
//    on every 5-min run cost zero NRC calls).
//  - posted: which (journey|train|slot) we've already handled, so we never double-post.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export interface ScheduledTrip {
  vehicleCode: string;
  departureTime: string;
}

export interface BotState {
  schedule: Record<string, Record<string, ScheduledTrip[]>>; // date → journey → trips
  posted: Record<string, string[]>; // date → keys
}

const empty = (): BotState => ({ schedule: {}, posted: {} });

export function loadState(path: string): BotState {
  if (!existsSync(path)) return empty();
  try {
    const s = JSON.parse(readFileSync(path, 'utf8')) as Partial<BotState>;
    return { schedule: s.schedule ?? {}, posted: s.posted ?? {} };
  } catch {
    return empty();
  }
}

export function saveState(path: string, state: BotState, keepDays = 3): void {
  prune(state, keepDays);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(state, null, 2) + '\n');
}

export function isPosted(state: BotState, date: string, key: string): boolean {
  return (state.posted[date] ?? []).includes(key);
}

export function markPosted(state: BotState, date: string, key: string): void {
  (state.posted[date] ??= []).push(key);
}

function prune(state: BotState, keepDays: number): void {
  const dropOld = (obj: Record<string, unknown>) => {
    const dates = Object.keys(obj).sort();
    for (const d of dates.slice(0, Math.max(0, dates.length - keepDays))) delete obj[d];
  };
  dropOld(state.schedule);
  dropOld(state.posted);
}

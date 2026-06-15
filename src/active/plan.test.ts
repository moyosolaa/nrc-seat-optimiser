import { describe, it, expect } from 'vitest';
import { planSegments } from './plan';

describe('planSegments', () => {
  it('orders 2-ticket enablers first and excludes the direct', () => {
    const segs = planSegments(1, 4, () => false);
    expect(segs).toHaveLength(5); // C(4,2) - 1 (the direct)
    expect(segs).not.toContainEqual([1, 4]);
    expect(segs[0]).toEqual([1, 2]); // O→k enabler
  });

  it('skips segments that are already cached', () => {
    const have = new Set(['1-2', '3-4']);
    const segs = planSegments(1, 4, (a, b) => have.has(`${a}-${b}`));
    expect(segs).not.toContainEqual([1, 2]);
    expect(segs).not.toContainEqual([3, 4]);
  });

  it('works in the reverse direction', () => {
    const segs = planSegments(4, 1, () => false);
    expect(segs).toHaveLength(5);
    expect(segs[0]).toEqual([4, 3]);
    expect(segs).not.toContainEqual([4, 1]);
  });

  it('adjacentOnly returns just the hops', () => {
    const segs = planSegments(1, 4, () => false, { adjacentOnly: true });
    expect(segs).toEqual([
      [1, 2],
      [2, 3],
      [3, 4],
    ]);
  });
});

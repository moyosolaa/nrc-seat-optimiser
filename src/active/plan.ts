// Decides which sub-segments active mode should fetch for an O→D journey, and in what
// order: 2-ticket enablers (O→k and k→D) first so the simplest splits appear soonest,
// then the deeper pieces. Skips the direct route and anything already cached.

export function planSegments(
  fromSeq: number,
  toSeq: number,
  have: (a: number, b: number) => boolean,
  opts: { adjacentOnly?: boolean } = {},
): Array<[number, number]> {
  if (fromSeq === toSeq) return [];
  const dir = toSeq > fromSeq ? 1 : -1;

  const path: number[] = [];
  for (let s = fromSeq; ; s += dir) {
    path.push(s);
    if (s === toSeq) break;
  }

  const ordered: Array<[number, number]> = [];
  const seen = new Set<string>();
  const add = (a: number, b: number) => {
    const key = `${a}-${b}`;
    if (seen.has(key)) return;
    seen.add(key);
    if (a === fromSeq && b === toSeq) return; // skip the (sold-out) direct
    if (have(a, b)) return; // already captured
    ordered.push([a, b]);
  };

  // Adjacent hops first — sufficient to decide whether the journey is possible at all
  // (a full leg blocks every ticket that crosses it), at the lowest request count.
  for (let h = 0; h < path.length - 1; h++) add(path[h], path[h + 1]);
  if (opts.adjacentOnly) return ordered;

  // Then pieces that enable a 2-ticket split, then every remaining contiguous piece.
  for (let i = 1; i < path.length - 1; i++) {
    add(path[0], path[i]);
    add(path[i], path[path.length - 1]);
  }
  for (let i = 0; i < path.length; i++) {
    for (let j = i + 1; j < path.length; j++) add(path[i], path[j]);
  }
  return ordered;
}

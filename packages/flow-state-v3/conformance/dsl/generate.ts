import type { Script, Step } from "./script.ts";

/**
 * A deterministic generator of numbers in [0, 1) from a seed (mulberry32), so a seeded run replays
 * exactly (Conformance R11).
 */
const random = (seed: number) => {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d_2b_79_f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
};

/**
 * What a generator draws from for one fixture: the steps every script starts with, and the moves
 * it may make after them, each a short run of steps (a pay is a request and its ack) with its
 * weight in a seeded draw (the exhaustive search takes each once).
 */
export type Alphabet = {
  readonly fixture: string;
  readonly actor: string;
  readonly prefix: ReadonlyArray<Step>;
  readonly steps: ReadonlyArray<readonly [ReadonlyArray<Step>, number]>;
};

const weighted = (steps: Alphabet["steps"], at: number) => {
  const total = steps.reduce((sum, [, w]) => sum + w, 0);
  let left = at * total;

  return steps.find(([, w]) => {
    left -= w;

    return left < 0;
  })?.[0];
};

// RETURN_TYPE: a Script, so its steps keep the Step union rather than each literal.
const scriptOf = (alphabet: Alphabet, id: string, tail: ReadonlyArray<Step>): Script => ({
  id: `GEN-${alphabet.fixture}-${id}`,
  fixture: alphabet.fixture,
  actor: alphabet.actor,
  steps: [...alphabet.prefix, ...tail],
});

/**
 * Seeded runs (T45 step 5, advisor Q5): `count` scripts of `length` moves after the prefix, each
 * drawn from its own seed, `seeded-<seed>`.
 */
export const seeded = (alphabet: Alphabet, from: number, count: number, length: number) =>
  Array.from({ length: count }, (_, i) => {
    const seed = from + i;
    const draw = random(seed);

    const tail = Array.from({ length }, () => weighted(alphabet.steps, draw())).flatMap((s) =>
      s === undefined ? [] : s,
    );

    return scriptOf(alphabet, `seeded-${seed}`, tail);
  });

/**
 * The small exhaustive search (T45 step 5, absorbing T14's search): every script of exactly
 * `depth` moves after the prefix, in the alphabet's order, `search-<n>`.
 */
export const exhaustive = (alphabet: Alphabet, depth: number) =>
  Array.from({ length: depth })
    .reduce<ReadonlyArray<ReadonlyArray<Step>>>(
      (all) => all.flatMap((tail) => alphabet.steps.map(([s]) => [...tail, ...s])),
      [[]],
    )
    .map((tail, n) => scriptOf(alphabet, `search-${n}`, tail));

/**
 * The shrinker (T32): the smallest sublist of a failing script's steps after its prefix that still
 * fails as it did (delta debugging, one step removed at a time until none can be).
 */
// RETURN_TYPE: the Script contract; a candidate's id and steps keep the Script shape.
export const shrunk = (
  script: Script,
  prefix: number,
  fails: (candidate: Script) => boolean,
): Script => {
  const head = script.steps.slice(0, prefix);
  let tail = script.steps.slice(prefix);

  for (let removed = true; removed;) {
    removed = false;

    for (let at = 0; at < tail.length; at += 1) {
      const candidate = [...tail.slice(0, at), ...tail.slice(at + 1)];

      if (fails({ ...script, steps: [...head, ...candidate] })) {
        tail = candidate;
        removed = true;
        break;
      }
    }
  }

  return { ...script, id: `${script.id}-shrunk`, steps: [...head, ...tail] };
};

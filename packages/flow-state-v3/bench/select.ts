import { Option } from "effect";
import type { Bench, Concern, Tier } from "./declare.ts";

// What a run selects benches by.
type Selection = {
  readonly tier: Tier;
  readonly concerns: ReadonlyArray<Concern>;
  readonly only: Option.Option<string>;
  readonly maxN: Option.Option<number>;
};

// `--only` matches a bench id: `*` stands for any text, and a pattern with no `*` matches any id
// that contains it.
const matcherOf = (pattern: string) => {
  const escaped = pattern.replaceAll(/[.+?^${}()|[\]\\]/gu, "\\$&").replaceAll("*", ".*");

  return new RegExp(pattern.includes("*") ? `^${escaped}$` : escaped, "u");
};

// Whether a bench is in the tier and the concerns named; tooling runs only when named.
const inTier = (b: Bench, selection: Selection) => {
  const named = selection.concerns.length > 0;

  if (named && !selection.concerns.includes(b.concern)) return false;

  if (b.concern === "tooling") return named;

  if (selection.tier === "stress") return b.stress;

  return selection.tier !== "quick" || (b.quick && !b.stress);
};

/**
 * The benches a run times, in declaration order.
 *
 * **Details**
 *
 * The tier picks first: quick its headline benches that are not stress, stress only the stress benches, full and dev every bench; tooling only when
 * its concern is named. Then the concerns and the `--only` pattern. Then sizes: with `maxN`, a
 * series point larger than it is left out; in the dev tier with no `maxN`, only each series'
 * smallest point stays, so iterating on a scaling problem starts at the small end.
 */
export const selectBenches = (all: ReadonlyArray<Bench>, selection: Selection) => {
  const smallest = new Map<string, number>();

  for (const b of all)
    for (const s of Option.toArray(b.series))
      smallest.set(s.name, Math.min(smallest.get(s.name) ?? Number.POSITIVE_INFINITY, b.size.n));

  const sized = (b: Bench) =>
    Option.match(b.series, {
      onNone: () => true,
      onSome: (s) =>
        Option.match(selection.maxN, {
          onSome: (max) => b.size.n <= max,
          onNone: () => selection.tier !== "dev" || b.size.n === smallest.get(s.name),
        }),
    });

  return all.filter(
    (b) =>
      inTier(b, selection) &&
      Option.match(selection.only, {
        onNone: () => true,
        onSome: (p) => matcherOf(p).test(b.id),
      }) &&
      sized(b),
  );
};

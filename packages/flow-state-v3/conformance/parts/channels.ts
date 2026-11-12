import { CODES } from "./codes.ts";

/**
 * Two codes, in the closed list's order.
 */
export type Pair = readonly [string, string];

/**
 * A pair that does not interact, with the rule that says so.
 */
export type Quiet = { readonly pair: Pair; readonly rule: string };

/**
 * The fixture catalogue's channel table (section 5A): each channel and the codes that touch it.
 * The lifecycle channel's codes are the lifecycle owners.
 */
export const CHANNELS = {
  W: ["rj", "lt", "se", "ca", "ky", "cm", "cA", "rt", "un", "op", "en", "wa", "sr", "dp"],
  R: ["ky", "lk", "sb", "op", "en", "st", "fz", "sw", "ph", "kb", "os", "pg", "gr"],
  T: ["du", "ms", "rs", "ks", "dm", "fz", "of"],
  I: ["ks", "fr", "ea", "ma", "cx", "in", "ci", "pv", "lc", "sd", "sn", "dp", "gr"],
  P: ["un", "wa", "rl", "up", "sr", "cs", "hs", "fr", "ea", "pv", "sd", "mt", "lz", "fg"],
  L: ["rl", "up", "dp", "gr", "fg", "mt", "lz", "wa", "sr", "ma", "of"],
} as const;

const OWNERS: ReadonlySet<string> = new Set(CHANNELS.L);

const PURE_TURN: ReadonlySet<string> = new Set(["gd", "ck", "rn"]);

const POLICIES: ReadonlySet<string> = new Set(["rj", "lt", "se", "ca"]);

const shareChannel = (a: string, b: string) =>
  Object.values(CHANNELS).some(
    (codes: ReadonlyArray<string>) => codes.includes(a) && codes.includes(b),
  );

const owns = (owner: string, other: string) => OWNERS.has(owner) && !PURE_TURN.has(other);

/**
 * Why two codes do not interact, or none when they do (Conformance R18; the catalogue's 5B rule,
 * proposed until the user approves it).
 *
 * **Details**
 *
 * Two codes interact when both touch one channel, or when one is a lifecycle owner and the other
 * is not a pure-turn feature; the four policies of one operation never interact with each other.
 */
export const quietRule = (a: string, b: string) => {
  if (POLICIES.has(a) && POLICIES.has(b)) return "alternative policies of one operation";

  if (shareChannel(a, b) || owns(a, b) || owns(b, a)) return undefined;

  return PURE_TURN.has(a) || PURE_TURN.has(b)
    ? "a pure-turn feature reads memory and the event only"
    : "no shared channel and no lifecycle owner";
};

/**
 * Whether two codes interact by the channel table's rule.
 */
export const interacts = (a: string, b: string) => a !== b && quietRule(a, b) === undefined;

const pairsOf = (codes: ReadonlyArray<string>) => {
  const ordered = CODES.filter((c) => codes.includes(c));

  return ordered.flatMap((a, i) => ordered.slice(i + 1).map((b) => [a, b] as const));
};

/**
 * The interacting pairs among `codes`, in the closed list's order, generated from the table.
 */
export const interactingPairs = (codes: ReadonlyArray<string>) =>
  pairsOf(codes).filter(([a, b]) => interacts(a, b));

/**
 * The pairs among `codes` that do not interact, each with its rule: the list the user approves.
 */
export const quietPairs = (codes: ReadonlyArray<string>) =>
  pairsOf(codes).flatMap(([a, b]) => {
    const rule = quietRule(a, b);

    if (rule === undefined) return [];

    const quiet: Quiet = { pair: [a, b], rule };

    return [quiet];
  });

/**
 * The shared-resource codes (catalogue 5A, "How pairs count"): a pair across two composites of the
 * app mix counts only with one of them.
 */
export const SHARED: ReadonlySet<string> = new Set([
  "wa",
  "sr",
  "rl",
  "up",
  "dp",
  "fg",
  "of",
  "ad",
  "ma",
  "mt",
]);

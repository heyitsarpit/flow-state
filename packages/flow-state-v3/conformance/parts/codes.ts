/**
 * The closed list of feature codes (Conformance R16): the fixture catalogue's 35 (section 2) and
 * the Plan check's 18 (section 4), in the catalogue's order.
 */
export const CODES = [
  "rj",
  "lt",
  "se",
  "ca",
  "ky",
  "cm",
  "cA",
  "rt",
  "un",
  "du",
  "ms",
  "rs",
  "ks",
  "gd",
  "cs",
  "fr",
  "ea",
  "lk",
  "sb",
  "op",
  "en",
  "st",
  "wa",
  "rl",
  "up",
  "sr",
  "dp",
  "ma",
  "cx",
  "gr",
  "lr",
  "of",
  "ad",
  "mt",
  "lz",
  "in",
  "ci",
  "pv",
  "lc",
  "ck",
  "hs",
  "rn",
  "sd",
  "sn",
  "dm",
  "fz",
  "sw",
  "ph",
  "kb",
  "os",
  "pg",
  "fg",
  "is",
] as const;

/**
 * A feature code of the closed list.
 */
export type Code = (typeof CODES)[number];

/**
 * The codes the Spec model's tables implement: the lifecycle tables (lanes, members, endings),
 * persistence (write-ahead, refusal, restore), actors and the turn's selection and schedules.
 */
export const MODEL_CODES: ReadonlyArray<Code> = [
  ...(["rj", "lt", "se", "ca", "ky", "cm", "cA", "rt", "un", "du", "gd", "lk"] as const),
  ...(["wa", "sr", "rl", "dp", "ma", "gr", "lr"] as const),
];

const known: ReadonlySet<string> = new Set(CODES);

/**
 * Whether `code` is in the closed list.
 */
// RETURN_TYPE: a type guard, so a checked string narrows to a Code.
export const isCode = (code: string): code is Code => known.has(code);

/**
 * The codes of `codes` that are not in the closed list.
 */
export const unknownCodes = (codes: ReadonlyArray<string>) => codes.filter((code) => !isCode(code));

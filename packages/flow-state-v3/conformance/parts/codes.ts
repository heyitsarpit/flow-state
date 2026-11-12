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

/**
 * The slice that builds each code (the replan's "53 feature codes, by owning Spec"; 0 is slice R,
 * already built).
 *
 * **Details**
 *
 * - `wa`, `sr` and `rl` are 0: production builds them in part today (its declaration says so) and
 *   slice 2 completes them.
 * - `in` is 3, the slice of its compile half; its naming half lands in slice 4.
 */
export const SLICE_OF: Readonly<Record<Code, number>> = {
  rj: 0,
  ky: 0,
  cm: 0,
  rt: 0,
  un: 0,
  lr: 0,
  du: 0,
  gd: 0,
  dp: 0,
  ma: 0,
  gr: 0,
  lk: 0,
  wa: 0,
  sr: 0,
  rl: 0,
  lt: 1,
  se: 1,
  ca: 1,
  cA: 1,
  ad: 1,
  up: 2,
  fg: 2,
  pg: 2,
  cs: 3,
  hs: 3,
  fr: 3,
  ea: 3,
  rn: 3,
  ci: 3,
  pv: 3,
  ck: 3,
  ms: 3,
  rs: 3,
  ks: 3,
  dm: 3,
  in: 3,
  lc: 4,
  sd: 4,
  sn: 4,
  is: 4,
  cx: 4,
  sb: 5,
  op: 5,
  kb: 5,
  fz: 5,
  sw: 5,
  ph: 5,
  os: 5,
  of: 5,
  st: 7,
  en: 8,
  mt: 9,
  lz: 9,
};

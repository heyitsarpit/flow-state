/// <reference types="node" />
import { Option } from "effect";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PACKAGE } from "./args.ts";

/**
 * The rules a baseline difference may cite: each a rule the core broke and a pending case now
 * holds it to, such as WriteLanes I34 for a row's single Ended at its birth or WriteLanes I32 for
 * an ending applied at settlement. Anything else cannot be written.
 */
export const PENDING = [
  "WriteLanes I31",
  "Actors I41",
  "Restore I1",
  "WriteLanes I32",
  "WriteLanes I33",
  "WriteLanes I34",
  "WriteLanes I35",
  "Restore R3",
  "Restore R1",
  "WriteAhead I24",
  "Actors I40",
  "Codec I7",
  "WriteAhead I20",
] as const;

/**
 * One of {@link PENDING}.
 */
export type Pending = (typeof PENDING)[number];

/**
 * A run whose timeline may differ from the baseline: a named entry citing the rule whose fix
 * changes it. An entry whose run no longer differs fails the compare.
 */
export type Allowed = {
  readonly run: string;
  readonly pending: Pending;
  readonly why: string;
};

/**
 * Where the filed named entries live: one run per line, its id and the `+`-joined rules whose
 * fixes changed it. `baseline --allow FILE` writes it.
 */
export const ALLOWED_FILE = resolve(PACKAGE, "conformance", "baseline-allowed.tsv");

const pendingOf = (rule: string) => Option.fromUndefinedOr(PENDING.find((p) => p === rule));

// What each rule's fix changes in a run, quoted from its Spec.
const BECAUSE: Partial<Record<Pending, string>> = {
  "Actors I40": "a boot queues nothing and parks nothing",
  "Restore R3": "the incarnation's Start delivers, the same way whatever began it",
  "Restore I1":
    "the live incarnations restored are exactly the Owing identities whose actor record restores",
  "Restore R1": "restored records stay records",
  "Codec I7": "records are actor/, lane/ and owed/, each with format",
  "WriteAhead I24":
    "a landed lane record's inFlight is false for a Held head, in the step that wrote it",
  "WriteAhead I20": "at every step's end, the records a step touched are projected once",
};

const quoted = (rule: string) =>
  Option.flatMap(pendingOf(rule), (p) =>
    Option.map(Option.fromUndefinedOr(BECAUSE[p]), (because) => ({ pending: p, because })),
  );

const filed = existsSync(ALLOWED_FILE)
  ? readFileSync(ALLOWED_FILE, "utf8")
      .split("\n")
      .filter((l) => l !== "")
      .map((l) => {
        const [run = "", rules = ""] = l.split("\t");
        const cited = rules.split("+");

        return { run, rules, quotes: cited.flatMap((r) => Option.toArray(quoted(r))), cited };
      })
  : [];

/**
 * Filed entries that cite a rule not pending, or one with no quoted reason: each a failure of the
 * compare.
 */
export const refused = filed
  .filter((f) => f.quotes.length < f.cited.length)
  .map((f) => `BAD  ${f.run}: its entry cites ${f.rules}, not all pending and quoted`);

/**
 * The named differences the steps since the baseline brought, each with its pending case.
 */
export const allowed: ReadonlyArray<Allowed> = filed.flatMap(({ run, quotes, cited }) => {
  const [first] = quotes;

  return first === undefined || quotes.length < cited.length
    ? []
    : [
        {
          run,
          pending: first.pending,
          why: quotes.map((q) => `${q.pending}: ${q.because}`).join("; "),
        },
      ];
});

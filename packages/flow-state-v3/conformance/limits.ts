import { Data, Option } from "effect";
import type { Mutant } from "./dsl/oracle.ts";
import { caught } from "./runner/caught.ts";
import type { CaseVerdict } from "./runner/verdict.ts";

/**
 * One limit of round-14 (Conformance R22): a case it fails, the check that fails it, the
 * Invariant it breaks there, and why.
 */
export type Limit = {
  readonly case: string;
  readonly check: string;
  readonly invariant: string;
  readonly why: string;
};

/**
 * Round-14's limits, each verified by `limits` (Conformance I64): its case must fail on round-14
 * by its Invariant. A limited case counts neither as a pass nor as a mutant's control on round-14
 * (I66): the generated pool's control leaves out every case red on the unedited runtime.
 */
export const limits: ReadonlyArray<Limit> = [
  {
    case: "GEN-serialize-seeded-2004-shrunk",
    check: "disposal",
    invariant: "Actors I38",
    why: "round-14 ends its disposal without ending a commit queued behind a Held head NotSent { Disposed }; the head was cancelled on the wire (unknown { Cancelled }). Production has no Lab machine to compare",
  },
];

/**
 * What one row's verifying run found: its case failed by its Invariant (`held`), passed, or
 * failed by another Invariant or check. Only the row's own case's verdict holds it. A row whose
 * check is `case` is held when the case's failing expectation cites its Invariant (the verdict's
 * `cites`); any other row when its oracle failed the run by its Invariant.
 */
export const verdictOfLimit = (limit: Limit, verdict: CaseVerdict) => {
  if (verdict.id !== limit.case)
    return { held: false, why: `${limit.case} is held by its own verdict, not ${verdict.id}'s` };

  if (verdict._tag !== "Fail") return { held: false, why: `${limit.case} ${verdict._tag}` };

  const named = caught(Option.some({ check: limit.check, invariant: limit.invariant }), verdict);

  return named
    ? { held: true, why: `${limit.case} fails by ${limit.invariant}` }
    : { held: false, why: `${limit.case} fails, but not by ${limit.check} ${limit.invariant}` };
};

/**
 * What a stated limit's mutant does in its cases on round-14: it survives (the limit admits it),
 * or a check still catches it (the limit is narrower than it reads).
 */
export type Outcome = Data.TaggedEnum<{ Survives: {}; Caught: { check: string } }>;

/**
 * Constructors and matchers for {@link Outcome}.
 */
export const Outcome = Data.taggedEnum<Outcome>();

/**
 * One of the suite's own stated limits (Conformance R22, the T45 reviews): where the suite takes a
 * runtime's report for a fact, what it admits, and a mutant that exercises it, with the outcome
 * the `limits` gate verifies on round-14.
 */
export type StatedLimit = {
  readonly limit: string;
  readonly where: string;
  readonly admits: string;
  readonly mutant: Mutant;
  readonly outcome: Outcome;
};

/**
 * The suite's stated limits, each with its mutant and outcome.
 */
export const statedLimits: ReadonlyArray<StatedLimit> = [
  {
    limit: "the keys of an actor whose fields the suite does not carry",
    where: "turn/credits.ts keysOf",
    admits:
      "after a kill that lost every write of an actor's record (a capture not yet due), or for an actor never ensured, its turn's member keys are the report's, a keyed retry's included (turn/credits.ts retriesOwed). Its mutant lies about a mint's key and shows only the mint check: a lie in the turn's member keys for such an actor is what this limit lets pass, and no mutant here shows it",
    mutant: {
      name: "limit.mint-key-lies",
      says: "every mint reports a key no fold gives",
      expects: "WriteLanes I1",
      runtime: "prototype",
      cases: ["GEN-pay-seeded-3074"],
      edits: [
        {
          file: "world.ts",
          find: "  void tx.evidence.push({ kind, ...fields });",
          replace:
            '  void tx.evidence.push(kind === "mint" ? { kind, ...fields, key: { lie: true } } : { kind, ...fields });',
        },
      ],
    },
    outcome: Outcome.Caught({ check: "lane-queue" }),
  },
  {
    limit: "the unowed Incarnated",
    where: "dsl/compare.ts incarnationHeard",
    admits:
      "an incarnation the suite did not owe, in a step that reloads, disposes or sends, is applied as a woken incarnation once per actor per step; a second one is not applied",
    mutant: {
      name: "limit.incarnation-twice",
      says: "every incarnation is reported twice",
      expects: "WriteLanes I15",
      runtime: "prototype",
      cases: ["PAY-01"],
      edits: [
        {
          file: "world.ts",
          find: "  void tx.evidence.push({ kind, ...fields });",
          replace:
            '  void (tx.evidence.push({ kind, ...fields }), kind === "incarnation" && tx.evidence.push({ kind, ...fields }));',
        },
      ],
    },
    outcome: Outcome.Survives(),
  },

  {
    limit: "the position of a re-send",
    where: "turn/selection.ts Sent",
    admits:
      "a re-send moves its call Open at its Sent report, once the server log holds its request; a missing Sent leaves the call Held",
    mutant: {
      name: "limit.invoked-dropped",
      says: "the runtime never reports a send",
      expects: "WriteLanes I6",
      runtime: "prototype",
      cases: ["PAY-04"],
      edits: [
        {
          file: "world.ts",
          find: "  void tx.evidence.push({ kind, ...fields });",
          replace: '  void (kind === "invoked" || tx.evidence.push({ kind, ...fields }));',
        },
      ],
    },
    outcome: Outcome.Caught({ check: "attempt-identity" }),
  },
  {
    limit: "the channel of an ending the server did not answer",
    where: "turn/anchor.ts ended",
    admits:
      "a cancel's, decline's, restore's or bound's ending keeps its call Held whatever channel it reports",
    mutant: {
      name: "limit.cancelled-as-failure",
      says: "an unknown { Cancelled } ending is reported as a failure",
      expects: "WriteLanes I3",
      runtime: "prototype",
      cases: ["PAY-12/cancel-on-wire"],
      edits: [
        {
          file: "world.ts",
          find: "  void tx.evidence.push({ kind, ...fields });",
          replace:
            '  void tx.evidence.push(kind === "ending" && fields["reason"] === "Cancelled" ? { kind, ...fields, channel: "failure" } : { kind, ...fields });',
        },
      ],
    },
    outcome: Outcome.Caught({ check: "ending-channels" }),
  },
];

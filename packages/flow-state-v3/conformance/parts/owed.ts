import { Data, Predicate } from "effect";
import type { Limit } from "../limits.ts";

/**
 * One exact break an owed row excuses: an Attempt (every violation of the row's check and
 * Invariant on it), or, for a break with no Attempt, the subject the refusal names (a lane or an
 * actor) at the one step it broke at.
 */
export type OwedItem = Data.TaggedEnum<{
  Attempt: { id: string };
  Item: { subject: string; step: number };
}>;

export const OwedItem = Data.taggedEnum<OwedItem>();

/**
 * A break with no Attempt: its refusal's subject at its step.
 */
export const item = (subject: string, step: number) => OwedItem.Item({ subject, step });

/**
 * One owed row of a script the part player plays (Conformance R22): a {@link Limit} with the Task
 * that owns it and the exact breaks it excuses. Every item must still break, and any other break
 * fails the run.
 */
export type PartOwed = Limit & {
  readonly owner: string;
  readonly items: ReadonlyArray<OwedItem>;
};

/**
 * Whether an item is the violation found on `subject` at `step`.
 */
export const isBreak = (owed: OwedItem, subject: string, step: number) =>
  OwedItem.$match(owed, {
    Attempt: ({ id }) => id === subject,
    Item: (i) => i.subject === subject && i.step === step,
  });

/**
 * The one owed rule (Conformance R22): whether `row` excuses a violation of its script, check and
 * Invariant found on `subject` at `step`.
 */
export const excuses = (row: PartOwed, subject: string, step: number) =>
  row.items.some((i) => isBreak(i, subject, step));

/**
 * Why production re-sends past its budget across a reload: a re-send's retryCount is never
 * re-captured, so a boot restores the count from before it and a spent `retryable({ times })`
 * passes again (WriteAhead R13, WriteLanes I7).
 */
export const RETRY_COUNT =
  "a re-send's retryCount is never re-captured (`invoke` sets the lane, `persist` is not called), so a boot restores the count from before the re-send and a spent `retryable({ times })` passes again (WriteAhead R13, WriteLanes I7)";

/**
 * Production's bug behind a disposed identity's Held head at a boot: the boot restores and parks
 * its unbound head, so the adopting incarnation's start gets nothing (Restore R1, Actors I40: a
 * boot delivers and parks nothing).
 */
export const UNBOUND_RESTORE =
  "the boot restores and parks a disposed identity's unbound Held head, so the adopting incarnation's start gets nothing (Restore R1, Actors I40: a boot delivers and parks nothing)";

const OWED_SUBJECTS = {
  "GEN-pay-search-25-shrunk|delivered-once|WriteLanes I15": ["att-25000-7"],
  "GEN-pay-search-25-shrunk|disposal|Actors I29": ["att-25000-7"],
  "MIX-sync+transfers+sign-in-stress-101|lane-queue|WriteLanes I12": ["att-101000-35"],
  "MIX-sync+transfers+sign-in-stress-10|lane-queue|WriteLanes I12": [
    "att-10001-12",
    "att-10000-10",
  ],
  "MIX-sync+transfers+sign-in-stress-10|delivered-once|WriteLanes I16": [
    "att-10001-12",
    "att-10000-10",
  ],
  "MIX-sync+transfers+sign-in-stress-10|delivered-once|WriteLanes I15": [
    "att-10001-12",
    "att-10000-10",
    "att-10005-17",
    item("Bank/Transfers acct-2 transfer", 131),
    item("Bank/Transfers acct-2 transfer", 177),
  ],
  "MIX-sync+transfers+sign-in-stress-10|lane-queue|WriteLanes I8": ["att-10003-41", "att-10005-17"],
  "MIX-sync+transfers+sign-in-stress-10|lane-queue|WriteLanes I1": ["att-10005-17"],
  "MIX-sync+transfers+sign-in-stress-10|disposal|Actors I32": ["att-10000-10"],
  "MIX-sync+transfers+sign-in-stress-10|disposal|Actors I29": ["att-10000-10"],
  "MIX-sync+transfers+sign-in-stress-10|delivered-once|Restore I6": ["att-10000-10"],
  "PART-cells-stress-101|delivered-once|WriteLanes I15": ["att-101001-6"],
  "PART-cells-stress-101|disposal|Actors I29": ["att-101001-6"],
  "PART-cells-stress-102|delivered-once|WriteLanes I15": [
    "att-102001-12",
    "att-102006-10",
    "att-102006-34",
    "att-102006-4",
  ],
  "PART-cells-stress-102|disposal|Actors I29": [
    "att-102001-12",
    "att-102006-10",
    "att-102006-34",
    "att-102006-4",
  ],
  "PART-cells-stress-104|delivered-once|WriteLanes I15": ["att-104000-7", "att-104004-51"],
  "PART-cells-stress-104|disposal|Actors I29": ["att-104000-7", "att-104004-51"],
  "PART-cells-stress-105-shrunk|delivered-once|WriteLanes I15": [
    item("Checkout/Pay shopper-1 pay", 8),
    "att-105000-16",
  ],
  "PART-cells-stress-105-shrunk|disposal|Actors I38": ["att-105000-7"],
  "PART-cells-stress-105-shrunk|lane-queue|WriteLanes I8": ["att-105000-16"],
  "PART-cells-stress-105|delivered-once|WriteLanes I15": ["att-105000-7", "att-105007-14"],
  "PART-cells-stress-105|disposal|Actors I29": ["att-105000-7", "att-105007-14"],
  "PART-cells-stress-106|delivered-once|WriteLanes I15": ["att-106000-7", "att-106009-13"],
  "PART-cells-stress-106|disposal|Actors I29": ["att-106000-7", "att-106009-13"],
  "PART-cells-stress-107|delivered-once|WriteLanes I15": ["att-107003-11"],
  "PART-cells-stress-107|disposal|Actors I29": ["att-107003-11"],
  "PART-cells-stress-108|delivered-once|WriteLanes I15": ["att-108001-17"],
  "PART-cells-stress-108|disposal|Actors I29": ["att-108001-17"],
  "PART-cells-stress-109|delivered-once|WriteLanes I15": ["att-109000-11", "att-109016-13"],
  "PART-cells-stress-109|disposal|Actors I29": ["att-109000-11", "att-109016-13"],
  "PART-cells-stress-10|delivered-once|WriteLanes I15": ["att-10001-6", "att-10003-12"],
  "PART-cells-stress-10|disposal|Actors I29": ["att-10001-6", "att-10003-12"],
  "PART-cells-stress-110|delivered-once|WriteLanes I15": ["att-110002-7", "att-110011-12"],
  "PART-cells-stress-110|disposal|Actors I29": ["att-110002-7", "att-110011-12"],
  "PART-cells-stress-111|delivered-once|WriteLanes I15": ["att-111001-18"],
  "PART-cells-stress-111|disposal|Actors I29": ["att-111001-18"],
  "PART-cells-stress-11|delivered-once|WriteLanes I15": ["att-11005-29"],
  "PART-cells-stress-11|disposal|Actors I29": ["att-11005-29"],
  "PART-cells-stress-12|delivered-once|WriteLanes I15": ["att-12001-7"],
  "PART-cells-stress-12|disposal|Actors I29": ["att-12001-7"],
  "PART-cells-stress-1|delivered-once|WriteLanes I15": ["att-1006-4", "att-1008-9", "att-1012-27"],
  "PART-cells-stress-1|delivered-once|WriteLanes I16": ["att-1006-4"],
  "PART-cells-stress-1|disposal|Actors I29": ["att-1006-4", "att-1008-9", "att-1012-27"],
  "PART-cells-stress-1|lane-queue|WriteLanes I12": ["att-1006-4"],
  "PART-cells-stress-2|delivered-once|WriteLanes I15": ["att-2002-6", "att-2004-21"],
  "PART-cells-stress-2|disposal|Actors I29": ["att-2002-6", "att-2004-21"],
  "PART-cells-stress-3|delivered-once|WriteLanes I15": ["att-3000-7", "att-3001-25"],
  "PART-cells-stress-3|disposal|Actors I29": ["att-3000-7", "att-3001-25"],
  "PART-cells-stress-4|delivered-once|WriteLanes I15": ["att-4000-11", "att-4002-43"],
  "PART-cells-stress-4|delivered-once|WriteLanes I16": ["att-4002-43"],
  "PART-cells-stress-4|disposal|Actors I29": ["att-4000-11", "att-4002-43"],
  "PART-cells-stress-4|lane-queue|WriteLanes I12": ["att-4002-43"],
  "PART-cells-stress-6|delivered-once|WriteLanes I15": ["att-6004-7"],
  "PART-cells-stress-6|disposal|Actors I29": ["att-6004-7"],
  "PART-cells-stress-7|delivered-once|WriteLanes I15": ["att-7000-22", "att-7008-14"],
  "PART-cells-stress-7|disposal|Actors I29": ["att-7000-22", "att-7008-14"],
  "PART-cells-stress-8|delivered-once|WriteLanes I15": [
    "att-8000-12",
    "att-8000-16",
    "att-8001-13",
    "att-8008-16",
  ],
  "PART-cells-stress-8|delivered-once|WriteLanes I16": ["att-8000-12", "att-8000-16"],
  "PART-cells-stress-8|disposal|Actors I29": ["att-8000-12", "att-8001-13", "att-8008-16"],
  "PART-cells-stress-8|lane-queue|WriteLanes I12": ["att-8000-12", "att-8000-16"],
  "PART-cells-stress-9|disposal|Actors I29": ["att-9002-4"],
  "PART-cells-stress-9|lane-queue|WriteLanes I12": ["att-9002-4", "att-9008-13"],
  "PART-cells-stress-9|lane-queue|WriteLanes I1": ["att-9008-13"],
  "PART-cells-stress-9|delivered-once|WriteLanes I16": ["att-9008-13"],
  "PART-cells-stress-9|delivered-once|WriteLanes I15": ["att-9008-13"],
  "PART-cells-stress-8|lane-queue|WriteLanes I1": ["att-8000-16"],
  "PART-pay-stress-3|lane-queue|WriteLanes I1": ["att-3005-20"],
  "PART-pay-stress-12|lane-queue|WriteLanes I1": ["att-12001-15"],
  "PART-pay-stress-106|lane-queue|WriteLanes I1": ["att-106010-23"],
  "PART-pay-stress-112|lane-queue|WriteLanes I1": ["att-112004-30"],
  "PART-pay-stress-101|delivered-once|WriteLanes I15": ["att-101004-3"],
  "PART-pay-stress-101|disposal|Actors I29": ["att-101004-3"],
  "PART-pay-stress-102|delivered-once|WriteLanes I15": ["att-102001-6", "att-102007-27"],
  "PART-pay-stress-102|disposal|Actors I29": ["att-102001-6", "att-102007-27"],
  "PART-pay-stress-104|delivered-once|WriteLanes I15": ["att-104000-16"],
  "PART-pay-stress-104|disposal|Actors I29": ["att-104000-16"],
  "PART-pay-stress-105|delivered-once|WriteLanes I15": ["att-105001-6", "att-105007-23"],
  "PART-pay-stress-105|disposal|Actors I29": ["att-105001-6", "att-105007-23"],
  "PART-pay-stress-106|delivered-once|Restore I6": ["att-106006-18"],
  "PART-pay-stress-106|delivered-once|WriteLanes I15": [
    "att-106001-7",
    "att-106006-18",
    "att-106010-23",
  ],
  "PART-pay-stress-106|delivered-once|WriteLanes I16": ["att-106006-18", "att-106010-23"],
  "PART-pay-stress-106|disposal|Actors I29": ["att-106001-7", "att-106006-18"],
  "PART-pay-stress-106|lane-queue|WriteLanes I12": ["att-106006-18", "att-106010-23"],
  "PART-pay-stress-107|delivered-once|WriteLanes I15": ["att-107003-6"],
  "PART-pay-stress-107|disposal|Actors I29": ["att-107003-6"],
  "PART-pay-stress-108|delivered-once|WriteLanes I15": ["att-108003-6"],
  "PART-pay-stress-108|disposal|Actors I29": ["att-108003-6"],
  "PART-pay-stress-109|delivered-once|WriteLanes I15": [
    "att-109001-12",
    "att-109001-21",
    "att-109001-38",
  ],
  "PART-pay-stress-109|delivered-once|WriteLanes I16": ["att-109001-12"],
  "PART-pay-stress-109|disposal|Actors I29": ["att-109001-12", "att-109001-21", "att-109001-38"],
  "PART-pay-stress-109|lane-queue|WriteLanes I12": ["att-109001-12"],
  "PART-pay-stress-10|delivered-once|WriteLanes I15": ["att-10000-7", "att-10006-8"],
  "PART-pay-stress-10|disposal|Actors I29": ["att-10000-7", "att-10006-8"],
  "PART-pay-stress-110|delivered-once|Restore I6": ["att-110000-14"],
  "PART-pay-stress-110|delivered-once|WriteLanes I15": ["att-110000-14", "att-110007-8"],
  "PART-pay-stress-110|delivered-once|WriteLanes I16": ["att-110000-14"],
  "PART-pay-stress-110|disposal|Actors I29": ["att-110000-14", "att-110007-8"],
  "PART-pay-stress-110|lane-queue|WriteLanes I12": ["att-110000-14"],
  "PART-pay-stress-111|delivered-once|WriteLanes I15": ["att-111001-7"],
  "PART-pay-stress-111|disposal|Actors I29": ["att-111001-7"],
  "PART-pay-stress-112|delivered-once|WriteLanes I15": ["att-112003-6", "att-112004-30"],
  "PART-pay-stress-112|disposal|Actors I29": ["att-112003-6", "att-112004-30"],
  "PART-pay-stress-112|lane-queue|WriteLanes I12": ["att-112004-30"],
  "PART-pay-stress-112|delivered-once|WriteLanes I16": ["att-112004-30"],
  "PART-pay-stress-11|delivered-once|WriteLanes I15": ["att-11003-5"],
  "PART-pay-stress-11|disposal|Actors I29": ["att-11003-5"],
  "PART-pay-stress-12|delivered-once|WriteLanes I15": ["att-12001-15"],
  "PART-pay-stress-12|delivered-once|WriteLanes I16": ["att-12001-15"],
  "PART-pay-stress-12|lane-queue|WriteLanes I12": ["att-12001-15"],
  "PART-pay-stress-1|delivered-once|WriteLanes I15": ["att-1000-7", "att-1006-12"],
  "PART-pay-stress-1|disposal|Actors I29": ["att-1000-7", "att-1006-12"],
  "PART-pay-stress-2|delivered-once|WriteLanes I15": ["att-2000-14", "att-2000-36"],
  "PART-pay-stress-2|disposal|Actors I29": ["att-2000-14", "att-2000-36"],
  "PART-pay-stress-3|delivered-once|WriteLanes I15": [
    "att-3000-7",
    "att-3003-17",
    "att-3003-24",
    "att-3005-20",
  ],
  "PART-pay-stress-3|delivered-once|WriteLanes I16": ["att-3003-17", "att-3005-20"],
  "PART-pay-stress-3|disposal|Actors I29": [
    "att-3000-7",
    "att-3003-17",
    "att-3003-24",
    "att-3005-20",
  ],
  "PART-pay-stress-3|lane-queue|WriteLanes I12": ["att-3003-17", "att-3005-20"],
  "PART-pay-stress-4|delivered-once|WriteLanes I15": ["att-4006-7", "att-4009-36"],
  "PART-pay-stress-4|disposal|Actors I29": ["att-4006-7", "att-4009-36"],
  "PART-pay-stress-5|delivered-once|WriteLanes I15": ["att-5001-7"],
  "PART-pay-stress-5|disposal|Actors I29": ["att-5001-7"],
  "PART-pay-stress-6|delivered-once|WriteLanes I15": ["att-6001-7", "att-6017-9"],
  "PART-pay-stress-6|disposal|Actors I29": ["att-6001-7", "att-6017-9"],
  "PART-pay-stress-7|delivered-once|WriteLanes I15": ["att-7000-16", "att-7000-46"],
  "PART-pay-stress-7|disposal|Actors I29": ["att-7000-16", "att-7000-46"],
  "PART-pay-stress-8|delivered-once|WriteLanes I15": ["att-8000-7", "att-8012-17", "att-8014-16"],
  "PART-pay-stress-8|disposal|Actors I29": ["att-8000-7", "att-8012-17", "att-8014-16"],
  "PART-pay-stress-9|delivered-once|WriteLanes I15": ["att-9002-8", "att-9010-12"],
  "PART-pay-stress-9|disposal|Actors I29": ["att-9002-8", "att-9010-12"],
  "PART-transfers-stress-101|delivered-once|WriteLanes I15": ["att-101004-3"],
  "PART-transfers-stress-101|delivered-once|WriteLanes I16": ["att-101004-3"],
  "PART-transfers-stress-101|disposal|Actors I29": ["att-101004-3"],
  "PART-transfers-stress-101|lane-queue|WriteLanes I12": ["att-101004-3"],
  "PART-transfers-stress-104|delivered-once|Restore I6": ["att-104001-18"],
  "PART-transfers-stress-104|delivered-once|WriteLanes I15": [
    item("Bank/Transfers acct-2 transfer", 169),
    item("Bank/Transfers acct-2 transfer", 190),
    "att-104001-18",
    "att-104004-34",
    "att-104004-43",
  ],
  "PART-transfers-stress-104|delivered-once|WriteLanes I16": ["att-104001-18"],
  "PART-transfers-stress-104|disposal|Actors I32": ["att-104001-18"],
  "PART-transfers-stress-104|lane-queue|WriteLanes I12": ["att-104001-18"],
  "PART-transfers-stress-104|lane-queue|WriteLanes I8": ["att-104004-34", "att-104004-43"],
  "PART-transfers-stress-10|delivered-once|WriteLanes I15": ["att-10001-8"],
  "PART-transfers-stress-10|delivered-once|WriteLanes I16": ["att-10001-8"],
  "PART-transfers-stress-10|lane-queue|WriteLanes I12": ["att-10001-8"],
  "PART-transfers-stress-111-shrunk|delivered-once|WriteLanes I15": ["att-111000-3"],
  "PART-transfers-stress-111-shrunk|delivered-once|WriteLanes I16": ["att-111000-3"],
  "PART-transfers-stress-111-shrunk|disposal|Actors I29": ["att-111000-3"],
  "PART-transfers-stress-111-shrunk|lane-queue|WriteLanes I12": ["att-111000-3"],
  "PART-transfers-stress-111|delivered-once|WriteLanes I15": ["att-111000-8", "att-111003-4"],
  "PART-transfers-stress-111|delivered-once|WriteLanes I16": ["att-111000-8", "att-111003-4"],
  "PART-transfers-stress-111|disposal|Actors I29": ["att-111000-8"],
  "PART-transfers-stress-111|lane-queue|WriteLanes I12": ["att-111000-8", "att-111003-4"],
  "PART-transfers-stress-3|delivered-once|WriteLanes I15": ["att-3000-17"],
  "PART-transfers-stress-3|delivered-once|WriteLanes I16": ["att-3000-17"],
  "PART-transfers-stress-3|disposal|Actors I29": ["att-3000-17"],
  "PART-transfers-stress-3|lane-queue|WriteLanes I12": ["att-3000-17"],
  "PART-transfers-stress-5-shrunk|disposal|Actors I38": ["att-5000-5"],
  "PART-transfers-stress-7|lane-queue|WriteLanes I12": ["att-7003-9"],
  "PART-transfers-stress-9|delivered-once|WriteLanes I15": ["att-9003-8", "att-9004-29"],
  "PART-transfers-stress-9|delivered-once|WriteLanes I16": ["att-9003-8", "att-9004-29"],
  "PART-transfers-stress-9|disposal|Actors I29": ["att-9003-8", "att-9004-29"],
  "PART-transfers-stress-9|lane-queue|WriteLanes I12": ["att-9003-8", "att-9004-29"],
} satisfies Readonly<Record<string, ReadonlyArray<string | OwedItem>>>;

const BY_ROW: ReadonlyMap<string, ReadonlyArray<string | OwedItem>> = new Map(
  Object.entries(OWED_SUBJECTS),
);

/**
 * The exact breaks one owed row excuses: the Attempts (or, for a break with no Attempt, its
 * subject at its step) its production bug was seen to break at triage.
 *
 * **Gotchas**
 *
 * - The lists come from a production run: they record known failures as a change detector and
 *   are never an expected result, which comes from the Spec model alone.
 * - Ids and steps are deterministic per seed, so a production change that moves them leaves an
 *   item unbroken and forces a re-triage, and a new break on another item fails the run.
 */
export const owedItems = (id: string, check: string, invariant: string) =>
  (BY_ROW.get(`${id}|${check}|${invariant}`) ?? []).map((s) =>
    Predicate.isString(s) ? OwedItem.Attempt({ id: s }) : s,
  );

const I12 = ["lane-queue", "WriteLanes I12"] as const;
const I15 = ["delivered-once", "WriteLanes I15"] as const;
const I16 = ["delivered-once", "WriteLanes I16"] as const;
const I29 = ["disposal", "Actors I29"] as const;

const owing = (
  cases: ReadonlyArray<string>,
  checks: ReadonlyArray<readonly [string, string]>,
  why: string,
  owner: string,
) =>
  cases.flatMap((id) =>
    checks.map(([check, invariant]) => ({
      case: id,
      check,
      invariant,
      why,
      owner,
      items: owedItems(id, check, invariant),
    })),
  );

/**
 * Production's owed reds among the part scripts (Conformance R22): a generated script it fails by
 * a production bug a Task owns, as `productionOwed` lists hand cases. Each is checked to still fail
 * by its check and Invariant on its subjects, so a fix shows; every other script passes. A script
 * owes one row per check and Invariant it fails by, each failure on a subject its bug reached: a
 * re-send past its budget is refused (lane-queue I12), and where the spent retry's cancel released
 * the head, the re-send meets a gone head (lane-queue I1), so its later endings meet a Held head
 * (delivered-once I16, I15); a disposed identity's restored head is parked (delivered-once I15),
 * so its adoption never hears its restore (disposal, Actors I29).
 */
export const partsOwed: ReadonlyArray<PartOwed> = [
  ...owing(
    ["PART-transfers-stress-7", "MIX-sync+transfers+sign-in-stress-101", "PART-cells-stress-9"],
    [I12],
    RETRY_COUNT,
    "@task.V3.T19",
  ),
  ...owing(["PART-transfers-stress-10"], [I12, I16, I15], RETRY_COUNT, "@task.V3.T19"),
  ...owing(
    [3, 9, 101, 111].map((s) => `PART-transfers-stress-${s}`),
    [I12, I16, I15, I29],
    RETRY_COUNT,
    "@task.V3.T19",
  ),
  ...owing(
    ["PART-transfers-stress-104"],
    [
      I12,
      I16,
      I15,
      ["delivered-once", "Restore I6"],
      ["lane-queue", "WriteLanes I8"],
      ["disposal", "Actors I32"],
    ],
    RETRY_COUNT,
    "@task.V3.T19",
  ),
  ...owing(["PART-cells-stress-9"], [I29], RETRY_COUNT, "@task.V3.T19"),
  ...owing(
    ["MIX-sync+transfers+sign-in-stress-10"],
    [
      I12,
      I16,
      I15,
      I29,
      ["lane-queue", "WriteLanes I8"],
      ["lane-queue", "WriteLanes I1"],
      ["disposal", "Actors I32"],
      ["delivered-once", "Restore I6"],
    ],
    RETRY_COUNT,
    "@task.V3.T19",
  ),
  ...owing(["PART-pay-stress-112"], [I12, I16], RETRY_COUNT, "@task.V3.T19"),
  ...owing(
    [3, 12, 106, 112]
      .map((s) => `PART-pay-stress-${s}`)
      .concat(["PART-cells-stress-8", "PART-cells-stress-9"]),
    [["lane-queue", "WriteLanes I1"]],
    RETRY_COUNT,
    "@task.V3.T19",
  ),
  ...owing(["PART-cells-stress-9"], [I16, I15], RETRY_COUNT, "@task.V3.T19"),
  ...owing(
    [
      "PART-pay-stress-3",
      "PART-pay-stress-12",
      "PART-pay-stress-109",
      "PART-cells-stress-1",
      "PART-cells-stress-4",
      "PART-cells-stress-8",
    ],
    [I12, I16],
    RETRY_COUNT,
    "@task.V3.T19",
  ),
  ...owing(
    ["PART-pay-stress-106", "PART-pay-stress-110"],
    [I12, I16, ["delivered-once", "Restore I6"]],
    RETRY_COUNT,
    "@task.V3.T19",
  ),
  ...owing(
    [
      ...[
        1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 101, 102, 104, 105, 106, 107, 108, 109, 110, 111, 112,
      ].map((s) => `PART-pay-stress-${s}`),
      ...[1, 2, 3, 4, 6, 7, 8, 10, 11, 12, 101, 102, 104, 105, 106, 107, 108, 109, 110, 111].map(
        (s) => `PART-cells-stress-${s}`,
      ),
    ],
    [I15, I29],
    UNBOUND_RESTORE,
    "@task.V3.T54",
  ),
  ...owing(["PART-pay-stress-12"], [I15], UNBOUND_RESTORE, "@task.V3.T54"),
];

const REFUSED_UNENDED =
  "a forgotten or disposed actor's unacknowledged Attempt whose batch the store then refuses is never ended (only StorageFailure evidence), so the Runtime's disposal finds it still Unsent (WriteAhead R13, Actors R21, WriteLanes I27)";

/**
 * Production's owed reds among the kept regression scripts (Conformance I49), each a script it
 * fails by a bug a Task owns.
 */
export const regressionsOwed: ReadonlyArray<PartOwed> = [
  ...owing(["GEN-pay-search-25-shrunk"], [I15, I29], UNBOUND_RESTORE, "@task.V3.T54"),
  ...owing(["PART-transfers-stress-111-shrunk"], [I12, I16, I15, I29], RETRY_COUNT, "@task.V3.T19"),
  ...owing(
    ["PART-transfers-stress-5-shrunk"],
    [["disposal", "Actors I38"]],
    REFUSED_UNENDED,
    "@task.V3.T19",
  ),
  ...owing(
    ["PART-cells-stress-105-shrunk"],
    [["lane-queue", "WriteLanes I8"], I15, ["disposal", "Actors I38"]],
    `${REFUSED_UNENDED}; a disposed actor's adoption then mints on the lane its unended head still holds`,
    "@task.V3.T19",
  ),
];

/**
 * Every owed row of a script the part player plays: the generated part scripts' and the kept
 * regressions'. One rule ({@link excuses}) judges them all, by exact break, at every seed.
 */
export const owedRows: ReadonlyArray<PartOwed> = [...partsOwed, ...regressionsOwed];

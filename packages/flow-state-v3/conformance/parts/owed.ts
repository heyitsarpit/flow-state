// oxlint-disable lint-bomb/no-large-production-file -- the triaged Attempt-id table is data; the 128-bit seed in each id is what made it long
import { Data, Predicate } from "effect";
import type { Limit } from "../limits.ts";
import { VARIED_OWED } from "./owed-varied.ts";

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
 * Production's bug behind a closed head restored after an adoption's flush: the flush holds only
 * the adopted actor's record, not every dirty one, so a success not yet captured is lost at a
 * reload and its head comes back `unknown Restored` (WriteAhead I23; found by T61's first soak).
 */
export const PARTIAL_FLUSH =
  "an adoption's flush holds only the adopted actor's record, not every record dirty when it is issued, so a success not yet captured is lost at the reload and its closed head is restored unknown Restored (WriteAhead I23)";

const VARIED_109 = [
  "att-0000000000000000000000000001a9c8-1",
  "att-0000000000000000000000000001a9c8-6",
];

const OWED_SUBJECTS = {
  "PART-transfers-varied-2001-shrunk|delivered-once|WriteLanes I16": [
    "att-000000000000000000000000001e8868-1",
  ],
  "PART-transfers-varied-2001-shrunk|delivered-once|WriteLanes I15": [
    "att-000000000000000000000000001e8868-1",
  ],
  "MIX-sync+transfers+sign-in-stress-101|lane-queue|WriteLanes I12": [
    "att-00000000000000000000000000018a88-8",
  ],
  "MIX-sync+transfers+sign-in-stress-10|lane-queue|WriteLanes I12": [
    "att-00000000000000000000000000002711-2",
    "att-00000000000000000000000000002710-1",
  ],
  "MIX-sync+transfers+sign-in-stress-10|delivered-once|WriteLanes I16": [
    "att-00000000000000000000000000002711-2",
    "att-00000000000000000000000000002710-1",
  ],
  "MIX-sync+transfers+sign-in-stress-10|delivered-once|WriteLanes I15": [
    "att-00000000000000000000000000002711-2",
    "att-00000000000000000000000000002710-1",
    "att-00000000000000000000000000002715-3",
    item("Bank/Transfers acct-2 transfer", 131),
    item("Bank/Transfers acct-2 transfer", 177),
  ],
  "MIX-sync+transfers+sign-in-stress-10|lane-queue|WriteLanes I8": [
    "att-00000000000000000000000000002713-5",
    "att-00000000000000000000000000002715-3",
  ],
  "MIX-sync+transfers+sign-in-stress-10|lane-queue|WriteLanes I1": [
    "att-00000000000000000000000000002715-3",
  ],
  "MIX-sync+transfers+sign-in-stress-10|disposal|Actors I32": [
    "att-00000000000000000000000000002710-1",
  ],
  "MIX-sync+transfers+sign-in-stress-10|disposal|Actors I29": [
    "att-00000000000000000000000000002710-1",
  ],
  "PART-cells-stress-4|delivered-once|WriteLanes I15": ["att-00000000000000000000000000000fa2-2"],
  "PART-cells-stress-4|delivered-once|WriteLanes I16": ["att-00000000000000000000000000000fa2-2"],
  "PART-cells-stress-4|disposal|Actors I29": ["att-00000000000000000000000000000fa2-2"],
  "PART-cells-stress-4|lane-queue|WriteLanes I12": ["att-00000000000000000000000000000fa2-2"],
  "PART-cells-stress-8|delivered-once|WriteLanes I15": [
    "att-00000000000000000000000000001f40-2",
    "att-00000000000000000000000000001f40-3",
  ],
  "PART-cells-stress-8|delivered-once|WriteLanes I16": [
    "att-00000000000000000000000000001f40-2",
    "att-00000000000000000000000000001f40-3",
  ],
  "PART-cells-stress-8|disposal|Actors I29": ["att-00000000000000000000000000001f40-2"],
  "PART-cells-stress-8|lane-queue|WriteLanes I12": [
    "att-00000000000000000000000000001f40-2",
    "att-00000000000000000000000000001f40-3",
  ],
  // Persisting the lane when a re-send is invoked makes this and PART-transfers-varied-109 pass.
  "PART-cells-stress-9|lane-queue|WriteLanes I12": [
    "att-00000000000000000000000000002330-1",
    "att-00000000000000000000000000002330-3",
  ],
  "PART-cells-stress-9|lane-queue|WriteLanes I1": ["att-00000000000000000000000000002330-3"],
  "PART-cells-stress-9|delivered-once|WriteLanes I16": ["att-00000000000000000000000000002330-3"],
  "PART-cells-stress-9|delivered-once|WriteLanes I15": ["att-00000000000000000000000000002330-3"],
  ...Object.fromEntries(
    [
      "lane-queue|WriteLanes I12",
      "delivered-once|WriteLanes I16",
      "delivered-once|WriteLanes I15",
    ].flatMap((row) => [
      [`PART-cells-stress-9-shrunk|${row}`, ["att-00000000000000000000000000002328-3"]],
      [`PART-transfers-varied-109|${row}`, VARIED_109],
      [`PART-transfers-varied-109-shrunk|${row}`, ["att-0000000000000000000000000001a9c8-1"]],
    ]),
  ),
  "PART-transfers-varied-109|disposal|Actors I29": VARIED_109,
  "PART-transfers-varied-109-shrunk|disposal|Actors I29": [
    "att-0000000000000000000000000001a9c8-1",
  ],
  "PART-cells-stress-8|lane-queue|WriteLanes I1": ["att-00000000000000000000000000001f40-3"],
  "PART-pay-stress-3|lane-queue|WriteLanes I1": ["att-00000000000000000000000000000bbd-1"],
  "PART-pay-stress-12|lane-queue|WriteLanes I1": ["att-00000000000000000000000000002ee1-3"],
  "PART-pay-stress-106|lane-queue|WriteLanes I1": ["att-00000000000000000000000000019e1a-1"],
  "PART-pay-stress-112|lane-queue|WriteLanes I1": ["att-0000000000000000000000000001b584-2"],
  "PART-pay-stress-106|delivered-once|Restore I6": ["att-00000000000000000000000000019e16-2"],
  "PART-pay-stress-106|delivered-once|WriteLanes I15": [
    "att-00000000000000000000000000019e16-2",
    "att-00000000000000000000000000019e1a-1",
  ],
  "PART-pay-stress-106|delivered-once|WriteLanes I16": [
    "att-00000000000000000000000000019e16-2",
    "att-00000000000000000000000000019e1a-1",
  ],
  "PART-pay-stress-106|disposal|Actors I29": ["att-00000000000000000000000000019e16-2"],
  "PART-pay-stress-106|lane-queue|WriteLanes I12": [
    "att-00000000000000000000000000019e16-2",
    "att-00000000000000000000000000019e1a-1",
  ],
  "PART-pay-stress-109|delivered-once|WriteLanes I15": ["att-0000000000000000000000000001a9c9-2"],
  "PART-pay-stress-109|delivered-once|WriteLanes I16": ["att-0000000000000000000000000001a9c9-2"],
  "PART-pay-stress-109|disposal|Actors I29": ["att-0000000000000000000000000001a9c9-2"],
  "PART-pay-stress-109|lane-queue|WriteLanes I12": ["att-0000000000000000000000000001a9c9-2"],
  "PART-pay-stress-110|delivered-once|Restore I6": ["att-0000000000000000000000000001adb0-2"],
  "PART-pay-stress-110|delivered-once|WriteLanes I15": ["att-0000000000000000000000000001adb0-2"],
  "PART-pay-stress-110|delivered-once|WriteLanes I16": ["att-0000000000000000000000000001adb0-2"],
  "PART-pay-stress-110|disposal|Actors I29": ["att-0000000000000000000000000001adb0-2"],
  "PART-pay-stress-110|lane-queue|WriteLanes I12": ["att-0000000000000000000000000001adb0-2"],
  "PART-pay-stress-112|delivered-once|WriteLanes I15": ["att-0000000000000000000000000001b584-2"],
  "PART-pay-stress-112|lane-queue|WriteLanes I12": ["att-0000000000000000000000000001b584-2"],
  "PART-pay-stress-112|delivered-once|WriteLanes I16": ["att-0000000000000000000000000001b584-2"],
  "PART-pay-stress-12|delivered-once|WriteLanes I15": ["att-00000000000000000000000000002ee1-3"],
  "PART-pay-stress-12|delivered-once|WriteLanes I16": ["att-00000000000000000000000000002ee1-3"],
  "PART-pay-stress-12|lane-queue|WriteLanes I12": ["att-00000000000000000000000000002ee1-3"],
  "PART-pay-stress-3|delivered-once|WriteLanes I15": [
    "att-00000000000000000000000000000bbb-2",
    "att-00000000000000000000000000000bbd-1",
  ],
  "PART-pay-stress-3|delivered-once|WriteLanes I16": [
    "att-00000000000000000000000000000bbb-2",
    "att-00000000000000000000000000000bbd-1",
  ],
  "PART-pay-stress-3|disposal|Actors I29": ["att-00000000000000000000000000000bbb-2"],
  "PART-pay-stress-3|lane-queue|WriteLanes I12": [
    "att-00000000000000000000000000000bbb-2",
    "att-00000000000000000000000000000bbd-1",
  ],
  "PART-transfers-stress-101|delivered-once|WriteLanes I15": [
    "att-00000000000000000000000000018a8c-1",
  ],
  "PART-transfers-stress-101|delivered-once|WriteLanes I16": [
    "att-00000000000000000000000000018a8c-1",
  ],
  "PART-transfers-stress-101|disposal|Actors I29": ["att-00000000000000000000000000018a8c-1"],
  "PART-transfers-stress-101|lane-queue|WriteLanes I12": ["att-00000000000000000000000000018a8c-1"],
  "PART-transfers-stress-104|delivered-once|Restore I6": ["att-00000000000000000000000000019641-3"],
  "PART-transfers-stress-104|delivered-once|WriteLanes I15": [
    item("Bank/Transfers acct-2 transfer", 169),
    item("Bank/Transfers acct-2 transfer", 190),
    "att-00000000000000000000000000019641-3",
    "att-00000000000000000000000000019644-5",
    "att-00000000000000000000000000019644-7",
  ],
  "PART-transfers-stress-104|delivered-once|WriteLanes I16": [
    "att-00000000000000000000000000019641-3",
  ],
  "PART-transfers-stress-104|disposal|Actors I32": ["att-00000000000000000000000000019641-3"],
  "PART-transfers-stress-104|lane-queue|WriteLanes I12": ["att-00000000000000000000000000019641-3"],
  "PART-transfers-stress-104|lane-queue|WriteLanes I8": [
    "att-00000000000000000000000000019644-5",
    "att-00000000000000000000000000019644-7",
  ],
  "PART-transfers-stress-10|delivered-once|WriteLanes I15": [
    "att-00000000000000000000000000002711-2",
  ],
  "PART-transfers-stress-10|delivered-once|WriteLanes I16": [
    "att-00000000000000000000000000002711-2",
  ],
  "PART-transfers-stress-10|lane-queue|WriteLanes I12": ["att-00000000000000000000000000002711-2"],
  "PART-transfers-stress-111-shrunk|delivered-once|WriteLanes I15": [
    "att-0000000000000000000000000001b198-1",
  ],
  "PART-transfers-stress-111-shrunk|delivered-once|WriteLanes I16": [
    "att-0000000000000000000000000001b198-1",
  ],
  "PART-transfers-stress-111-shrunk|disposal|Actors I29": [
    "att-0000000000000000000000000001b198-1",
  ],
  "PART-transfers-stress-111-shrunk|lane-queue|WriteLanes I12": [
    "att-0000000000000000000000000001b198-1",
  ],
  "PART-transfers-stress-111|delivered-once|WriteLanes I15": [
    "att-0000000000000000000000000001b198-2",
    "att-0000000000000000000000000001b19b-1",
  ],
  "PART-transfers-stress-111|delivered-once|WriteLanes I16": [
    "att-0000000000000000000000000001b198-2",
    "att-0000000000000000000000000001b19b-1",
  ],
  "PART-transfers-stress-111|disposal|Actors I29": ["att-0000000000000000000000000001b198-2"],
  "PART-transfers-stress-111|lane-queue|WriteLanes I12": [
    "att-0000000000000000000000000001b198-2",
    "att-0000000000000000000000000001b19b-1",
  ],
  "PART-transfers-stress-3|delivered-once|WriteLanes I15": [
    "att-00000000000000000000000000000bb8-4",
  ],
  "PART-transfers-stress-3|delivered-once|WriteLanes I16": [
    "att-00000000000000000000000000000bb8-4",
  ],
  "PART-transfers-stress-3|disposal|Actors I29": ["att-00000000000000000000000000000bb8-4"],
  "PART-transfers-stress-3|lane-queue|WriteLanes I12": ["att-00000000000000000000000000000bb8-4"],
  "PART-transfers-stress-7|lane-queue|WriteLanes I12": ["att-00000000000000000000000000001b5b-1"],
  "PART-transfers-stress-9|delivered-once|WriteLanes I15": [
    "att-0000000000000000000000000000232b-2",
    "att-0000000000000000000000000000232c-6",
  ],
  "PART-transfers-stress-9|delivered-once|WriteLanes I16": [
    "att-0000000000000000000000000000232b-2",
    "att-0000000000000000000000000000232c-6",
  ],
  "PART-transfers-stress-9|disposal|Actors I29": [
    "att-0000000000000000000000000000232b-2",
    "att-0000000000000000000000000000232c-6",
  ],
  "PART-transfers-stress-9|lane-queue|WriteLanes I12": [
    "att-0000000000000000000000000000232b-2",
    "att-0000000000000000000000000000232c-6",
  ],
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
  ...owing(["PART-transfers-varied-109"], [I12, I16, I15, I29], RETRY_COUNT, "@task.V3.T19"),
  ...owing(["PART-cells-stress-9"], [I16, I15], RETRY_COUNT, "@task.V3.T19"),
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
  ...owing(
    [
      "PART-pay-stress-3",
      "PART-pay-stress-12",
      "PART-pay-stress-109",
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
  // A restored head's later endings, once the restore owed at the boot (A2 fixed that): the spent
  // retry's re-send still breaks them, cleared by capturing a re-send's retry count.
  ...owing(
    [
      ...[3, 106, 109, 110].map((s) => `PART-pay-stress-${s}`),
      "PART-cells-stress-4",
      "PART-cells-stress-8",
    ],
    [I15, I29],
    RETRY_COUNT,
    "@task.V3.T19",
  ),
  ...owing(["PART-pay-stress-112", "PART-pay-stress-12"], [I15], RETRY_COUNT, "@task.V3.T19"),
  ...VARIED_OWED.map(({ id, check, invariant, items }) => ({
    case: id,
    check,
    invariant,
    why: RETRY_COUNT,
    owner: "@task.V3.T19",
    items: items.map((i) =>
      i._tag === "Attempt" ? OwedItem.Attempt({ id: i.id }) : item(i.subject, i.step),
    ),
  })),
];

/**
 * Production's owed reds among the kept regression scripts (Conformance I49), each a script it
 * fails by a bug a Task owns. PART-transfers-stress-5-shrunk and PART-cells-stress-105-shrunk
 * pass with none: a disposed actor's refused Unsent head now ends NotSent and
 * waits for its next start.
 */
export const regressionsOwed: ReadonlyArray<PartOwed> = [
  ...owing(["PART-transfers-varied-2001-shrunk"], [I16, I15], PARTIAL_FLUSH, "@task.V3.T54"),
  ...owing(["PART-transfers-stress-111-shrunk"], [I12, I16, I15, I29], RETRY_COUNT, "@task.V3.T19"),
  ...owing(["PART-cells-stress-9-shrunk"], [I12, I16, I15], RETRY_COUNT, "@task.V3.T19"),
  ...owing(["PART-transfers-varied-109-shrunk"], [I12, I16, I15, I29], RETRY_COUNT, "@task.V3.T19"),
];

/**
 * Every owed row of a script the part player plays: the generated part scripts' and the kept
 * regressions'. One rule ({@link excuses}) judges them all, by exact break, at every seed.
 */
export const owedRows: ReadonlyArray<PartOwed> = [...partsOwed, ...regressionsOwed];

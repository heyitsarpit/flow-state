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
 * Production's bug behind a disposed identity's Held head at a boot: the boot restores and parks
 * its unbound head, so the adopting incarnation's start gets nothing (Restore R1, Actors I40: a
 * boot delivers and parks nothing).
 */
export const UNBOUND_RESTORE =
  "the boot restores and parks a disposed identity's unbound Held head, so the adopting incarnation's start gets nothing (Restore R1, Actors I40: a boot delivers and parks nothing)";

/**
 * Production's bug behind a closed head restored after an adoption's flush: the flush holds only
 * the adopted actor's record, not every dirty one, so a success not yet captured is lost at a
 * reload and its head comes back `unknown Restored` (WriteAhead I23; found by T61's first soak).
 */
export const PARTIAL_FLUSH =
  "an adoption's flush holds only the adopted actor's record, not every record dirty when it is issued, so a success not yet captured is lost at the reload and its closed head is restored unknown Restored (WriteAhead I23)";

const OWED_SUBJECTS = {
  "PART-transfers-varied-2001-shrunk|delivered-once|WriteLanes I16": [
    "att-000000000000000000000000001e8868-1",
  ],
  "PART-transfers-varied-2001-shrunk|delivered-once|WriteLanes I15": [
    "att-000000000000000000000000001e8868-1",
  ],
  "GEN-pay-search-25-shrunk|delivered-once|WriteLanes I15": [
    "att-000000000000000000000000000061a8-1",
  ],
  "GEN-pay-search-25-shrunk|disposal|Actors I29": ["att-000000000000000000000000000061a8-1"],
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
  "MIX-sync+transfers+sign-in-stress-10|delivered-once|Restore I6": [
    "att-00000000000000000000000000002710-1",
  ],
  "PART-cells-stress-101|delivered-once|WriteLanes I15": ["att-00000000000000000000000000018a89-1"],
  "PART-cells-stress-101|disposal|Actors I29": ["att-00000000000000000000000000018a89-1"],
  "PART-cells-stress-102|delivered-once|WriteLanes I15": [
    "att-00000000000000000000000000018e71-2",
    "att-00000000000000000000000000018e76-2",
    "att-00000000000000000000000000018e76-4",
    "att-00000000000000000000000000018e76-1",
  ],
  "PART-cells-stress-102|disposal|Actors I29": [
    "att-00000000000000000000000000018e71-2",
    "att-00000000000000000000000000018e76-2",
    "att-00000000000000000000000000018e76-4",
    "att-00000000000000000000000000018e76-1",
  ],
  "PART-cells-stress-104|delivered-once|WriteLanes I15": [
    "att-00000000000000000000000000019640-1",
    "att-00000000000000000000000000019644-2",
  ],
  "PART-cells-stress-104|disposal|Actors I29": [
    "att-00000000000000000000000000019640-1",
    "att-00000000000000000000000000019644-2",
  ],
  "PART-cells-stress-105|delivered-once|WriteLanes I15": [
    "att-00000000000000000000000000019a28-1",
    "att-00000000000000000000000000019a2f-1",
  ],
  "PART-cells-stress-105|disposal|Actors I29": [
    "att-00000000000000000000000000019a28-1",
    "att-00000000000000000000000000019a2f-1",
  ],
  "PART-cells-stress-106|delivered-once|WriteLanes I15": [
    "att-00000000000000000000000000019e10-1",
    "att-00000000000000000000000000019e19-1",
  ],
  "PART-cells-stress-106|disposal|Actors I29": [
    "att-00000000000000000000000000019e10-1",
    "att-00000000000000000000000000019e19-1",
  ],
  "PART-cells-stress-107|delivered-once|WriteLanes I15": ["att-0000000000000000000000000001a1fb-2"],
  "PART-cells-stress-107|disposal|Actors I29": ["att-0000000000000000000000000001a1fb-2"],
  "PART-cells-stress-108|delivered-once|WriteLanes I15": ["att-0000000000000000000000000001a5e1-2"],
  "PART-cells-stress-108|disposal|Actors I29": ["att-0000000000000000000000000001a5e1-2"],
  "PART-cells-stress-109|delivered-once|WriteLanes I15": [
    "att-0000000000000000000000000001a9c8-1",
    "att-0000000000000000000000000001a9d8-1",
  ],
  "PART-cells-stress-109|disposal|Actors I29": [
    "att-0000000000000000000000000001a9c8-1",
    "att-0000000000000000000000000001a9d8-1",
  ],
  "PART-cells-stress-10|delivered-once|WriteLanes I15": [
    "att-00000000000000000000000000002711-1",
    "att-00000000000000000000000000002713-1",
  ],
  "PART-cells-stress-10|disposal|Actors I29": [
    "att-00000000000000000000000000002711-1",
    "att-00000000000000000000000000002713-1",
  ],
  "PART-cells-stress-110|delivered-once|WriteLanes I15": [
    "att-0000000000000000000000000001adb2-1",
    "att-0000000000000000000000000001adbb-1",
  ],
  "PART-cells-stress-110|disposal|Actors I29": [
    "att-0000000000000000000000000001adb2-1",
    "att-0000000000000000000000000001adbb-1",
  ],
  "PART-cells-stress-111|delivered-once|WriteLanes I15": ["att-0000000000000000000000000001b199-2"],
  "PART-cells-stress-111|disposal|Actors I29": ["att-0000000000000000000000000001b199-2"],
  "PART-cells-stress-11|delivered-once|WriteLanes I15": ["att-00000000000000000000000000002afd-2"],
  "PART-cells-stress-11|disposal|Actors I29": ["att-00000000000000000000000000002afd-2"],
  "PART-cells-stress-12|delivered-once|WriteLanes I15": ["att-00000000000000000000000000002ee1-1"],
  "PART-cells-stress-12|disposal|Actors I29": ["att-00000000000000000000000000002ee1-1"],
  "PART-cells-stress-1|delivered-once|WriteLanes I15": [
    "att-000000000000000000000000000003ee-1",
    "att-000000000000000000000000000003f0-1",
    "att-000000000000000000000000000003f4-1",
  ],
  "PART-cells-stress-1|delivered-once|WriteLanes I16": ["att-000000000000000000000000000003ee-1"],
  "PART-cells-stress-1|disposal|Actors I29": [
    "att-000000000000000000000000000003ee-1",
    "att-000000000000000000000000000003f0-1",
    "att-000000000000000000000000000003f4-1",
  ],
  "PART-cells-stress-1|lane-queue|WriteLanes I12": ["att-000000000000000000000000000003ee-1"],
  "PART-cells-stress-2|delivered-once|WriteLanes I15": [
    "att-000000000000000000000000000007d2-1",
    "att-000000000000000000000000000007d4-1",
  ],
  "PART-cells-stress-2|disposal|Actors I29": [
    "att-000000000000000000000000000007d2-1",
    "att-000000000000000000000000000007d4-1",
  ],
  "PART-cells-stress-3|delivered-once|WriteLanes I15": [
    "att-00000000000000000000000000000bb8-1",
    "att-00000000000000000000000000000bb9-1",
  ],
  "PART-cells-stress-3|disposal|Actors I29": [
    "att-00000000000000000000000000000bb8-1",
    "att-00000000000000000000000000000bb9-1",
  ],
  "PART-cells-stress-4|delivered-once|WriteLanes I15": [
    "att-00000000000000000000000000000fa0-1",
    "att-00000000000000000000000000000fa2-2",
  ],
  "PART-cells-stress-4|delivered-once|WriteLanes I16": ["att-00000000000000000000000000000fa2-2"],
  "PART-cells-stress-4|disposal|Actors I29": [
    "att-00000000000000000000000000000fa0-1",
    "att-00000000000000000000000000000fa2-2",
  ],
  "PART-cells-stress-4|lane-queue|WriteLanes I12": ["att-00000000000000000000000000000fa2-2"],
  "PART-cells-stress-6|delivered-once|WriteLanes I15": ["att-00000000000000000000000000001774-1"],
  "PART-cells-stress-6|disposal|Actors I29": ["att-00000000000000000000000000001774-1"],
  "PART-cells-stress-7|delivered-once|WriteLanes I15": [
    "att-00000000000000000000000000001b58-2",
    "att-00000000000000000000000000001b60-1",
  ],
  "PART-cells-stress-7|disposal|Actors I29": [
    "att-00000000000000000000000000001b58-2",
    "att-00000000000000000000000000001b60-1",
  ],
  "PART-cells-stress-8|delivered-once|WriteLanes I15": [
    "att-00000000000000000000000000001f40-2",
    "att-00000000000000000000000000001f40-3",
    "att-00000000000000000000000000001f41-1",
    "att-00000000000000000000000000001f48-1",
  ],
  "PART-cells-stress-8|delivered-once|WriteLanes I16": [
    "att-00000000000000000000000000001f40-2",
    "att-00000000000000000000000000001f40-3",
  ],
  "PART-cells-stress-8|disposal|Actors I29": [
    "att-00000000000000000000000000001f40-2",
    "att-00000000000000000000000000001f41-1",
    "att-00000000000000000000000000001f48-1",
  ],
  "PART-cells-stress-8|lane-queue|WriteLanes I12": [
    "att-00000000000000000000000000001f40-2",
    "att-00000000000000000000000000001f40-3",
  ],
  "PART-cells-stress-9|disposal|Actors I29": ["att-0000000000000000000000000000232a-1"],
  "PART-cells-stress-9|lane-queue|WriteLanes I12": [
    "att-0000000000000000000000000000232a-1",
    "att-00000000000000000000000000002330-2",
  ],
  "PART-cells-stress-9|lane-queue|WriteLanes I1": ["att-00000000000000000000000000002330-2"],
  "PART-cells-stress-9|delivered-once|WriteLanes I16": ["att-00000000000000000000000000002330-2"],
  "PART-cells-stress-9|delivered-once|WriteLanes I15": ["att-00000000000000000000000000002330-2"],
  "PART-cells-stress-8|lane-queue|WriteLanes I1": ["att-00000000000000000000000000001f40-3"],
  "PART-pay-stress-3|lane-queue|WriteLanes I1": ["att-00000000000000000000000000000bbd-1"],
  "PART-pay-stress-12|lane-queue|WriteLanes I1": ["att-00000000000000000000000000002ee1-3"],
  "PART-pay-stress-106|lane-queue|WriteLanes I1": ["att-00000000000000000000000000019e1a-1"],
  "PART-pay-stress-112|lane-queue|WriteLanes I1": ["att-0000000000000000000000000001b584-2"],
  "PART-pay-stress-101|delivered-once|WriteLanes I15": ["att-00000000000000000000000000018a8c-1"],
  "PART-pay-stress-101|disposal|Actors I29": ["att-00000000000000000000000000018a8c-1"],
  "PART-pay-stress-102|delivered-once|WriteLanes I15": [
    "att-00000000000000000000000000018e71-1",
    "att-00000000000000000000000000018e77-1",
  ],
  "PART-pay-stress-102|disposal|Actors I29": [
    "att-00000000000000000000000000018e71-1",
    "att-00000000000000000000000000018e77-1",
  ],
  "PART-pay-stress-104|delivered-once|WriteLanes I15": ["att-00000000000000000000000000019640-2"],
  "PART-pay-stress-104|disposal|Actors I29": ["att-00000000000000000000000000019640-2"],
  "PART-pay-stress-105|delivered-once|WriteLanes I15": [
    "att-00000000000000000000000000019a29-1",
    "att-00000000000000000000000000019a2f-1",
  ],
  "PART-pay-stress-105|disposal|Actors I29": [
    "att-00000000000000000000000000019a29-1",
    "att-00000000000000000000000000019a2f-1",
  ],
  "PART-pay-stress-106|delivered-once|Restore I6": ["att-00000000000000000000000000019e16-2"],
  "PART-pay-stress-106|delivered-once|WriteLanes I15": [
    "att-00000000000000000000000000019e11-1",
    "att-00000000000000000000000000019e16-2",
    "att-00000000000000000000000000019e1a-1",
  ],
  "PART-pay-stress-106|delivered-once|WriteLanes I16": [
    "att-00000000000000000000000000019e16-2",
    "att-00000000000000000000000000019e1a-1",
  ],
  "PART-pay-stress-106|disposal|Actors I29": [
    "att-00000000000000000000000000019e11-1",
    "att-00000000000000000000000000019e16-2",
  ],
  "PART-pay-stress-106|lane-queue|WriteLanes I12": [
    "att-00000000000000000000000000019e16-2",
    "att-00000000000000000000000000019e1a-1",
  ],
  "PART-pay-stress-107|delivered-once|WriteLanes I15": ["att-0000000000000000000000000001a1fb-1"],
  "PART-pay-stress-107|disposal|Actors I29": ["att-0000000000000000000000000001a1fb-1"],
  "PART-pay-stress-108|delivered-once|WriteLanes I15": ["att-0000000000000000000000000001a5e3-1"],
  "PART-pay-stress-108|disposal|Actors I29": ["att-0000000000000000000000000001a5e3-1"],
  "PART-pay-stress-109|delivered-once|WriteLanes I15": [
    "att-0000000000000000000000000001a9c9-2",
    "att-0000000000000000000000000001a9c9-3",
    "att-0000000000000000000000000001a9c9-5",
  ],
  "PART-pay-stress-109|delivered-once|WriteLanes I16": ["att-0000000000000000000000000001a9c9-2"],
  "PART-pay-stress-109|disposal|Actors I29": [
    "att-0000000000000000000000000001a9c9-2",
    "att-0000000000000000000000000001a9c9-3",
    "att-0000000000000000000000000001a9c9-5",
  ],
  "PART-pay-stress-109|lane-queue|WriteLanes I12": ["att-0000000000000000000000000001a9c9-2"],
  "PART-pay-stress-10|delivered-once|WriteLanes I15": [
    "att-00000000000000000000000000002710-1",
    "att-00000000000000000000000000002716-1",
  ],
  "PART-pay-stress-10|disposal|Actors I29": [
    "att-00000000000000000000000000002710-1",
    "att-00000000000000000000000000002716-1",
  ],
  "PART-pay-stress-110|delivered-once|Restore I6": ["att-0000000000000000000000000001adb0-2"],
  "PART-pay-stress-110|delivered-once|WriteLanes I15": [
    "att-0000000000000000000000000001adb0-2",
    "att-0000000000000000000000000001adb7-1",
  ],
  "PART-pay-stress-110|delivered-once|WriteLanes I16": ["att-0000000000000000000000000001adb0-2"],
  "PART-pay-stress-110|disposal|Actors I29": [
    "att-0000000000000000000000000001adb0-2",
    "att-0000000000000000000000000001adb7-1",
  ],
  "PART-pay-stress-110|lane-queue|WriteLanes I12": ["att-0000000000000000000000000001adb0-2"],
  "PART-pay-stress-111|delivered-once|WriteLanes I15": ["att-0000000000000000000000000001b199-1"],
  "PART-pay-stress-111|disposal|Actors I29": ["att-0000000000000000000000000001b199-1"],
  "PART-pay-stress-112|delivered-once|WriteLanes I15": [
    "att-0000000000000000000000000001b583-1",
    "att-0000000000000000000000000001b584-2",
  ],
  "PART-pay-stress-112|disposal|Actors I29": [
    "att-0000000000000000000000000001b583-1",
    "att-0000000000000000000000000001b584-2",
  ],
  "PART-pay-stress-112|lane-queue|WriteLanes I12": ["att-0000000000000000000000000001b584-2"],
  "PART-pay-stress-112|delivered-once|WriteLanes I16": ["att-0000000000000000000000000001b584-2"],
  "PART-pay-stress-11|delivered-once|WriteLanes I15": ["att-00000000000000000000000000002afb-1"],
  "PART-pay-stress-11|disposal|Actors I29": ["att-00000000000000000000000000002afb-1"],
  "PART-pay-stress-12|delivered-once|WriteLanes I15": ["att-00000000000000000000000000002ee1-3"],
  "PART-pay-stress-12|delivered-once|WriteLanes I16": ["att-00000000000000000000000000002ee1-3"],
  "PART-pay-stress-12|lane-queue|WriteLanes I12": ["att-00000000000000000000000000002ee1-3"],
  "PART-pay-stress-1|delivered-once|WriteLanes I15": [
    "att-000000000000000000000000000003e8-1",
    "att-000000000000000000000000000003ee-1",
  ],
  "PART-pay-stress-1|disposal|Actors I29": [
    "att-000000000000000000000000000003e8-1",
    "att-000000000000000000000000000003ee-1",
  ],
  "PART-pay-stress-2|delivered-once|WriteLanes I15": [
    "att-000000000000000000000000000007d0-2",
    "att-000000000000000000000000000007d0-3",
  ],
  "PART-pay-stress-2|disposal|Actors I29": [
    "att-000000000000000000000000000007d0-2",
    "att-000000000000000000000000000007d0-3",
  ],
  "PART-pay-stress-3|delivered-once|WriteLanes I15": [
    "att-00000000000000000000000000000bb8-1",
    "att-00000000000000000000000000000bbb-2",
    "att-00000000000000000000000000000bbb-3",
    "att-00000000000000000000000000000bbd-1",
  ],
  "PART-pay-stress-3|delivered-once|WriteLanes I16": [
    "att-00000000000000000000000000000bbb-2",
    "att-00000000000000000000000000000bbd-1",
  ],
  "PART-pay-stress-3|disposal|Actors I29": [
    "att-00000000000000000000000000000bb8-1",
    "att-00000000000000000000000000000bbb-2",
    "att-00000000000000000000000000000bbb-3",
    "att-00000000000000000000000000000bbd-1",
  ],
  "PART-pay-stress-3|lane-queue|WriteLanes I12": [
    "att-00000000000000000000000000000bbb-2",
    "att-00000000000000000000000000000bbd-1",
  ],
  "PART-pay-stress-4|delivered-once|WriteLanes I15": [
    "att-00000000000000000000000000000fa6-1",
    "att-00000000000000000000000000000fa9-1",
  ],
  "PART-pay-stress-4|disposal|Actors I29": [
    "att-00000000000000000000000000000fa6-1",
    "att-00000000000000000000000000000fa9-1",
  ],
  "PART-pay-stress-5|delivered-once|WriteLanes I15": ["att-00000000000000000000000000001389-1"],
  "PART-pay-stress-5|disposal|Actors I29": ["att-00000000000000000000000000001389-1"],
  "PART-pay-stress-6|delivered-once|WriteLanes I15": [
    "att-00000000000000000000000000001771-1",
    "att-00000000000000000000000000001781-1",
  ],
  "PART-pay-stress-6|disposal|Actors I29": [
    "att-00000000000000000000000000001771-1",
    "att-00000000000000000000000000001781-1",
  ],
  "PART-pay-stress-7|delivered-once|WriteLanes I15": [
    "att-00000000000000000000000000001b58-2",
    "att-00000000000000000000000000001b58-4",
  ],
  "PART-pay-stress-7|disposal|Actors I29": [
    "att-00000000000000000000000000001b58-2",
    "att-00000000000000000000000000001b58-4",
  ],
  "PART-pay-stress-8|delivered-once|WriteLanes I15": [
    "att-00000000000000000000000000001f40-1",
    "att-00000000000000000000000000001f4c-2",
    "att-00000000000000000000000000001f4e-1",
  ],
  "PART-pay-stress-8|disposal|Actors I29": [
    "att-00000000000000000000000000001f40-1",
    "att-00000000000000000000000000001f4c-2",
    "att-00000000000000000000000000001f4e-1",
  ],
  "PART-pay-stress-9|delivered-once|WriteLanes I15": [
    "att-0000000000000000000000000000232a-1",
    "att-00000000000000000000000000002332-1",
  ],
  "PART-pay-stress-9|disposal|Actors I29": [
    "att-0000000000000000000000000000232a-1",
    "att-00000000000000000000000000002332-1",
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
  ...VARIED_OWED.map(({ id, check, invariant, root, items }) => ({
    case: id,
    check,
    invariant,
    why: root === "retry" ? RETRY_COUNT : UNBOUND_RESTORE,
    owner: root === "retry" ? "@task.V3.T19" : "@task.V3.T54",
    items: items.map((i) =>
      i._tag === "Attempt" ? OwedItem.Attempt({ id: i.id }) : item(i.subject, i.step),
    ),
  })),
];

/**
 * Production's owed reds among the kept regression scripts (Conformance I49), each a script it
 * fails by a bug a Task owns. PART-transfers-stress-5-shrunk and PART-cells-stress-105-shrunk
 * pass with none since T54's A-2: a disposed actor's refused Unsent head now ends NotSent and
 * waits for its next start.
 */
export const regressionsOwed: ReadonlyArray<PartOwed> = [
  ...owing(["GEN-pay-search-25-shrunk"], [I15, I29], UNBOUND_RESTORE, "@task.V3.T54"),
  ...owing(["PART-transfers-varied-2001-shrunk"], [I16, I15], PARTIAL_FLUSH, "@task.V3.T54"),
  ...owing(["PART-transfers-stress-111-shrunk"], [I12, I16, I15, I29], RETRY_COUNT, "@task.V3.T19"),
];

/**
 * Every owed row of a script the part player plays: the generated part scripts' and the kept
 * regressions'. One rule ({@link excuses}) judges them all, by exact break, at every seed.
 */
export const owedRows: ReadonlyArray<PartOwed> = [...partsOwed, ...regressionsOwed];

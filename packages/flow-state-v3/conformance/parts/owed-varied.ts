import { Schema } from "effect";

const Root = Schema.Literals(["retry"]);

/**
 * The root a varied or new-mix script's owed row traces to: production's re-send past its budget
 * across a reload (`retry`, @task.V3.T19).
 */
export type VariedRoot = "retry";

/**
 * Each first-break signature of the varied reds (checks, Invariants and the move), with the root
 * its traced representative showed (T61, review M1): the soak run reports these as known and
 * fails on any other. Representatives, in order: PART-transfers-varied-4 (a spent retry re-sent at
 * the ack); PART-cells-varied-110 and MIX-sync+transfers+sign-in+pay-stress-101 (a restored
 * head's handler retries where the model gives up); PART-pay-varied-103 (an adoption after a
 * spent-budget retry); PART-transfers-varied-2001 (`flush`: an adoption's flush holds only its own
 * record, @task.V3.T54, kept as a regression); PART-cells-stress-105-shrunk and the soak's
 * PART-pay-stress-5000 (`refused`: a disposed actor's refused Unsent head is never ended, so its
 * adoption mints on a busy lane, @task.V3.T19, kept as a regression).
 */
export const TRIAGED_SIGNATURES: ReadonlyMap<string, VariedRoot | "flush" | "refused"> = new Map([
  ["lane-queue WriteLanes I12 at ack", "retry"],
  ["lane-queue WriteLanes I12 at reload", "retry"],
  ["lane-queue WriteLanes I12 at end of case reload", "retry"],
  ["disposal Actors I29 at ensure", "retry"],
  ["delivered-once WriteLanes I15,delivered-once WriteLanes I16 at reload", "flush"],
  ["delivered-once WriteLanes I15,lane-queue WriteLanes I8 at send PayRequested", "refused"],
]);

/**
 * One exact break: an Attempt id, or a subject with no Attempt and the step it broke at.
 */
export type VariedItem =
  | { readonly _tag: "Attempt"; readonly id: string }
  | { readonly _tag: "Item"; readonly subject: string; readonly step: number };

/**
 * One owed row of a varied or new-mix script: its script, check, Invariant, root and breaks.
 */
export type VariedRow = {
  readonly id: string;
  readonly check: string;
  readonly invariant: string;
  readonly root: VariedRoot;
  readonly items: ReadonlyArray<VariedItem>;
};

/**
 * The rows as triaged with the trace mode (T61), one line each: `script|check|Invariant|root|`
 * then the breaks, `;`-separated, an Attempt id or `subject@step`. Each script's first break is
 * the root; its later breaks on the same subjects follow from it.
 *
 * **Gotchas**
 *
 * - The lists come from a production run: a change detector, never an expected result.
 */
const ROWS: ReadonlyArray<string> = [
  "PART-transfers-varied-2|lane-queue|WriteLanes I12|retry|att-000000000000000000000000000007d0-4",
  "PART-transfers-varied-2|delivered-once|WriteLanes I16|retry|att-000000000000000000000000000007d0-4",
  "PART-transfers-varied-2|delivered-once|WriteLanes I15|retry|att-000000000000000000000000000007d0-4",
  "PART-transfers-varied-2|disposal|Actors I32|retry|att-000000000000000000000000000007d0-4",
  "PART-transfers-varied-4|lane-queue|WriteLanes I12|retry|att-00000000000000000000000000000fa0-4",
  "PART-transfers-varied-4|disposal|Actors I32|retry|att-00000000000000000000000000000fa0-4",
  "PART-transfers-varied-4|delivered-once|WriteLanes I16|retry|att-00000000000000000000000000000fa0-4",
  "PART-transfers-varied-4|delivered-once|WriteLanes I15|retry|att-00000000000000000000000000000fa0-4",
  "PART-transfers-varied-4|disposal|Actors I29|retry|att-00000000000000000000000000000fa0-4",
  "PART-pay-varied-11|delivered-once|WriteLanes I15|retry|att-00000000000000000000000000002af8-2;att-00000000000000000000000000002af9-1",
  "PART-pay-varied-11|disposal|Actors I29|retry|att-00000000000000000000000000002af8-2",
  "PART-pay-varied-11|lane-queue|WriteLanes I12|retry|att-00000000000000000000000000002af8-2;att-00000000000000000000000000002af9-1",
  "PART-pay-varied-11|lane-queue|WriteLanes I1|retry|att-00000000000000000000000000002af9-1",
  "PART-pay-varied-11|delivered-once|WriteLanes I16|retry|att-00000000000000000000000000002af9-1;att-00000000000000000000000000002af8-2",
  "PART-cells-varied-1|lane-queue|WriteLanes I12|retry|att-000000000000000000000000000003e9-2",
  "PART-cells-varied-1|disposal|Actors I29|retry|att-000000000000000000000000000003e9-2",
  "PART-cells-varied-2|delivered-once|WriteLanes I15|retry|att-000000000000000000000000000007d4-2",
  "PART-cells-varied-2|disposal|Actors I29|retry|att-000000000000000000000000000007d4-2",
  "PART-cells-varied-2|lane-queue|WriteLanes I12|retry|att-000000000000000000000000000007d4-2",
  "PART-cells-varied-2|delivered-once|WriteLanes I16|retry|att-000000000000000000000000000007d4-2",
  "MIX-sync+transfers+sign-in+pay-stress-1|delivered-once|WriteLanes I15|retry|att-000000000000000000000000000003e9-1",
  "MIX-sync+transfers+sign-in+pay-stress-1|disposal|Actors I29|retry|att-000000000000000000000000000003e9-1",
  "MIX-sync+transfers+sign-in+pay-stress-1|lane-queue|WriteLanes I12|retry|att-000000000000000000000000000003e8-14;att-000000000000000000000000000003e9-1",
  "MIX-sync+transfers+sign-in+pay-stress-1|delivered-once|WriteLanes I16|retry|att-000000000000000000000000000003e9-1",
  "PART-transfers-varied-101|lane-queue|WriteLanes I12|retry|att-00000000000000000000000000018a88-3",
  "PART-transfers-varied-101|delivered-once|WriteLanes I16|retry|att-00000000000000000000000000018a88-3",
  "PART-transfers-varied-101|delivered-once|WriteLanes I15|retry|att-00000000000000000000000000018a88-3;att-00000000000000000000000000018a90-1;Bank/Transfers acct-1 transfer@173",
  "PART-transfers-varied-101|lane-queue|WriteLanes I8|retry|att-00000000000000000000000000018a90-1",
  "PART-transfers-varied-101|lane-queue|WriteLanes I1|retry|att-00000000000000000000000000018a90-1",
  "PART-transfers-varied-101|disposal|Actors I29|retry|att-00000000000000000000000000018a88-3",
  "PART-transfers-varied-102|lane-queue|WriteLanes I12|retry|att-00000000000000000000000000018e70-10",
  "PART-transfers-varied-104|lane-queue|WriteLanes I12|retry|att-00000000000000000000000000019641-1",
  "PART-transfers-varied-104|delivered-once|WriteLanes I16|retry|att-00000000000000000000000000019641-1",
  "PART-transfers-varied-104|delivered-once|WriteLanes I15|retry|att-00000000000000000000000000019641-1",
  "PART-transfers-varied-104|disposal|Actors I29|retry|att-00000000000000000000000000019641-1",
  "PART-transfers-varied-105|lane-queue|WriteLanes I12|retry|att-00000000000000000000000000019a28-4",
  "PART-pay-varied-103|disposal|Actors I29|retry|att-00000000000000000000000000019258-4",
  "PART-pay-varied-103|lane-queue|WriteLanes I12|retry|att-00000000000000000000000000019258-4",
  "PART-pay-varied-103|delivered-once|WriteLanes I16|retry|att-00000000000000000000000000019258-4",
  "PART-pay-varied-103|delivered-once|WriteLanes I15|retry|att-00000000000000000000000000019258-4",
  "PART-cells-varied-103|lane-queue|WriteLanes I12|retry|att-00000000000000000000000000019258-7;att-00000000000000000000000000019258-3;att-00000000000000000000000000019258-5",
  "PART-cells-varied-103|lane-queue|WriteLanes I1|retry|att-00000000000000000000000000019258-7;att-00000000000000000000000000019258-3",
  "PART-cells-varied-103|delivered-once|WriteLanes I16|retry|att-00000000000000000000000000019258-7;att-00000000000000000000000000019258-3",
  "PART-cells-varied-103|delivered-once|WriteLanes I15|retry|att-00000000000000000000000000019258-7;att-00000000000000000000000000019258-3",
  "PART-cells-varied-103|disposal|Actors I29|retry|att-00000000000000000000000000019258-5",
  "PART-cells-varied-110|lane-queue|WriteLanes I12|retry|att-0000000000000000000000000001adb0-4",
  "PART-cells-varied-110|lane-queue|WriteLanes I1|retry|att-0000000000000000000000000001adb0-4",
  "PART-cells-varied-110|delivered-once|WriteLanes I16|retry|att-0000000000000000000000000001adb0-4",
  "PART-cells-varied-110|delivered-once|WriteLanes I15|retry|att-0000000000000000000000000001adb0-4",
  "PART-cells-varied-110|late-results|WriteLanes I23|retry|att-0000000000000000000000000001adb0-4",
  "MIX-sync+transfers+sign-in+pay-stress-101|lane-queue|WriteLanes I12|retry|att-00000000000000000000000000018a88-14",
];

// RETURN_TYPE: the union, so both branches share one item type.
const itemOf = (text: string): VariedItem => {
  const at = text.lastIndexOf("@");

  return at < 0
    ? { _tag: "Attempt", id: text }
    : { _tag: "Item", subject: text.slice(0, at), step: Number(text.slice(at + 1)) };
};

/**
 * The varied profile's and the new mixes' owed rows, decoded.
 */
export const VARIED_OWED: ReadonlyArray<VariedRow> = ROWS.map((line) => {
  const [id = "", check = "", invariant = "", root = "", items = ""] = line.split("|");

  return {
    id,
    check,
    invariant,
    root: Schema.decodeUnknownSync(Root)(root),
    items: items.split(";").map(itemOf),
  };
});

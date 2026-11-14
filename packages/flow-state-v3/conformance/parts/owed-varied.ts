import { Schema } from "effect";

const Root = Schema.Literals(["retry", "unbound"]);

/**
 * The root a varied or new-mix script's owed row traces to: production's re-send past its budget
 * across a reload (`retry`, @task.V3.T19) or its restore of a disposed identity's unbound Held
 * head at a boot (`unbound`, @task.V3.T54).
 */
export type VariedRoot = "retry" | "unbound";

/**
 * Each first-break signature of the varied reds (checks, Invariants and the move), with the root
 * its traced representative showed (T61, review M1): the soak run reports these as known and
 * fails on any other. Representatives, in order: PART-transfers-varied-4 (a spent retry re-sent at
 * the ack); PART-cells-varied-110 and MIX-sync+transfers+sign-in+pay-stress-101 (a restored
 * head's handler retries where the model gives up); PART-pay-varied-6, PART-cells-varied-3 and
 * MIX-sync+transfers+sign-in+pay-stress-7 (a dispose, then a reload); PART-pay-varied-103 (an
 * adoption after a spent-budget retry); PART-transfers-varied-2001 (`flush`: an adoption's flush
 * holds only its own record, @task.V3.T54, kept as a regression); PART-cells-stress-105-shrunk
 * and the soak's PART-pay-stress-5000 (`refused`: a disposed actor's refused Unsent head is never
 * ended, so its adoption mints on a busy lane, @task.V3.T19, kept as a regression).
 */
export const TRIAGED_SIGNATURES: ReadonlyMap<string, VariedRoot | "flush" | "refused"> = new Map([
  ["lane-queue WriteLanes I12 at ack", "retry"],
  ["lane-queue WriteLanes I12 at reload", "retry"],
  ["lane-queue WriteLanes I12 at end of case reload", "retry"],
  ["delivered-once WriteLanes I15 at reload", "unbound"],
  ["delivered-once WriteLanes I15,disposal Actors I29 at reload", "unbound"],
  ["delivered-once WriteLanes I15,disposal Actors I29 at end of case reload", "unbound"],
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
 * one of the two roots; its later breaks on the same subjects follow from it.
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
  "PART-transfers-varied-4|delivered-once|Restore I6|retry|att-00000000000000000000000000000fa0-4",
  "PART-transfers-varied-4|disposal|Actors I29|retry|att-00000000000000000000000000000fa0-4",
  "PART-pay-varied-1|delivered-once|WriteLanes I15|unbound|att-000000000000000000000000000003f0-1;att-000000000000000000000000000003ed-1",
  "PART-pay-varied-1|disposal|Actors I29|unbound|att-000000000000000000000000000003ed-1;att-000000000000000000000000000003f0-1",
  "PART-pay-varied-2|delivered-once|WriteLanes I15|unbound|att-000000000000000000000000000007d6-2;att-000000000000000000000000000007d0-1;att-000000000000000000000000000007d6-1",
  "PART-pay-varied-2|disposal|Actors I29|unbound|att-000000000000000000000000000007d0-1;att-000000000000000000000000000007d6-1;att-000000000000000000000000000007d6-2",
  "PART-pay-varied-3|delivered-once|WriteLanes I15|unbound|att-00000000000000000000000000000bb9-1",
  "PART-pay-varied-3|disposal|Actors I29|unbound|att-00000000000000000000000000000bb9-1",
  "PART-pay-varied-4|delivered-once|WriteLanes I15|unbound|att-00000000000000000000000000000fa1-2;att-00000000000000000000000000000fa0-1;att-00000000000000000000000000000fa1-1",
  "PART-pay-varied-4|disposal|Actors I29|unbound|att-00000000000000000000000000000fa0-1;att-00000000000000000000000000000fa1-1;att-00000000000000000000000000000fa1-2",
  "PART-pay-varied-5|delivered-once|WriteLanes I15|unbound|att-0000000000000000000000000000138e-1;att-0000000000000000000000000000138b-2",
  "PART-pay-varied-5|disposal|Actors I29|unbound|att-0000000000000000000000000000138b-2;att-0000000000000000000000000000138e-1",
  "PART-pay-varied-6|delivered-once|WriteLanes I15|unbound|att-00000000000000000000000000001772-1;att-0000000000000000000000000000177f-1;att-00000000000000000000000000001776-1",
  "PART-pay-varied-6|disposal|Actors I29|unbound|att-00000000000000000000000000001772-1;att-00000000000000000000000000001776-1;att-0000000000000000000000000000177f-1",
  "PART-pay-varied-7|delivered-once|WriteLanes I15|unbound|att-00000000000000000000000000001b5a-1;att-00000000000000000000000000001b5c-1;att-00000000000000000000000000001b61-1",
  "PART-pay-varied-7|disposal|Actors I29|unbound|att-00000000000000000000000000001b5a-1;att-00000000000000000000000000001b5c-1;att-00000000000000000000000000001b61-1",
  "PART-pay-varied-8|delivered-once|WriteLanes I15|unbound|att-00000000000000000000000000001f41-1;att-00000000000000000000000000001f47-1;att-00000000000000000000000000001f48-1",
  "PART-pay-varied-8|disposal|Actors I29|unbound|att-00000000000000000000000000001f41-1;att-00000000000000000000000000001f47-1;att-00000000000000000000000000001f48-1",
  "PART-pay-varied-9|delivered-once|WriteLanes I15|unbound|att-00000000000000000000000000002330-4;att-0000000000000000000000000000232e-1;att-0000000000000000000000000000232c-1",
  "PART-pay-varied-9|disposal|Actors I29|unbound|att-0000000000000000000000000000232c-1;att-0000000000000000000000000000232e-1;att-00000000000000000000000000002330-4",
  "PART-pay-varied-10|delivered-once|WriteLanes I15|unbound|att-00000000000000000000000000002714-1;att-0000000000000000000000000000271d-1",
  "PART-pay-varied-10|disposal|Actors I29|unbound|att-00000000000000000000000000002714-1;att-0000000000000000000000000000271d-1",
  "PART-pay-varied-11|delivered-once|WriteLanes I15|unbound|att-00000000000000000000000000002af8-2;att-00000000000000000000000000002af9-1;att-00000000000000000000000000002af8-3;att-00000000000000000000000000002afc-1;att-00000000000000000000000000002afd-1",
  "PART-pay-varied-11|disposal|Actors I29|unbound|att-00000000000000000000000000002af8-2;att-00000000000000000000000000002af8-3;att-00000000000000000000000000002af9-1;att-00000000000000000000000000002afc-1;att-00000000000000000000000000002afd-1",
  "PART-pay-varied-11|lane-queue|WriteLanes I12|unbound|att-00000000000000000000000000002af8-2;att-00000000000000000000000000002af9-1",
  "PART-pay-varied-11|lane-queue|WriteLanes I1|unbound|att-00000000000000000000000000002af9-1",
  "PART-pay-varied-11|delivered-once|WriteLanes I16|unbound|att-00000000000000000000000000002af9-1;att-00000000000000000000000000002af8-2",
  "PART-pay-varied-12|delivered-once|WriteLanes I15|unbound|att-00000000000000000000000000002ee1-1",
  "PART-pay-varied-12|disposal|Actors I29|unbound|att-00000000000000000000000000002ee1-1",
  "PART-cells-varied-1|lane-queue|WriteLanes I12|retry|att-000000000000000000000000000003e9-2",
  "PART-cells-varied-1|disposal|Actors I29|retry|att-000000000000000000000000000003e9-2",
  "PART-cells-varied-2|delivered-once|WriteLanes I15|unbound|att-000000000000000000000000000007d6-4;att-000000000000000000000000000007d4-2;att-000000000000000000000000000007d3-2",
  "PART-cells-varied-2|disposal|Actors I29|unbound|att-000000000000000000000000000007d3-2;att-000000000000000000000000000007d4-2;att-000000000000000000000000000007d6-4",
  "PART-cells-varied-2|lane-queue|WriteLanes I12|unbound|att-000000000000000000000000000007d4-2",
  "PART-cells-varied-2|delivered-once|WriteLanes I16|unbound|att-000000000000000000000000000007d4-2",
  "PART-cells-varied-3|delivered-once|WriteLanes I15|unbound|att-00000000000000000000000000000bbc-1;att-00000000000000000000000000000bbd-1",
  "PART-cells-varied-3|disposal|Actors I29|unbound|att-00000000000000000000000000000bbc-1;att-00000000000000000000000000000bbd-1",
  "PART-cells-varied-4|delivered-once|WriteLanes I15|unbound|att-00000000000000000000000000000fa0-1;att-00000000000000000000000000000fac-1",
  "PART-cells-varied-4|disposal|Actors I29|unbound|att-00000000000000000000000000000fa0-1;att-00000000000000000000000000000fac-1",
  "PART-cells-varied-6|delivered-once|WriteLanes I15|unbound|att-00000000000000000000000000001771-3;att-00000000000000000000000000001781-1;att-00000000000000000000000000001776-1",
  "PART-cells-varied-6|disposal|Actors I29|unbound|att-00000000000000000000000000001771-3;att-00000000000000000000000000001776-1;att-00000000000000000000000000001781-1",
  "PART-cells-varied-7|delivered-once|WriteLanes I15|unbound|att-00000000000000000000000000001b5e-1;att-00000000000000000000000000001b58-1;att-00000000000000000000000000001b63-1",
  "PART-cells-varied-7|disposal|Actors I29|unbound|att-00000000000000000000000000001b58-1;att-00000000000000000000000000001b5e-1;att-00000000000000000000000000001b63-1",
  "PART-cells-varied-8|delivered-once|WriteLanes I15|unbound|att-00000000000000000000000000001f44-2;att-00000000000000000000000000001f40-1;att-00000000000000000000000000001f4f-1",
  "PART-cells-varied-8|disposal|Actors I29|unbound|att-00000000000000000000000000001f40-1;att-00000000000000000000000000001f44-2;att-00000000000000000000000000001f4f-1",
  "PART-cells-varied-9|delivered-once|WriteLanes I15|unbound|att-0000000000000000000000000000232b-1;att-00000000000000000000000000002336-1",
  "PART-cells-varied-9|disposal|Actors I29|unbound|att-0000000000000000000000000000232b-1;att-00000000000000000000000000002336-1",
  "PART-cells-varied-10|delivered-once|WriteLanes I15|unbound|att-00000000000000000000000000002712-1;att-0000000000000000000000000000271a-1;att-0000000000000000000000000000271c-1",
  "PART-cells-varied-10|disposal|Actors I29|unbound|att-00000000000000000000000000002712-1;att-0000000000000000000000000000271a-1;att-0000000000000000000000000000271c-1",
  "PART-cells-varied-11|delivered-once|WriteLanes I15|unbound|att-00000000000000000000000000002afe-1;att-00000000000000000000000000002af8-1",
  "PART-cells-varied-11|disposal|Actors I29|unbound|att-00000000000000000000000000002af8-1;att-00000000000000000000000000002afe-1",
  "PART-cells-varied-12|delivered-once|WriteLanes I15|unbound|att-00000000000000000000000000002ee3-1;att-00000000000000000000000000002ee9-1;att-00000000000000000000000000002ee6-1",
  "PART-cells-varied-12|disposal|Actors I29|unbound|att-00000000000000000000000000002ee3-1;att-00000000000000000000000000002ee6-1;att-00000000000000000000000000002ee9-1",
  "MIX-sync+transfers+sign-in+pay-stress-1|delivered-once|WriteLanes I15|unbound|att-000000000000000000000000000003e8-4;att-000000000000000000000000000003e9-1",
  "MIX-sync+transfers+sign-in+pay-stress-1|disposal|Actors I29|unbound|att-000000000000000000000000000003e8-4;att-000000000000000000000000000003e9-1",
  "MIX-sync+transfers+sign-in+pay-stress-1|lane-queue|WriteLanes I12|retry|att-000000000000000000000000000003e8-14;att-000000000000000000000000000003e9-1",
  "MIX-sync+transfers+sign-in+pay-stress-1|delivered-once|WriteLanes I16|retry|att-000000000000000000000000000003e9-1",
  "MIX-sync+transfers+sign-in+pay-stress-5|delivered-once|WriteLanes I15|unbound|att-00000000000000000000000000001388-6",
  "MIX-sync+transfers+sign-in+pay-stress-5|disposal|Actors I29|unbound|att-00000000000000000000000000001388-6",
  "MIX-sync+transfers+sign-in+pay-stress-6|delivered-once|WriteLanes I15|unbound|att-00000000000000000000000000001771-1",
  "MIX-sync+transfers+sign-in+pay-stress-6|disposal|Actors I29|unbound|att-00000000000000000000000000001771-1",
  "MIX-sync+transfers+sign-in+pay-stress-7|delivered-once|WriteLanes I15|unbound|att-00000000000000000000000000001b58-7",
  "MIX-sync+transfers+sign-in+pay-stress-7|disposal|Actors I29|unbound|att-00000000000000000000000000001b58-7",
  "MIX-sync+transfers+sign-in+pay-stress-8|delivered-once|WriteLanes I15|unbound|att-00000000000000000000000000001f40-6",
  "MIX-sync+transfers+sign-in+pay-stress-8|disposal|Actors I29|unbound|att-00000000000000000000000000001f40-6",
  "MIX-sync+transfers+sign-in+pay-stress-12|delivered-once|WriteLanes I15|unbound|att-00000000000000000000000000002ee0-7",
  "MIX-sync+transfers+sign-in+pay-stress-12|disposal|Actors I29|unbound|att-00000000000000000000000000002ee0-7",
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
  "PART-pay-varied-101|delivered-once|WriteLanes I15|unbound|att-00000000000000000000000000018a8a-2",
  "PART-pay-varied-101|disposal|Actors I29|unbound|att-00000000000000000000000000018a8a-2",
  "PART-pay-varied-103|disposal|Actors I29|retry|att-00000000000000000000000000019258-4",
  "PART-pay-varied-103|lane-queue|WriteLanes I12|retry|att-00000000000000000000000000019258-4",
  "PART-pay-varied-103|delivered-once|WriteLanes I16|retry|att-00000000000000000000000000019258-4",
  "PART-pay-varied-103|delivered-once|WriteLanes I15|retry|att-00000000000000000000000000019258-4",
  "PART-pay-varied-104|delivered-once|WriteLanes I15|unbound|att-00000000000000000000000000019641-1;att-00000000000000000000000000019645-1;att-0000000000000000000000000001964d-1",
  "PART-pay-varied-104|disposal|Actors I29|unbound|att-00000000000000000000000000019641-1;att-00000000000000000000000000019645-1;att-0000000000000000000000000001964d-1",
  "PART-pay-varied-105|delivered-once|WriteLanes I15|unbound|att-00000000000000000000000000019a2b-1;att-00000000000000000000000000019a31-1;att-00000000000000000000000000019a3b-1",
  "PART-pay-varied-105|disposal|Actors I29|unbound|att-00000000000000000000000000019a2b-1;att-00000000000000000000000000019a31-1;att-00000000000000000000000000019a3b-1",
  "PART-pay-varied-106|delivered-once|WriteLanes I15|unbound|att-00000000000000000000000000019e10-1",
  "PART-pay-varied-106|disposal|Actors I29|unbound|att-00000000000000000000000000019e10-1",
  "PART-pay-varied-107|delivered-once|WriteLanes I15|unbound|att-0000000000000000000000000001a1f8-1;att-0000000000000000000000000001a20b-1",
  "PART-pay-varied-107|disposal|Actors I29|unbound|att-0000000000000000000000000001a1f8-1;att-0000000000000000000000000001a20b-1",
  "PART-pay-varied-108|delivered-once|WriteLanes I15|unbound|att-0000000000000000000000000001a5e1-3",
  "PART-pay-varied-108|disposal|Actors I29|unbound|att-0000000000000000000000000001a5e1-3",
  "PART-pay-varied-109|delivered-once|WriteLanes I15|unbound|att-0000000000000000000000000001a9cd-2;att-0000000000000000000000000001a9c9-1;att-0000000000000000000000000001a9cd-1",
  "PART-pay-varied-109|disposal|Actors I29|unbound|att-0000000000000000000000000001a9c9-1;att-0000000000000000000000000001a9cd-1;att-0000000000000000000000000001a9cd-2",
  "PART-pay-varied-110|delivered-once|WriteLanes I15|unbound|att-0000000000000000000000000001adb1-1;att-0000000000000000000000000001adb0-3;att-0000000000000000000000000001adb0-1",
  "PART-pay-varied-110|disposal|Actors I29|unbound|att-0000000000000000000000000001adb0-1;att-0000000000000000000000000001adb0-3;att-0000000000000000000000000001adb1-1",
  "PART-pay-varied-111|delivered-once|WriteLanes I15|unbound|att-0000000000000000000000000001b1a1-1;att-0000000000000000000000000001b199-1;att-0000000000000000000000000001b19d-2",
  "PART-pay-varied-111|disposal|Actors I29|unbound|att-0000000000000000000000000001b199-1;att-0000000000000000000000000001b19d-2;att-0000000000000000000000000001b1a1-1",
  "PART-pay-varied-112|delivered-once|WriteLanes I15|unbound|att-0000000000000000000000000001b582-1;att-0000000000000000000000000001b580-1;att-0000000000000000000000000001b58c-1",
  "PART-pay-varied-112|disposal|Actors I29|unbound|att-0000000000000000000000000001b580-1;att-0000000000000000000000000001b582-1;att-0000000000000000000000000001b58c-1",
  "PART-cells-varied-101|delivered-once|WriteLanes I15|unbound|att-00000000000000000000000000018a96-1;att-00000000000000000000000000018a8b-1;att-00000000000000000000000000018a90-1",
  "PART-cells-varied-101|disposal|Actors I29|unbound|att-00000000000000000000000000018a8b-1;att-00000000000000000000000000018a90-1;att-00000000000000000000000000018a96-1",
  "PART-cells-varied-102|delivered-once|WriteLanes I15|unbound|att-00000000000000000000000000018e77-1;att-00000000000000000000000000018e7a-1",
  "PART-cells-varied-102|disposal|Actors I29|unbound|att-00000000000000000000000000018e77-1;att-00000000000000000000000000018e7a-1",
  "PART-cells-varied-103|lane-queue|WriteLanes I12|retry|att-00000000000000000000000000019258-7;att-00000000000000000000000000019258-3;att-00000000000000000000000000019258-5",
  "PART-cells-varied-103|lane-queue|WriteLanes I1|retry|att-00000000000000000000000000019258-7;att-00000000000000000000000000019258-3",
  "PART-cells-varied-103|delivered-once|WriteLanes I16|retry|att-00000000000000000000000000019258-7;att-00000000000000000000000000019258-3",
  "PART-cells-varied-103|delivered-once|WriteLanes I15|retry|att-00000000000000000000000000019258-7;att-00000000000000000000000000019258-3",
  "PART-cells-varied-103|disposal|Actors I29|retry|att-00000000000000000000000000019258-5",
  "PART-cells-varied-105|delivered-once|WriteLanes I15|unbound|att-00000000000000000000000000019a29-1;att-00000000000000000000000000019a2a-1",
  "PART-cells-varied-105|disposal|Actors I29|unbound|att-00000000000000000000000000019a29-1;att-00000000000000000000000000019a2a-1",
  "PART-cells-varied-106|delivered-once|WriteLanes I15|unbound|att-00000000000000000000000000019e14-2;att-00000000000000000000000000019e12-2",
  "PART-cells-varied-106|disposal|Actors I29|unbound|att-00000000000000000000000000019e12-2;att-00000000000000000000000000019e14-2",
  "PART-cells-varied-107|delivered-once|WriteLanes I15|unbound|att-0000000000000000000000000001a1fd-1;att-0000000000000000000000000001a1f9-2;att-0000000000000000000000000001a1fc-1",
  "PART-cells-varied-107|disposal|Actors I29|unbound|att-0000000000000000000000000001a1f9-2;att-0000000000000000000000000001a1fc-1;att-0000000000000000000000000001a1fd-1",
  "PART-cells-varied-108|delivered-once|WriteLanes I15|unbound|att-0000000000000000000000000001a5e0-1;att-0000000000000000000000000001a5e1-2;att-0000000000000000000000000001a5ec-1",
  "PART-cells-varied-108|disposal|Actors I29|unbound|att-0000000000000000000000000001a5e0-1;att-0000000000000000000000000001a5e1-2;att-0000000000000000000000000001a5ec-1",
  "PART-cells-varied-109|delivered-once|WriteLanes I15|unbound|att-0000000000000000000000000001a9c8-1;att-0000000000000000000000000001a9cb-1;att-0000000000000000000000000001a9c8-5",
  "PART-cells-varied-109|disposal|Actors I29|unbound|att-0000000000000000000000000001a9c8-1;att-0000000000000000000000000001a9c8-5;att-0000000000000000000000000001a9cb-1",
  "PART-cells-varied-110|lane-queue|WriteLanes I12|retry|att-0000000000000000000000000001adb0-4",
  "PART-cells-varied-110|lane-queue|WriteLanes I1|retry|att-0000000000000000000000000001adb0-4",
  "PART-cells-varied-110|delivered-once|WriteLanes I16|retry|att-0000000000000000000000000001adb0-4",
  "PART-cells-varied-110|delivered-once|WriteLanes I15|retry|att-0000000000000000000000000001adb0-4;att-0000000000000000000000000001adb6-1;att-0000000000000000000000000001adbc-1",
  "PART-cells-varied-110|disposal|Actors I29|retry|att-0000000000000000000000000001adb6-1;att-0000000000000000000000000001adbc-1",
  "PART-cells-varied-110|late-results|WriteLanes I23|retry|att-0000000000000000000000000001adb0-4",
  "PART-cells-varied-111|delivered-once|WriteLanes I15|unbound|att-0000000000000000000000000001b199-1;att-0000000000000000000000000001b19c-1",
  "PART-cells-varied-111|disposal|Actors I29|unbound|att-0000000000000000000000000001b199-1;att-0000000000000000000000000001b19c-1",
  "PART-cells-varied-112|delivered-once|WriteLanes I15|unbound|att-0000000000000000000000000001b581-1;att-0000000000000000000000000001b588-1",
  "PART-cells-varied-112|disposal|Actors I29|unbound|att-0000000000000000000000000001b581-1;att-0000000000000000000000000001b588-1",
  "MIX-sync+transfers+sign-in+pay-stress-101|lane-queue|WriteLanes I12|retry|att-00000000000000000000000000018a88-14",
  "MIX-sync+transfers+sign-in+pay-stress-102|delivered-once|WriteLanes I15|unbound|att-00000000000000000000000000018e71-5",
  "MIX-sync+transfers+sign-in+pay-stress-102|disposal|Actors I29|unbound|att-00000000000000000000000000018e71-5",
  "MIX-sync+transfers+sign-in+pay-stress-103|delivered-once|WriteLanes I15|unbound|att-0000000000000000000000000001925b-1",
  "MIX-sync+transfers+sign-in+pay-stress-103|disposal|Actors I29|unbound|att-0000000000000000000000000001925b-1",
  "MIX-sync+transfers+sign-in+pay-stress-110|delivered-once|WriteLanes I15|unbound|att-0000000000000000000000000001adb0-12",
  "MIX-sync+transfers+sign-in+pay-stress-110|disposal|Actors I29|unbound|att-0000000000000000000000000001adb0-12",
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

import { Schema } from "effect";

const Root = Schema.Literals(["retry", "flush", "adopted"]);

/**
 * The production bug an owed part row traces to: a re-send past its budget across a reload
 * (`retry`, @task.V3.T19); a flush that holds only its own actor's records (`flush`,
 * @task.V3.T54); or an adopted head's later ending routed late (`adopted`, @task.V3.T54).
 */
export type PartRoot = "retry" | "flush" | "adopted";

/**
 * Each first-break signature the soak knows, with its root: it reports these as known and fails
 * on any other. `refused` (a disposed actor's refused Unsent head never ended, @task.V3.T19) is
 * kept by a regression.
 */
export const TRIAGED_SIGNATURES: ReadonlyMap<string, PartRoot | "refused"> = new Map([
  ["lane-queue WriteLanes I12 at ack", "retry"],
  ["lane-queue WriteLanes I12 at reload", "retry"],
  ["lane-queue WriteLanes I12 at end of case reload", "retry"],
  ["disposal Actors I29 at ensure", "retry"],
  ["delivered-once WriteLanes I15,delivered-once WriteLanes I16 at reload", "flush"],
  ["selection Turn I2 at send AbortPay", "adopted"],
  ["selection Turn I26 at ack", "adopted"],
  ["delivered-once WriteLanes I15,lane-queue WriteLanes I8 at send PayRequested", "refused"],
]);

/**
 * One exact break: an Attempt id, or a subject with no Attempt and the step it broke at.
 */
export type PartItem =
  | { readonly _tag: "Attempt"; readonly id: string }
  | { readonly _tag: "Item"; readonly subject: string; readonly step: number };

/**
 * One owed row of a part script: its script, check, Invariant, root and breaks.
 */
export type PartRow = {
  readonly id: string;
  readonly check: string;
  readonly invariant: string;
  readonly root: PartRoot;
  readonly items: ReadonlyArray<PartItem>;
};

/**
 * The rows, recorded from the part scripts' own runs, one line each: `script|check|Invariant|root|`
 * then the breaks, `;`-separated, an Attempt id or `subject@step`. Each script's first break is
 * its root; its later breaks on the same subjects follow from it.
 *
 * **Gotchas**
 *
 * - The lists come from a production run: a change detector, never an expected result.
 * - A root is checked by its fix: every `retry` row clears when a re-send's retry count is
 *   captured, and no `flush` or `adopted` row does.
 */
const ROWS: ReadonlyArray<string> = [
  "PART-transfers-stress-1|lane-queue|WriteLanes I12|retry|att-000000000000000000000000000003e8-2;att-000000000000000000000000000003e9-4",
  "PART-transfers-stress-1|delivered-once|WriteLanes I16|retry|att-000000000000000000000000000003e8-2;att-000000000000000000000000000003e9-4",
  "PART-transfers-stress-1|delivered-once|WriteLanes I15|retry|att-000000000000000000000000000003e8-2;att-000000000000000000000000000003e9-4",
  "PART-transfers-varied-2|lane-queue|WriteLanes I12|retry|att-000000000000000000000000000007d0-4",
  "PART-transfers-varied-2|delivered-once|WriteLanes I16|retry|att-000000000000000000000000000007d0-4",
  "PART-transfers-varied-2|delivered-once|WriteLanes I15|retry|att-000000000000000000000000000007d0-4",
  "PART-transfers-varied-2|disposal|Actors I32|retry|att-000000000000000000000000000007d0-4",
  "PART-transfers-varied-4|delivered-once|WriteLanes I16|flush|att-00000000000000000000000000000fa0-1",
  "PART-transfers-varied-4|delivered-once|WriteLanes I15|flush|att-00000000000000000000000000000fa0-1;Bank/Transfers acct-2 transfer@83",
  "PART-transfers-varied-4|lane-queue|WriteLanes I8|flush|Bank/Transfers acct-2 transfer@83",
  "PART-pay-stress-6|disposal|Actors I29|retry|att-00000000000000000000000000001773-2",
  "PART-pay-stress-6|lane-queue|WriteLanes I12|retry|att-00000000000000000000000000001773-2",
  "PART-pay-stress-6|delivered-once|WriteLanes I16|retry|att-00000000000000000000000000001773-2",
  "PART-pay-stress-6|delivered-once|WriteLanes I15|retry|att-00000000000000000000000000001773-2",
  "PART-pay-varied-2|lane-queue|WriteLanes I12|retry|att-000000000000000000000000000007db-2;att-000000000000000000000000000007dc-1",
  "PART-pay-varied-2|delivered-once|WriteLanes I16|retry|att-000000000000000000000000000007db-2",
  "PART-pay-varied-2|delivered-once|WriteLanes I15|retry|att-000000000000000000000000000007db-2",
  "PART-pay-varied-2|disposal|Actors I29|retry|att-000000000000000000000000000007db-2",
  "PART-pay-varied-3|lane-queue|WriteLanes I12|retry|att-00000000000000000000000000000bc0-2",
  "PART-pay-varied-3|delivered-once|WriteLanes I16|retry|att-00000000000000000000000000000bc0-2",
  "PART-pay-varied-3|delivered-once|WriteLanes I15|retry|att-00000000000000000000000000000bc0-2",
  "PART-pay-varied-3|disposal|Actors I29|retry|att-00000000000000000000000000000bc0-2",
  "PART-pay-varied-4|lane-queue|WriteLanes I12|retry|att-00000000000000000000000000000fa7-1",
  "PART-pay-varied-4|delivered-once|WriteLanes I16|retry|att-00000000000000000000000000000fa7-1",
  "PART-pay-varied-4|delivered-once|WriteLanes I15|retry|att-00000000000000000000000000000fa7-1",
  "PART-pay-varied-4|disposal|Actors I29|retry|att-00000000000000000000000000000fa7-1",
  "PART-cells-stress-2|lane-queue|WriteLanes I12|retry|att-000000000000000000000000000007d3-2",
  "PART-cells-stress-2|delivered-once|WriteLanes I16|retry|att-000000000000000000000000000007d3-2",
  "PART-cells-stress-2|delivered-once|WriteLanes I15|retry|att-000000000000000000000000000007d3-2",
  "PART-cells-stress-3|selection|Turn I2|adopted|Checkout/Pay shopper-1@101",
  "PART-cells-stress-4|lane-queue|WriteLanes I12|retry|att-00000000000000000000000000000fa1-3;att-00000000000000000000000000000fa1-4;att-00000000000000000000000000000fa1-1",
  "PART-cells-stress-4|lane-queue|WriteLanes I1|retry|att-00000000000000000000000000000fa1-3;att-00000000000000000000000000000fa1-4",
  "PART-cells-stress-4|disposal|Actors I29|retry|att-00000000000000000000000000000fa1-1",
  "PART-cells-stress-4|delivered-once|WriteLanes I16|retry|att-00000000000000000000000000000fa1-3;att-00000000000000000000000000000fa1-4",
  "PART-cells-stress-4|delivered-once|WriteLanes I15|retry|att-00000000000000000000000000000fa1-3;att-00000000000000000000000000000fa1-4",
  "PART-cells-stress-4|late-results|WriteLanes I23|retry|att-00000000000000000000000000000fa1-3",
  "PART-cells-varied-1|lane-queue|WriteLanes I12|retry|att-000000000000000000000000000003e9-5",
  "PART-cells-varied-3|lane-queue|WriteLanes I12|retry|att-00000000000000000000000000000bc2-4",
  "PART-cells-varied-6|lane-queue|WriteLanes I12|retry|att-00000000000000000000000000001778-2",
  "PART-cells-varied-6|disposal|Actors I29|retry|att-00000000000000000000000000001778-2",
  "MIX-sync+transfers+sign-in-stress-1|lane-queue|WriteLanes I12|retry|att-000000000000000000000000000003ea-3",
  "MIX-sync+transfers+sign-in-stress-1|delivered-once|WriteLanes I16|retry|att-000000000000000000000000000003ea-3",
  "MIX-sync+transfers+sign-in-stress-1|delivered-once|WriteLanes I15|retry|att-000000000000000000000000000003ea-3",
  "MIX-sync+transfers+sign-in+pay-stress-2|lane-queue|WriteLanes I12|retry|att-000000000000000000000000000007d0-13",
  "MIX-sync+transfers+sign-in+pay-stress-2|delivered-once|WriteLanes I16|retry|att-000000000000000000000000000007d0-13",
  "MIX-sync+transfers+sign-in+pay-stress-2|delivered-once|WriteLanes I15|retry|att-000000000000000000000000000007d0-13",
  "MIX-sync+transfers+sign-in+pay-stress-2|disposal|Actors I29|retry|att-000000000000000000000000000007d0-13",
  "PART-cells-stress-9|lane-queue|WriteLanes I12|retry|att-0000000000000000000000000000232a-2;att-0000000000000000000000000000232a-1",
  "PART-cells-stress-9|lane-queue|WriteLanes I1|retry|att-0000000000000000000000000000232a-2",
  "PART-cells-stress-9|delivered-once|WriteLanes I16|retry|att-0000000000000000000000000000232a-2",
  "PART-cells-stress-9|delivered-once|WriteLanes I15|retry|att-0000000000000000000000000000232a-2",
  "PART-cells-stress-9|disposal|Actors I29|retry|att-0000000000000000000000000000232a-1",
  "PART-pay-varied-11|disposal|Actors I29|retry|att-00000000000000000000000000002af8-2",
  "PART-pay-varied-11|lane-queue|WriteLanes I12|retry|att-00000000000000000000000000002af8-2",
  "PART-transfers-stress-111|lane-queue|WriteLanes I12|retry|att-0000000000000000000000000001b199-1",
  "PART-transfers-stress-111|disposal|Actors I32|retry|att-0000000000000000000000000001b199-1",
  "PART-transfers-stress-112|lane-queue|WriteLanes I12|retry|att-0000000000000000000000000001b581-1",
  "PART-transfers-varied-101|lane-queue|WriteLanes I12|retry|att-00000000000000000000000000018a88-3;att-00000000000000000000000000018a8a-2",
  "PART-transfers-varied-101|delivered-once|WriteLanes I16|retry|att-00000000000000000000000000018a88-3;att-00000000000000000000000000018a8a-2",
  "PART-transfers-varied-101|delivered-once|WriteLanes I15|retry|att-00000000000000000000000000018a88-3;Bank/Transfers acct-1 transfer@142;att-00000000000000000000000000018a8c-1;Bank/Transfers acct-1 transfer@157;Bank/Transfers acct-1 transfer@170;att-00000000000000000000000000018a8a-2;att-00000000000000000000000000018a8e-1;Bank/Transfers acct-1 transfer@191;att-00000000000000000000000000018a8e-2",
  "PART-transfers-varied-101|delivered-once|Restore I6|retry|att-00000000000000000000000000018a88-3",
  "PART-transfers-varied-101|lane-queue|WriteLanes I8|retry|att-00000000000000000000000000018a8c-1;att-00000000000000000000000000018a8c-2;att-00000000000000000000000000018a8e-1;att-00000000000000000000000000018a8e-2",
  "PART-transfers-varied-101|lane-queue|WriteLanes I1|retry|att-00000000000000000000000000018a8c-1;att-00000000000000000000000000018a8e-1;att-00000000000000000000000000018a8e-2",
  "PART-transfers-varied-101|disposal|Actors I32|retry|att-00000000000000000000000000018a88-3",
  "PART-transfers-varied-101|disposal|Actors I29|retry|att-00000000000000000000000000018a88-3",
  "PART-transfers-varied-104|lane-queue|WriteLanes I12|retry|att-00000000000000000000000000019643-1;att-00000000000000000000000000019643-3",
  "PART-transfers-varied-104|delivered-once|WriteLanes I16|retry|att-00000000000000000000000000019643-1;att-00000000000000000000000000019643-3",
  "PART-transfers-varied-104|delivered-once|WriteLanes I15|retry|att-00000000000000000000000000019643-1;att-00000000000000000000000000019643-3;Bank/Transfers acct-1 transfer@184;Bank/Transfers acct-1 transfer@186;Bank/Transfers acct-1 transfer@189",
  "PART-transfers-varied-104|lane-queue|WriteLanes I8|retry|Bank/Transfers acct-1 transfer@184;Bank/Transfers acct-1 transfer@186;Bank/Transfers acct-1 transfer@189",
  "PART-transfers-varied-109|lane-queue|WriteLanes I12|retry|att-0000000000000000000000000001a9c8-1",
  "PART-transfers-varied-109|delivered-once|WriteLanes I16|retry|att-0000000000000000000000000001a9c8-1",
  "PART-transfers-varied-109|delivered-once|WriteLanes I15|retry|att-0000000000000000000000000001a9c8-1",
  "PART-transfers-varied-109|disposal|Actors I32|retry|att-0000000000000000000000000001a9c8-1",
  "PART-transfers-varied-110|lane-queue|WriteLanes I12|retry|att-0000000000000000000000000001adb2-2",
  "PART-transfers-varied-110|disposal|Actors I32|retry|att-0000000000000000000000000001adb2-2",
  "PART-transfers-varied-110|delivered-once|WriteLanes I16|retry|att-0000000000000000000000000001adb2-2",
  "PART-transfers-varied-110|delivered-once|WriteLanes I15|retry|att-0000000000000000000000000001adb2-2",
  "PART-pay-stress-103|lane-queue|WriteLanes I12|retry|att-0000000000000000000000000001925e-1;att-00000000000000000000000000019260-2",
  "PART-pay-stress-103|disposal|Actors I29|retry|att-0000000000000000000000000001925e-1",
  "PART-pay-stress-103|lane-queue|WriteLanes I1|retry|att-00000000000000000000000000019260-2",
  "PART-pay-stress-103|delivered-once|WriteLanes I16|retry|att-00000000000000000000000000019260-2",
  "PART-pay-stress-103|delivered-once|WriteLanes I15|retry|att-00000000000000000000000000019260-2;Checkout/Pay shopper-1 void@155",
  "PART-pay-stress-103|lane-queue|WriteLanes I8|retry|Checkout/Pay shopper-1 void@155",
  "PART-pay-stress-106|lane-queue|WriteLanes I12|retry|att-00000000000000000000000000019e16-1",
  "PART-pay-stress-106|disposal|Actors I29|retry|att-00000000000000000000000000019e16-1",
  "PART-pay-varied-103|lane-queue|WriteLanes I12|retry|att-00000000000000000000000000019258-4",
  "PART-pay-varied-103|disposal|Actors I29|retry|att-00000000000000000000000000019258-4",
  "PART-pay-varied-105|lane-queue|WriteLanes I12|retry|att-00000000000000000000000000019a2e-2",
  "PART-pay-varied-105|lane-queue|WriteLanes I1|retry|att-00000000000000000000000000019a2e-2",
  "PART-pay-varied-105|delivered-once|WriteLanes I16|retry|att-00000000000000000000000000019a2e-2",
  "PART-pay-varied-105|delivered-once|WriteLanes I15|retry|att-00000000000000000000000000019a2e-2",
  "PART-pay-varied-105|late-results|WriteLanes I23|retry|att-00000000000000000000000000019a2e-2",
  "PART-pay-varied-111|lane-queue|WriteLanes I12|retry|att-0000000000000000000000000001b19c-2",
  "PART-pay-varied-111|lane-queue|WriteLanes I1|retry|att-0000000000000000000000000001b19c-2",
  "PART-pay-varied-111|delivered-once|WriteLanes I16|retry|att-0000000000000000000000000001b19c-2",
  "PART-pay-varied-111|delivered-once|WriteLanes I15|retry|att-0000000000000000000000000001b19c-2",
  "PART-cells-stress-103|lane-queue|WriteLanes I12|retry|att-00000000000000000000000000019260-4",
  "PART-cells-stress-105|lane-queue|WriteLanes I12|retry|att-00000000000000000000000000019a31-4",
  "PART-cells-stress-105|lane-queue|WriteLanes I1|retry|att-00000000000000000000000000019a31-4",
  "PART-cells-stress-105|delivered-once|WriteLanes I16|retry|att-00000000000000000000000000019a31-4",
  "PART-cells-stress-105|delivered-once|WriteLanes I15|retry|att-00000000000000000000000000019a31-4",
  "PART-cells-stress-105|late-results|WriteLanes I23|retry|att-00000000000000000000000000019a31-4",
  "PART-cells-stress-107|lane-queue|WriteLanes I12|retry|att-0000000000000000000000000001a1fb-1;att-0000000000000000000000000001a1fd-1",
  "PART-cells-stress-107|disposal|Actors I29|retry|att-0000000000000000000000000001a1fb-1",
  "PART-cells-stress-107|lane-queue|WriteLanes I1|retry|att-0000000000000000000000000001a1fd-1",
  "PART-cells-stress-107|delivered-once|WriteLanes I16|retry|att-0000000000000000000000000001a1fd-1",
  "PART-cells-stress-107|delivered-once|WriteLanes I15|retry|att-0000000000000000000000000001a1fd-1",
  "PART-cells-varied-101|lane-queue|WriteLanes I12|retry|att-00000000000000000000000000018a93-1",
  "PART-cells-varied-101|delivered-once|WriteLanes I16|retry|att-00000000000000000000000000018a93-1",
  "PART-cells-varied-101|delivered-once|WriteLanes I15|retry|att-00000000000000000000000000018a93-1",
  "PART-cells-varied-101|disposal|Actors I29|retry|att-00000000000000000000000000018a93-1",
  "PART-cells-varied-110|lane-queue|WriteLanes I12|retry|att-0000000000000000000000000001adb7-2;att-0000000000000000000000000001adb7-3",
  "PART-cells-varied-110|lane-queue|WriteLanes I1|retry|att-0000000000000000000000000001adb7-3",
  "PART-cells-varied-110|disposal|Actors I29|retry|att-0000000000000000000000000001adb7-2",
  "PART-cells-varied-110|delivered-once|WriteLanes I16|retry|att-0000000000000000000000000001adb7-3;att-0000000000000000000000000001adb7-2",
  "PART-cells-varied-110|delivered-once|WriteLanes I15|retry|att-0000000000000000000000000001adb7-3;att-0000000000000000000000000001adb7-2",
  "MIX-sync+transfers+sign-in+pay-stress-110|lane-queue|WriteLanes I12|retry|att-0000000000000000000000000001adb0-16",
  "MIX-sync+transfers+sign-in+pay-stress-110|delivered-once|WriteLanes I16|retry|att-0000000000000000000000000001adb0-16",
  "MIX-sync+transfers+sign-in+pay-stress-110|delivered-once|WriteLanes I15|retry|att-0000000000000000000000000001adb0-16",
  "PART-cells-varied-11|delivered-once|WriteLanes I15|retry|att-00000000000000000000000000002afd-4",
  "PART-cells-varied-11|delivered-once|WriteLanes I16|retry|att-00000000000000000000000000002afd-4",
  "PART-cells-varied-11|disposal|Actors I29|retry|att-00000000000000000000000000002afd-1",
  "PART-cells-varied-11|lane-queue|WriteLanes I12|retry|att-00000000000000000000000000002afd-4;att-00000000000000000000000000002afd-1",
  "PART-cells-varied-11|lane-queue|WriteLanes I1|retry|att-00000000000000000000000000002afd-4",
  "PART-cells-varied-12|delivered-once|WriteLanes I15|retry|att-00000000000000000000000000002ee9-2",
  "PART-cells-varied-12|delivered-once|WriteLanes I16|retry|att-00000000000000000000000000002ee9-2",
  "PART-cells-varied-12|lane-queue|WriteLanes I12|retry|att-00000000000000000000000000002ee9-2;att-00000000000000000000000000002eea-2",
  "PART-cells-varied-12|lane-queue|WriteLanes I1|retry|att-00000000000000000000000000002ee9-2",
  "PART-cells-varied-8|selection|Turn I26|adopted|Checkout/Pay shopper-1@106",
  "PART-pay-stress-11|delivered-once|WriteLanes I15|retry|att-00000000000000000000000000002afa-1;att-00000000000000000000000000002af9-4",
  "PART-pay-stress-11|delivered-once|WriteLanes I16|retry|att-00000000000000000000000000002afa-1;att-00000000000000000000000000002af9-4",
  "PART-pay-stress-11|disposal|Actors I29|retry|att-00000000000000000000000000002af9-4",
  "PART-pay-stress-11|lane-queue|WriteLanes I12|retry|att-00000000000000000000000000002af9-4;att-00000000000000000000000000002afa-1",
  "PART-pay-stress-11|lane-queue|WriteLanes I1|retry|att-00000000000000000000000000002afa-1",
  "PART-pay-varied-9|delivered-once|WriteLanes I15|retry|att-0000000000000000000000000000232c-1",
  "PART-pay-varied-9|delivered-once|WriteLanes I16|retry|att-0000000000000000000000000000232c-1",
  "PART-pay-varied-9|lane-queue|WriteLanes I12|retry|att-0000000000000000000000000000232c-1",
  "PART-pay-varied-9|lane-queue|WriteLanes I1|retry|att-0000000000000000000000000000232c-1",
  "PART-transfers-stress-8|delivered-once|WriteLanes I15|retry|att-00000000000000000000000000001f40-2",
  "PART-transfers-stress-8|delivered-once|WriteLanes I16|retry|att-00000000000000000000000000001f40-2",
  "PART-transfers-stress-8|lane-queue|WriteLanes I12|retry|att-00000000000000000000000000001f40-2",
  "PART-transfers-varied-8|delivered-once|WriteLanes I15|retry|att-00000000000000000000000000001f40-8;Bank/Transfers acct-1 transfer@172;att-00000000000000000000000000001f44-2;Bank/Transfers acct-1 transfer@182;att-00000000000000000000000000001f44-3",
  "PART-transfers-varied-8|delivered-once|WriteLanes I16|retry|att-00000000000000000000000000001f40-8",
  "PART-transfers-varied-8|disposal|Actors I29|retry|att-00000000000000000000000000001f40-8",
  "PART-transfers-varied-8|lane-queue|WriteLanes I12|retry|att-00000000000000000000000000001f40-8",
  "PART-transfers-varied-8|lane-queue|WriteLanes I1|retry|att-00000000000000000000000000001f44-2;att-00000000000000000000000000001f44-3",
  "PART-transfers-varied-8|lane-queue|WriteLanes I8|retry|att-00000000000000000000000000001f44-2;att-00000000000000000000000000001f44-3",
  "PART-cells-stress-3-shrunk|selection|Turn I2|adopted|Checkout/Pay shopper-1@12",
  "PART-cells-stress-9-shrunk|lane-queue|WriteLanes I12|retry|att-00000000000000000000000000002328-3",
  "PART-cells-stress-9-shrunk|delivered-once|WriteLanes I16|retry|att-00000000000000000000000000002328-3",
  "PART-cells-stress-9-shrunk|delivered-once|WriteLanes I15|retry|att-00000000000000000000000000002328-3",
  "PART-transfers-stress-111-shrunk|lane-queue|WriteLanes I12|retry|att-0000000000000000000000000001b198-1",
  "PART-transfers-stress-111-shrunk|delivered-once|WriteLanes I16|retry|att-0000000000000000000000000001b198-1",
  "PART-transfers-stress-111-shrunk|delivered-once|WriteLanes I15|retry|att-0000000000000000000000000001b198-1",
  "PART-transfers-stress-111-shrunk|disposal|Actors I29|retry|att-0000000000000000000000000001b198-1",
  "PART-transfers-varied-109-shrunk|lane-queue|WriteLanes I12|retry|att-0000000000000000000000000001a9c8-1",
  "PART-transfers-varied-109-shrunk|delivered-once|WriteLanes I16|retry|att-0000000000000000000000000001a9c8-1",
  "PART-transfers-varied-109-shrunk|delivered-once|WriteLanes I15|retry|att-0000000000000000000000000001a9c8-1",
  "PART-transfers-varied-109-shrunk|disposal|Actors I29|retry|att-0000000000000000000000000001a9c8-1",
  "PART-transfers-varied-2001-shrunk|delivered-once|WriteLanes I16|flush|att-000000000000000000000000001e8868-1",
  "PART-transfers-varied-2001-shrunk|delivered-once|WriteLanes I15|flush|att-000000000000000000000000001e8868-1",
];

// RETURN_TYPE: the union, so both branches share one item type.
const itemOf = (text: string): PartItem => {
  const at = text.lastIndexOf("@");

  return at < 0
    ? { _tag: "Attempt", id: text }
    : { _tag: "Item", subject: text.slice(0, at), step: Number(text.slice(at + 1)) };
};

/**
 * Every owed part row, decoded.
 */
export const PART_ROWS: ReadonlyArray<PartRow> = ROWS.map((line) => {
  const [id = "", check = "", invariant = "", root = "", items = ""] = line.split("|");

  return {
    id,
    check,
    invariant,
    root: Schema.decodeUnknownSync(Root)(root),
    items: items.split(";").map(itemOf),
  };
});

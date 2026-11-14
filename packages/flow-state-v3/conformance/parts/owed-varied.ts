import { Schema } from "effect";

const Root = Schema.Literals(["retry", "unbound"]);

/**
 * The root a varied or new-mix script's owed row traces to: production's re-send past its budget
 * across a reload (`retry`, @task.V3.T19) or its restore of a disposed identity's unbound Held
 * head at a boot (`unbound`, @task.V3.T54).
 */
export type VariedRoot = "retry" | "unbound";

/**
 * Each first-break signature of the varied reds, with the root its traced representative showed
 * (T61, by signature): the soak run reports these as known and fails on any other.
 */
export const TRIAGED_SIGNATURES: ReadonlyMap<string, VariedRoot> = new Map([
  ["lane-queue WriteLanes I12", "retry"],
  ["delivered-once WriteLanes I15", "unbound"],
  ["delivered-once WriteLanes I15,disposal Actors I29", "unbound"],
  ["disposal Actors I29", "retry"],
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
  "PART-transfers-varied-2|lane-queue|WriteLanes I12|retry|att-2000-17",
  "PART-transfers-varied-2|delivered-once|WriteLanes I16|retry|att-2000-17",
  "PART-transfers-varied-2|delivered-once|WriteLanes I15|retry|att-2000-17",
  "PART-transfers-varied-2|disposal|Actors I32|retry|att-2000-17",
  "PART-transfers-varied-4|lane-queue|WriteLanes I12|retry|att-4000-16",
  "PART-transfers-varied-4|disposal|Actors I32|retry|att-4000-16",
  "PART-transfers-varied-4|delivered-once|WriteLanes I16|retry|att-4000-16",
  "PART-transfers-varied-4|delivered-once|WriteLanes I15|retry|att-4000-16",
  "PART-transfers-varied-4|delivered-once|Restore I6|retry|att-4000-16",
  "PART-transfers-varied-4|disposal|Actors I29|retry|att-4000-16",
  "PART-pay-varied-1|delivered-once|WriteLanes I15|unbound|att-1008-8;att-1005-7",
  "PART-pay-varied-1|disposal|Actors I29|unbound|att-1005-7;att-1008-8",
  "PART-pay-varied-2|delivered-once|WriteLanes I15|unbound|att-2006-20;att-2000-7;att-2006-12",
  "PART-pay-varied-2|disposal|Actors I29|unbound|att-2000-7;att-2006-12;att-2006-20",
  "PART-pay-varied-3|delivered-once|WriteLanes I15|unbound|att-3001-7",
  "PART-pay-varied-3|disposal|Actors I29|unbound|att-3001-7",
  "PART-pay-varied-4|delivered-once|WriteLanes I15|unbound|att-4001-41;att-4000-7;att-4001-15",
  "PART-pay-varied-4|disposal|Actors I29|unbound|att-4000-7;att-4001-15;att-4001-41",
  "PART-pay-varied-5|delivered-once|WriteLanes I15|unbound|att-5006-12;att-5003-11",
  "PART-pay-varied-5|disposal|Actors I29|unbound|att-5003-11;att-5006-12",
  "PART-pay-varied-6|delivered-once|WriteLanes I15|unbound|att-6002-7;att-6015-20;att-6006-8",
  "PART-pay-varied-6|disposal|Actors I29|unbound|att-6002-7;att-6006-8;att-6015-20",
  "PART-pay-varied-7|delivered-once|WriteLanes I15|unbound|att-7002-3;att-7004-26;att-7009-12",
  "PART-pay-varied-7|disposal|Actors I29|unbound|att-7002-3;att-7004-26;att-7009-12",
  "PART-pay-varied-8|delivered-once|WriteLanes I15|unbound|att-8001-7;att-8007-17;att-8008-15",
  "PART-pay-varied-8|disposal|Actors I29|unbound|att-8001-7;att-8007-17;att-8008-15",
  "PART-pay-varied-9|delivered-once|WriteLanes I15|unbound|att-9008-51;att-9006-25;att-9004-9",
  "PART-pay-varied-9|disposal|Actors I29|unbound|att-9004-9;att-9006-25;att-9008-51",
  "PART-pay-varied-10|delivered-once|WriteLanes I15|unbound|att-10004-11;att-10013-13",
  "PART-pay-varied-10|disposal|Actors I29|unbound|att-10004-11;att-10013-13",
  "PART-pay-varied-11|delivered-once|WriteLanes I15|unbound|att-11000-12;att-11001-15;att-11000-19;att-11004-19;att-11005-29",
  "PART-pay-varied-11|disposal|Actors I29|unbound|att-11000-12;att-11000-19;att-11001-15;att-11004-19;att-11005-29",
  "PART-pay-varied-11|lane-queue|WriteLanes I12|unbound|att-11000-12;att-11001-15",
  "PART-pay-varied-11|lane-queue|WriteLanes I1|unbound|att-11001-15",
  "PART-pay-varied-11|delivered-once|WriteLanes I16|unbound|att-11001-15;att-11000-12",
  "PART-pay-varied-12|delivered-once|WriteLanes I15|unbound|att-12001-7",
  "PART-pay-varied-12|disposal|Actors I29|unbound|att-12001-7",
  "PART-cells-varied-1|lane-queue|WriteLanes I12|retry|att-1001-18",
  "PART-cells-varied-1|disposal|Actors I29|retry|att-1001-18",
  "PART-cells-varied-2|delivered-once|WriteLanes I15|unbound|att-2006-49;att-2004-32;att-2003-17",
  "PART-cells-varied-2|disposal|Actors I29|unbound|att-2003-17;att-2004-32;att-2006-49",
  "PART-cells-varied-2|lane-queue|WriteLanes I12|unbound|att-2004-32",
  "PART-cells-varied-2|delivered-once|WriteLanes I16|unbound|att-2004-32",
  "PART-cells-varied-3|delivered-once|WriteLanes I15|unbound|att-3004-6;att-3005-14",
  "PART-cells-varied-3|disposal|Actors I29|unbound|att-3004-6;att-3005-14",
  "PART-cells-varied-4|delivered-once|WriteLanes I15|unbound|att-4000-7;att-4012-9",
  "PART-cells-varied-4|disposal|Actors I29|unbound|att-4000-7;att-4012-9",
  "PART-cells-varied-6|delivered-once|WriteLanes I15|unbound|att-6001-24;att-6017-13;att-6006-13",
  "PART-cells-varied-6|disposal|Actors I29|unbound|att-6001-24;att-6006-13;att-6017-13",
  "PART-cells-varied-7|delivered-once|WriteLanes I15|unbound|att-7006-8;att-7000-7;att-7011-12",
  "PART-cells-varied-7|disposal|Actors I29|unbound|att-7000-7;att-7006-8;att-7011-12",
  "PART-cells-varied-8|delivered-once|WriteLanes I15|unbound|att-8004-16;att-8000-9;att-8015-12",
  "PART-cells-varied-8|disposal|Actors I29|unbound|att-8000-9;att-8004-16;att-8015-12",
  "PART-cells-varied-9|delivered-once|WriteLanes I15|unbound|att-9003-7;att-9014-13",
  "PART-cells-varied-9|disposal|Actors I29|unbound|att-9003-7;att-9014-13",
  "PART-cells-varied-10|delivered-once|WriteLanes I15|unbound|att-10002-6;att-10010-16;att-10012-14",
  "PART-cells-varied-10|disposal|Actors I29|unbound|att-10002-6;att-10010-16;att-10012-14",
  "PART-cells-varied-11|delivered-once|WriteLanes I15|unbound|att-11006-14;att-11000-11",
  "PART-cells-varied-11|disposal|Actors I29|unbound|att-11000-11;att-11006-14",
  "PART-cells-varied-12|delivered-once|WriteLanes I15|unbound|att-12003-8;att-12009-14;att-12006-12",
  "PART-cells-varied-12|disposal|Actors I29|unbound|att-12003-8;att-12006-12;att-12009-14",
  "MIX-sync+transfers+sign-in+pay-stress-1|delivered-once|WriteLanes I15|unbound|att-1000-25;att-1001-13",
  "MIX-sync+transfers+sign-in+pay-stress-1|disposal|Actors I29|unbound|att-1000-25;att-1001-13",
  "MIX-sync+transfers+sign-in+pay-stress-1|lane-queue|WriteLanes I12|retry|att-1000-67;att-1001-13",
  "MIX-sync+transfers+sign-in+pay-stress-1|delivered-once|WriteLanes I16|retry|att-1001-13",
  "MIX-sync+transfers+sign-in+pay-stress-5|delivered-once|WriteLanes I15|unbound|att-5000-38",
  "MIX-sync+transfers+sign-in+pay-stress-5|disposal|Actors I29|unbound|att-5000-38",
  "MIX-sync+transfers+sign-in+pay-stress-6|delivered-once|WriteLanes I15|unbound|att-6001-11",
  "MIX-sync+transfers+sign-in+pay-stress-6|disposal|Actors I29|unbound|att-6001-11",
  "MIX-sync+transfers+sign-in+pay-stress-7|delivered-once|WriteLanes I15|unbound|att-7000-32",
  "MIX-sync+transfers+sign-in+pay-stress-7|disposal|Actors I29|unbound|att-7000-32",
  "MIX-sync+transfers+sign-in+pay-stress-8|delivered-once|WriteLanes I15|unbound|att-8000-39",
  "MIX-sync+transfers+sign-in+pay-stress-8|disposal|Actors I29|unbound|att-8000-39",
  "MIX-sync+transfers+sign-in+pay-stress-12|delivered-once|WriteLanes I15|unbound|att-12000-37",
  "MIX-sync+transfers+sign-in+pay-stress-12|disposal|Actors I29|unbound|att-12000-37",
  "PART-transfers-varied-101|lane-queue|WriteLanes I12|retry|att-101000-15",
  "PART-transfers-varied-101|delivered-once|WriteLanes I16|retry|att-101000-15",
  "PART-transfers-varied-101|delivered-once|WriteLanes I15|retry|att-101000-15;att-101008-11;Bank/Transfers acct-1 transfer@173",
  "PART-transfers-varied-101|lane-queue|WriteLanes I8|retry|att-101008-11",
  "PART-transfers-varied-101|lane-queue|WriteLanes I1|retry|att-101008-11",
  "PART-transfers-varied-101|disposal|Actors I29|retry|att-101000-15",
  "PART-transfers-varied-102|lane-queue|WriteLanes I12|retry|att-102000-43",
  "PART-transfers-varied-104|lane-queue|WriteLanes I12|retry|att-104001-5",
  "PART-transfers-varied-104|delivered-once|WriteLanes I16|retry|att-104001-5",
  "PART-transfers-varied-104|delivered-once|WriteLanes I15|retry|att-104001-5",
  "PART-transfers-varied-104|disposal|Actors I29|retry|att-104001-5",
  "PART-transfers-varied-105|lane-queue|WriteLanes I12|retry|att-105000-20",
  "PART-pay-varied-101|delivered-once|WriteLanes I15|unbound|att-101002-14",
  "PART-pay-varied-101|disposal|Actors I29|unbound|att-101002-14",
  "PART-pay-varied-103|disposal|Actors I29|retry|att-103000-34",
  "PART-pay-varied-103|lane-queue|WriteLanes I12|retry|att-103000-34",
  "PART-pay-varied-103|delivered-once|WriteLanes I16|retry|att-103000-34",
  "PART-pay-varied-103|delivered-once|WriteLanes I15|retry|att-103000-34",
  "PART-pay-varied-104|delivered-once|WriteLanes I15|unbound|att-104001-6;att-104005-13;att-104013-54",
  "PART-pay-varied-104|disposal|Actors I29|unbound|att-104001-6;att-104005-13;att-104013-54",
  "PART-pay-varied-105|delivered-once|WriteLanes I15|unbound|att-105003-6;att-105009-12;att-105019-19",
  "PART-pay-varied-105|disposal|Actors I29|unbound|att-105003-6;att-105009-12;att-105019-19",
  "PART-pay-varied-106|delivered-once|WriteLanes I15|unbound|att-106000-7",
  "PART-pay-varied-106|disposal|Actors I29|unbound|att-106000-7",
  "PART-pay-varied-107|delivered-once|WriteLanes I15|unbound|att-107000-7;att-107019-13",
  "PART-pay-varied-107|disposal|Actors I29|unbound|att-107000-7;att-107019-13",
  "PART-pay-varied-108|delivered-once|WriteLanes I15|unbound|att-108001-26",
  "PART-pay-varied-108|disposal|Actors I29|unbound|att-108001-26",
  "PART-pay-varied-109|delivered-once|WriteLanes I15|unbound|att-109005-32;att-109001-7;att-109005-9",
  "PART-pay-varied-109|disposal|Actors I29|unbound|att-109001-7;att-109005-9;att-109005-32",
  "PART-pay-varied-110|delivered-once|WriteLanes I15|unbound|att-110001-20;att-110000-31;att-110000-7",
  "PART-pay-varied-110|disposal|Actors I29|unbound|att-110000-7;att-110000-31;att-110001-20",
  "PART-pay-varied-111|delivered-once|WriteLanes I15|unbound|att-111009-20;att-111001-7;att-111005-36",
  "PART-pay-varied-111|disposal|Actors I29|unbound|att-111001-7;att-111005-36;att-111009-20",
  "PART-pay-varied-112|delivered-once|WriteLanes I15|unbound|att-112002-8;att-112000-7;att-112012-13",
  "PART-pay-varied-112|disposal|Actors I29|unbound|att-112000-7;att-112002-8;att-112012-13",
  "PART-cells-varied-101|delivered-once|WriteLanes I15|unbound|att-101014-7;att-101003-6;att-101008-23",
  "PART-cells-varied-101|disposal|Actors I29|unbound|att-101003-6;att-101008-23;att-101014-7",
  "PART-cells-varied-102|delivered-once|WriteLanes I15|unbound|att-102007-6;att-102010-17",
  "PART-cells-varied-102|disposal|Actors I29|unbound|att-102007-6;att-102010-17",
  "PART-cells-varied-103|lane-queue|WriteLanes I12|retry|att-103000-53;att-103000-20;att-103000-42",
  "PART-cells-varied-103|lane-queue|WriteLanes I1|retry|att-103000-53;att-103000-20",
  "PART-cells-varied-103|delivered-once|WriteLanes I16|retry|att-103000-53;att-103000-20",
  "PART-cells-varied-103|delivered-once|WriteLanes I15|retry|att-103000-53;att-103000-20",
  "PART-cells-varied-103|disposal|Actors I29|retry|att-103000-42",
  "PART-cells-varied-105|delivered-once|WriteLanes I15|unbound|att-105001-9;att-105002-14",
  "PART-cells-varied-105|disposal|Actors I29|unbound|att-105001-9;att-105002-14",
  "PART-cells-varied-106|delivered-once|WriteLanes I15|unbound|att-106004-23;att-106002-15",
  "PART-cells-varied-106|disposal|Actors I29|unbound|att-106002-15;att-106004-23",
  "PART-cells-varied-107|delivered-once|WriteLanes I15|unbound|att-107005-16;att-107001-15;att-107004-12",
  "PART-cells-varied-107|disposal|Actors I29|unbound|att-107001-15;att-107004-12;att-107005-16",
  "PART-cells-varied-108|delivered-once|WriteLanes I15|unbound|att-108000-11;att-108001-16;att-108012-13",
  "PART-cells-varied-108|disposal|Actors I29|unbound|att-108000-11;att-108001-16;att-108012-13",
  "PART-cells-varied-109|delivered-once|WriteLanes I15|unbound|att-109000-7;att-109003-23;att-109000-48",
  "PART-cells-varied-109|disposal|Actors I29|unbound|att-109000-7;att-109000-48;att-109003-23",
  "PART-cells-varied-110|lane-queue|WriteLanes I12|retry|att-110000-25",
  "PART-cells-varied-110|lane-queue|WriteLanes I1|retry|att-110000-25",
  "PART-cells-varied-110|delivered-once|WriteLanes I16|retry|att-110000-25",
  "PART-cells-varied-110|delivered-once|WriteLanes I15|retry|att-110000-25;att-110006-8;att-110012-18",
  "PART-cells-varied-110|disposal|Actors I29|retry|att-110006-8;att-110012-18",
  "PART-cells-varied-110|late-results|WriteLanes I23|retry|att-110000-25",
  "PART-cells-varied-111|delivered-once|WriteLanes I15|unbound|att-111001-7;att-111004-14",
  "PART-cells-varied-111|disposal|Actors I29|unbound|att-111001-7;att-111004-14",
  "PART-cells-varied-112|delivered-once|WriteLanes I15|unbound|att-112001-7;att-112008-13",
  "PART-cells-varied-112|disposal|Actors I29|unbound|att-112001-7;att-112008-13",
  "MIX-sync+transfers+sign-in+pay-stress-101|lane-queue|WriteLanes I12|retry|att-101000-65",
  "MIX-sync+transfers+sign-in+pay-stress-102|delivered-once|WriteLanes I15|unbound|att-102001-28",
  "MIX-sync+transfers+sign-in+pay-stress-102|disposal|Actors I29|unbound|att-102001-28",
  "MIX-sync+transfers+sign-in+pay-stress-103|delivered-once|WriteLanes I15|unbound|att-103003-12",
  "MIX-sync+transfers+sign-in+pay-stress-103|disposal|Actors I29|unbound|att-103003-12",
  "MIX-sync+transfers+sign-in+pay-stress-110|delivered-once|WriteLanes I15|unbound|att-110000-55",
  "MIX-sync+transfers+sign-in+pay-stress-110|disposal|Actors I29|unbound|att-110000-55",
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

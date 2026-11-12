import assert from "node:assert/strict";
import { describe, it } from "vite-plus/test";
import type { Impossible, table } from "../core/cells.ts";
import type { Operation, Values } from "../core/compiled.ts";
import type { Ending, Head, Lane, Parked, Phase, World } from "../core/world.ts";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

type CaseKeys<T extends { readonly _tag: string }, Tag extends T["_tag"]> = Exclude<
  keyof Extract<T, { readonly _tag: Tag }>,
  "_tag"
>;

// A head's history is its Phase tag, an ending's tries a tag, a lane's id and key are derived and
// the ticket map is gone: exact key sets, so a renamed or added flag fails (T51 acceptance).
const exactRecords = [
  true satisfies Equal<
    keyof Head,
    "id" | "input" | "retryCount" | "mayHaveApplied" | "owner" | "phase"
  >,
  true satisfies Equal<
    Phase["_tag"],
    | "Acknowledging"
    | "Unsent"
    | "Withdrawing"
    | "Recapturing"
    | "Resending"
    | "OnWire"
    | "Cancelling"
    | "Held"
  >,
  true satisfies Equal<CaseKeys<Phase, "Acknowledging">, "ticket">,
  true satisfies Equal<CaseKeys<Phase, "Unsent">, never>,
  true satisfies Equal<CaseKeys<Phase, "Withdrawing">, "ticket">,
  true satisfies Equal<CaseKeys<Phase, "Recapturing">, "ticket">,
  true satisfies Equal<CaseKeys<Phase, "Resending">, never>,
  true satisfies Equal<CaseKeys<Phase, "OnWire">, "call">,
  true satisfies Equal<CaseKeys<Phase, "Cancelling">, "call">,
  true satisfies Equal<CaseKeys<Phase, "Held">, never>,
  true satisfies Equal<
    keyof Ending,
    | "operation"
    | "attempt"
    | "lane"
    | "channel"
    | "reason"
    | "value"
    | "owner"
    | "current"
    | "tries"
  >,
  true satisfies Equal<keyof Parked, "lane" | "actor" | "operation" | "endings">,
  true satisfies Equal<keyof Lane, "actor" | "operation" | "head">,
  true satisfies Equal<
    keyof World,
    | "incarnations"
    | "records"
    | "lanes"
    | "parked"
    | "kept"
    | "reads"
    | "mail"
    | "uses"
    | "timers"
    | "counter"
    | "persistence"
    | "disposal"
  >,
];

type Table = typeof table;

type StateTag = "Idle" | "Kept" | Phase["_tag"];

type Rows =
  | "CommitReject"
  | "CommitCancel"
  | "Retry"
  | "Cancel"
  | "TurnEnded"
  | "Stored"
  | "Refused"
  | "Settled"
  | "Ended"
  | "Keep"
  | "DisposalStarts"
  | "BoundPassed";

type RowsTotal = { readonly [R in Rows]: Equal<keyof Table[R], StateTag> };

// The lane is one table: every cue has a cell for every lane state, and the two cells the table
// leaves open (a cancel-policy commit on a Kept lane, a kept unknown on a Held head) are
// Impossible until slice 1 rules them (WriteLanes Q5).
const totality = [
  true satisfies Equal<keyof Table, Rows>,
  true satisfies Equal<RowsTotal[Rows], true>,
  true satisfies Equal<ReturnType<Table["CommitCancel"]["Kept"]>, Impossible>,
  true satisfies Equal<ReturnType<Table["Keep"]["Held"]>, Impossible>,
];

type ReadCall = Extract<Operation, { readonly _tag: "Read" }>["call"]["run"];

// A lookup is called with its input alone: no Attempt, and nothing standing in for one (Reads I21).
const lookupInputOnly = [
  true satisfies Equal<[ReadCall] extends [never] ? "missing" : "present", "present">,
  true satisfies Equal<Parameters<ReadCall>, [input: Values]>,
];

describe("lane records and table", () => {
  it("phases, tries and the table are exact, and a lookup gets no Attempt (T51 acceptance, WriteLanes Q5, Reads I21)", () => {
    assert.ok([...exactRecords, ...totality, ...lookupInputOnly].every(Boolean));
  });
});

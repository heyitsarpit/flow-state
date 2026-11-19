import assert from "node:assert/strict";
import { describe, it } from "vite-plus/test";
import type { Impossible, LaneState, table } from "../core/cells.ts";
import type { Operation, Values } from "../core/compiled.ts";
import type { Delivery, Owed } from "../core/ledger.ts";
import type { Head, Lane, Phase, World } from "../core/world.ts";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

type CaseKeys<T extends { readonly _tag: string }, Tag extends T["_tag"]> = Exclude<
  keyof Extract<T, { readonly _tag: Tag }>,
  "_tag"
>;

// A head's history is its Phase tag, a lane holds its Attempt and nothing else, an ending is one
// owed row with its Delivery a tag, and a lane's id and key are derived: exact key sets, so a
// renamed or added flag fails (WriteLanes R6, R10, I36).
const exactRecords = [
  true satisfies Equal<keyof Head, "id" | "input" | "retryCount" | "owner" | "phase">,
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
  true satisfies Equal<LaneState["_tag"], "Idle" | "Head">,
  true satisfies Equal<Delivery["_tag"], "Queued" | "Retrying" | "Waiting" | "Kept">,
  true satisfies Equal<
    keyof Owed,
    | "id"
    | "actor"
    | "to"
    | "operation"
    | "attempt"
    | "lane"
    | "channel"
    | "reason"
    | "value"
    | "route"
    | "delivery"
  >,
  true satisfies Equal<keyof Lane, "actor" | "operation" | "head" | "queue">,
  true satisfies Equal<
    keyof World,
    | "incarnations"
    | "records"
    | "lanes"
    | "owed"
    | "reads"
    | "displaced"
    | "mail"
    | "uses"
    | "timers"
    | "counter"
    | "attempts"
    | "persistence"
    | "marked"
    | "withheld"
    | "quarantined"
    | "ended"
    | "life"
    | "lanesOfActor"
    | "laneOfWait"
    | "consumersOf"
    | "silenceOf"
    | "chains"
    | "chainCount"
  >,
];

type Table = typeof table;

type StateTag = "Idle" | Phase["_tag"];

type Rows =
  | "CommitReject"
  | "CommitLatest"
  | "CommitSerialize"
  | "CommitCancel"
  | "Retry"
  | "Cancel"
  | "TurnEnded"
  | "Stored"
  | "Refused"
  | "Answered"
  | "DisposalStarts"
  | "BoundPassed";

type RowsTotal = { readonly [R in Rows]: Equal<keyof Table[R], StateTag> };

// The lane is one table: every cue has a cell for every lane state, each policy's commit included;
// an answer reaches only a head on the wire.
const totality = [
  true satisfies Equal<keyof Table, Rows>,
  true satisfies Equal<RowsTotal[Rows], true>,
  true satisfies Equal<ReturnType<Table["Answered"]["Held"]>, Impossible>,
];

type ReadCall = Extract<Operation, { readonly _tag: "Read" }>["call"]["run"];

// A lookup is called with its input alone: no Attempt, and nothing standing in for one (Reads I21).
const lookupInputOnly = [
  true satisfies Equal<[ReadCall] extends [never] ? "missing" : "present", "present">,
  true satisfies Equal<Parameters<ReadCall>, [input: Values]>,
];

describe("lane records and table", () => {
  it("phases, rows and the table are exact, and a lookup gets no Attempt (WriteLanes R6, R7, Reads I21)", () => {
    assert.ok([...exactRecords, ...totality, ...lookupInputOnly].every(Boolean));
  });
});

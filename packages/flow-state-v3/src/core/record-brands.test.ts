import { Option } from "effect";
import { expect, it } from "vite-plus/test";
import type {
  ActorName,
  AttemptId,
  IdentityKey,
  LaneKey,
  OperationName,
  RecordKey,
  StateName,
} from "./identity.ts";
import { decodeRecords, type Restored } from "./record.ts";

type Actor = Restored["records"][number];

type RestoredLane = Restored["lanes"][number];

type Row = Restored["rows"][number];

const restored = decodeRecords(new Map(), new Map());

const [actor] = restored.records;
const [lane] = restored.lanes;
const [row] = restored.rows;

// A decoded record's identity, key, state, bindings, lanes and Attempts carry the brands of the
// checks that read them (Restore R5; Codec R5).
const branded: ReadonlyArray<unknown> = [
  actor?.key satisfies RecordKey | undefined,
  actor?.actor.name satisfies ActorName | undefined,
  actor?.state satisfies StateName | undefined,
  actor?.context.get("slot")?.name satisfies ActorName | undefined,
  [...(actor?.graph.keys() ?? [])][0] satisfies IdentityKey | undefined,
  [...(actor?.graph.values() ?? [])][0]?.get("slot")?.name satisfies ActorName | undefined,
  lane?.key satisfies RecordKey | undefined,
  lane?.id satisfies LaneKey | undefined,
  Option.map(lane?.lane ?? Option.none(), (l) => l.head.id satisfies AttemptId),
  Option.map(row?.attempt ?? Option.none(), (a) => a satisfies AttemptId),
  Option.map(row?.lane ?? Option.none(), (l) => l satisfies LaneKey),
  row?.operation satisfies OperationName | undefined,
];

// @ts-expect-error a decoded state is a StateName, not any text (Restore R5)
const state: Actor["state"] = "ANY";

// @ts-expect-error a decoded lane id is a LaneKey, not any text (Restore R5)
const id: RestoredLane["id"] = "lane";

// @ts-expect-error a decoded row's Attempt is an AttemptId, not any text (Restore R5)
const attempt: Row["attempt"] = Option.some("x");

// @ts-expect-error a decoded graph is keyed by IdentityKey, not any text (Restore R5)
const provider = actor?.graph.get("provider");

// @ts-expect-error a decoded row's operation is an OperationName, not any text (Restore R5)
const operation: Row["operation"] = "add";

it("Restore R5, Codec R5: decoded records carry the brands of the checks that read them", () => {
  expect([branded, state, id, attempt, provider, operation]).toHaveLength(6);
});

import { Schema } from "effect";
import { describe, expectTypeOf, it } from "vite-plus/test";
import { positionKey, workKey } from "./persist.ts";
import { AttemptId } from "./record-shape.ts";
import {
  type ActorId,
  type ActorKey,
  actorKey,
  type AttemptId as MintedAttempt,
  laneId,
  type LaneId,
} from "./world.ts";

const who: ActorId = { machine: "Test/Shelf", name: "s" };

describe("Actors R13: an actor key, a lane id and a record key are told apart by type", () => {
  it("one id passed where another belongs", () => {
    expectTypeOf(actorKey(who)).toEqualTypeOf<ActorKey>();
    expectTypeOf(laneId(who, "save", "{}")).toEqualTypeOf<LaneId>();
    expectTypeOf(positionKey(who)).toEqualTypeOf<string>();
    expectTypeOf(workKey(who)).toEqualTypeOf<string>();

    // @ts-expect-error Actors R13: an actor key is no lane id
    const asLane: LaneId = actorKey(who);
    // @ts-expect-error Actors R13: a lane id is no actor key
    const asKey: ActorKey = laneId(who, "save", "{}");

    void asLane;
    void asKey;
  });
});

describe("Records realization: an Attempt id is made by the mint or by its Schema's decode", () => {
  it("the decoded Attempt id is the minted one's type, and text is neither", () => {
    expectTypeOf<typeof AttemptId.Type>().toEqualTypeOf<MintedAttempt>();
    expectTypeOf(Schema.decodeUnknownSync(AttemptId)("att-x-1")).toEqualTypeOf<MintedAttempt>();

    expectTypeOf<"att-1">().not.toExtend<MintedAttempt>();
  });
});

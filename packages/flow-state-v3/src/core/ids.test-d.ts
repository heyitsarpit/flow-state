import { describe, expectTypeOf, it } from "vite-plus/test";
import { actorRecordKey, laneRecordKey } from "./record.ts";
import { type ActorId, type ActorKey, actorKey, laneId, type LaneId } from "./world.ts";

const who: ActorId = { machine: "Test/Shelf", name: "s" };

describe("Actors R13: an actor key, a lane id and a record key are told apart by type", () => {
  it("one id passed where another belongs", () => {
    expectTypeOf(actorKey(who)).toEqualTypeOf<ActorKey>();
    expectTypeOf(laneId(who, "save", "{}")).toEqualTypeOf<LaneId>();
    expectTypeOf(laneRecordKey(laneId(who, "save", "{}"))).toEqualTypeOf<string>();
    expectTypeOf(actorRecordKey(actorKey(who))).toEqualTypeOf<string>();

    // @ts-expect-error Actors R13: an actor key is no lane id
    laneRecordKey(actorKey(who));
    // @ts-expect-error Actors R13: a lane id is no actor key
    actorRecordKey(laneId(who, "save", "{}"));
    // @ts-expect-error Actors R13: text is no lane id
    laneRecordKey("whatever");
  });
});

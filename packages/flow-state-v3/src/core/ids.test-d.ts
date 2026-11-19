import { describe, expectTypeOf, it } from "vite-plus/test";
import { actorRecordKey, laneRecordKey } from "./record.ts";
import { type ActorId, actorKey, laneId } from "./world.ts";

// Inverted: each line marked `wrong` compiles today. When the id brands land the line fails the
// check: put `@ts-expect-error` on it, naming the rule. Each assertion of today's `string` then
// fails too: make it the exact brand.

const who: ActorId = { machine: "Test/Shelf", name: "s" };

describe("Actors R13: an actor key, a lane id and a record key are told apart by type", () => {
  it("one id passed where another belongs", () => {
    expectTypeOf(actorKey(who)).toEqualTypeOf<string>();
    expectTypeOf(laneId(who, "save", "{}")).toEqualTypeOf<string>();
    expectTypeOf(laneRecordKey(laneId(who, "save", "{}"))).toEqualTypeOf<string>();

    laneRecordKey(actorKey(who)); // wrong: an actor key is no lane id
    actorRecordKey(laneId(who, "save", "{}")); // wrong: a lane id is no actor key
    laneRecordKey("whatever"); // wrong: text is no lane id
    laneRecordKey(laneId(who, "save", "{}"));
    actorRecordKey(actorKey(who));
  });
});

import { Option } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { retiredOperation } from "./record.ts";
import type { makeServe } from "./serve.ts";
import { type Head, type Incarnation, IssueSource, laneId, Mail, NO_CHAIN } from "./world.ts";

const actor = { machine: "Test/Shelf", name: "s" };

type TurnRoute = Parameters<ReturnType<typeof makeServe>["turn"]>[3];

// Inverted: each line below compiles today, because the shape it writes is open text or an open
// mix of Options. When the core's shapes are typed, each line fails the type check: put
// `@ts-expect-error` on it, naming the rule it now enforces.
const today = () => [
  // Actors R21: a misspelt record-read reason compiles while reasons are free strings.
  retiredOperation(actor, "lane/Test/Shelf/s|save|{}", "operaton"),
  // Actors R13: any text is an incarnation id, so its start order can be parsed back out of it.
  "not minted" satisfies Incarnation["id"],
  // Actors R13: a lane id passes where an Attempt id is wanted.
  laneId(actor, "save", "{}") satisfies Head["id"],
  // Actors R13: mail that follows no chain carries the number 0.
  Mail.Event({ actor, tag: "Noted", payload: {}, chain: NO_CHAIN }),
  // Turn R25: a turn's route may name an own lane and lateness with no ending, under an event's
  // source.
  {
    late: Option.some(1),
    own: Option.some("lane"),
    ending: Option.none(),
    source: IssueSource.Event({ tag: "Noted" }),
  } satisfies TurnRoute,
];

describe("the core's open shapes (inverted until they are typed)", () => {
  it("Actors R13, R21, Turn R25: the lines above compile today", () => {
    expect(today()).toHaveLength(5);
  });
});

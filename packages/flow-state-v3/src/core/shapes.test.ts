import { Brand, Option } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { Audience, Delivery, type Owed, type OwedId, Route } from "./ledger.ts";
import { retiredOperation } from "./record.ts";
import { Cause } from "./serve.ts";
import { activation, chain, incarnation } from "./test/ids.ts";
import { type ActivationId, type Head, type Incarnation, laneId, Mail, OwnedBy } from "./world.ts";

const actor = { machine: "Test/Shelf", name: "s" };

const row: Owed = {
  id: Brand.nominal<OwedId>()("owed-1"),
  actor,
  to: Audience.Identity(),
  operation: "save",
  attempt: Option.none(),
  lane: Option.some(laneId(actor, "save", "{}")),
  channel: "unknown",
  reason: "Lost",
  value: undefined,
  route: Route.Current(),
  delivery: Delivery.Queued(),
};

// Each pair is a control that must compile and the wrong shape beside it, which must not.
const typed = () => [
  // Actors R13: only the mint makes an incarnation id; text is not one.
  incarnation("inc-1") satisfies Incarnation["id"],
  // @ts-expect-error Actors R13: a bare string is no incarnation id
  "not minted" satisfies Incarnation["id"],

  // Turn R21: the root owns its work by its tag, a state by its minted activation.
  OwnedBy.Root() satisfies Head["owner"],
  // @ts-expect-error Turn R21: the number 0 is no owner
  0 satisfies Head["owner"],
  activation(7) satisfies Incarnation["activations"][number],
  // @ts-expect-error Turn R21: a bare number is no activation
  7 satisfies Incarnation["activations"][number],

  // Actors R13: mail that follows no chain says so; a chain is minted.
  Mail.Event({ actor, tag: "Noted", payload: {}, chain: Option.none() }),
  Mail.Event({ actor, tag: "Noted", payload: {}, chain: Option.some(chain(1)) }),
  // @ts-expect-error Actors R13: the number 0 is no chain
  Mail.Event({ actor, tag: "Noted", payload: {}, chain: 0 }),

  // Turn R25, R21: only an ending's turn has a row, an own lane and lateness.
  Cause.Ending({ row, late: Option.none<ActivationId>() }),
  Cause.Event({ tag: "Noted" }),
  // @ts-expect-error Turn R25: an event's turn carries no ending row
  Cause.Event({ tag: "Noted", row }),
  // @ts-expect-error Turn R21: a schedule's turn is never late
  Cause.Firing({ schedule: "tick", late: Option.some(activation(1)) }),
];

// Inverted: this line compiles today, because a record-read reason is a free string. When reasons
// are typed it fails the type check: replace it with the typed pair.
const today = () => [
  // Actors R21: a misspelt record-read reason compiles while reasons are free strings.
  retiredOperation(actor, "lane/Test/Shelf/s|save|{}", "operaton"),
];

describe("the core's typed shapes", () => {
  it("Actors R13, R21, Turn R21, R25: the controls above compile and the wrong shapes do not", () => {
    expect(typed()).toHaveLength(13);
    expect(today()).toHaveLength(1);
  });
});

import { Brand, Option } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { Audience, Delivery, Origin, type Owed, type OwedId, Route } from "./ledger.ts";
import { Trigger } from "./serve.ts";
import { activation, chain, incarnation } from "./test/ids.ts";
import {
  type ActivationId,
  type Head,
  type Incarnation,
  laneId,
  Mail,
  OwnedBy,
  Quarantine,
} from "./world.ts";

const actor = { machine: "Test/Shelf", name: "s" };

const row: Owed = {
  id: Brand.nominal<OwedId>()("owed-1"),
  origin: Origin.Decided(),
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
  Mail.Event({ actor, tag: "Noted", payload: {}, chain: Option.none(), resendable: true }),
  Mail.Event({ actor, tag: "Noted", payload: {}, chain: Option.some(chain(1)), resendable: true }),
  // @ts-expect-error Actors R13: the number 0 is no chain
  Mail.Event({ actor, tag: "Noted", payload: {}, chain: 0, resendable: true }),

  // Turn R25, R21: only an ending's turn has a row, an own lane and lateness.
  Trigger.Ending({ row, late: Option.none<ActivationId>() }),
  Trigger.Event({ tag: "Noted", resendable: true }),
  // @ts-expect-error Turn R25: an event's turn carries no ending row
  Trigger.Event({ tag: "Noted", resendable: true, row }),
  // @ts-expect-error Turn R21: a schedule's turn is never late
  Trigger.Firing({ schedule: "tick", late: Option.some(activation(1)) }),
];

const quarantines = () => [
  // Actors R21: a record the boot could not read names its reason from the catalogue; a retired
  // hold names its operation, so forget never reads a reason's text.
  Quarantine.Unreadable({ code: "operation", detail: Option.none() }),
  Quarantine.Retired({ actor, operation: "save", lane: laneId(actor, "save", "{}") }),
  // @ts-expect-error Actors R21: a misspelt reason is no read failure
  Quarantine.Unreadable({ code: "operaton", detail: Option.none() }),

  // WriteLanes I15: Flow's restored marker is the row's origin, never its reason.
  { ...row, origin: Origin.HeldAtStart() } satisfies Owed,
  // @ts-expect-error WriteLanes I15: the reason text is no origin
  { ...row, origin: "Restored" } satisfies Owed,
];

describe("the core's typed shapes", () => {
  it("Actors R13, R21, Turn R21, R25, WriteLanes I15: the controls above compile and the wrong shapes do not", () => {
    expect(typed()).toHaveLength(13);
    expect(quarantines()).toHaveLength(5);
  });
});

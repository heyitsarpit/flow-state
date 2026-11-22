import { Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { layerIndexedDb } from "../../src/host/persistence.ts";
import { Story } from "../../src/host/testing/index.ts";
import { actorRef, app, definition, Flow, machine, runtimeSetup } from "../../src/index.ts";
import { played } from "../rules/played.ts";
import { timersOf } from "../timers.ts";

// A turn its source cannot send again commits when its own schedule start is refused, as an
// operation's outcome does (Schedules R11): an onContext reaction, which fires again only on the
// next change. A policy holds the delay; a timer reads it as context and arms on entry.

const Policy = definition({
  id: "Unrepeatable/Policy",
  states: ["SET"],
  events: { Choose: { ms: Schema.Number } },
  memory: { ms: Flow.initial(Schema.Number, 2 ** 31) },
});

const PolicyMachine = machine(Policy, ({ S }) => ({
  default: S.SET,
  on: { Choose: { updateMemory: ({ event }) => ({ ms: event.ms }) } },
}));

const Timer = definition({
  id: "Unrepeatable/Timer",
  states: ["IDLE", "WAITING"],
  events: {},
  internalEvents: { Chosen: { ms: Schema.Number }, Rang: {} },
  memory: { ms: Flow.initial(Schema.Number, 0), rang: Flow.initial(Schema.Number, 0) },
  context: { ms: Flow.context(Policy.M.ms) },
  schedules: { ring: {} },
});

const TimerMachine = machine(Timer, ({ S, E, C }) => ({
  default: S.IDLE,
  onContext: [C.ms.change({ event: E.Chosen.from((ms) => ({ ms })) })],
  on: {
    Chosen: { target: S.WAITING, updateMemory: ({ event }) => ({ ms: event.ms }) },
    Rang: { updateMemory: ({ memory }) => ({ rang: memory.rang + 1 }) },
  },
  states: {
    WAITING: {
      on: { Chosen: { updateMemory: ({ event }) => ({ ms: event.ms }) } },
      schedules: { ring: { schedule: ({ memory }) => memory.ms, send: E.Rang } },
    },
  },
}));

const policy = actorRef(PolicyMachine, "policy");

const timer = actorRef(TimerMachine, "timer");

const setup = runtimeSetup({
  app: app({
    id: "unrepeatable",
    machines: { policy: PolicyMachine, timer: { machine: TimerMachine, context: { ms: policy } } },
  }),
  services: layerIndexedDb(),
  scope: "unrepeatable",
  persistence: { captureMs: 0 },
});

describe("a turn its source cannot send again (Schedules R11)", () => {
  it("Schedules R11: an onContext reaction whose own arm has a bad delay commits with the start refused and its issue, and the next valid delay arms it", async () => {
    const run = await played(
      Story.app(setup, { id: "turn/unrepeatable-reaction", fixtures: [] })
        .ensure(policy)
        .ensure(timer)
        .send(policy, Policy.E.Choose({ ms: 2 ** 31 + 1 }))
        .checkpoint("refused")
        .send(policy, Policy.E.Choose({ ms: 60_000 }))
        .checkpoint("armed"),
    );

    const at = (name: "refused" | "armed") => {
      const snapshot = run.checkpoints[name].read(timer);

      return {
        state: snapshot?.state,
        timers: timersOf(snapshot),
        issues: (snapshot?.issues ?? []).map(
          (i) => `${String(i.path.at(-1))} ${String(i.details["slot"])}`,
        ),
      };
    };

    expect([at("refused"), at("armed")]).toEqual([
      {
        state: "WAITING",
        timers: {},
        issues: ["schedule ring states.WAITING.schedules.ring.schedule"],
      },
      { state: "WAITING", timers: { ring: { dueAt: 60_000 } }, issues: [] },
    ]);
  });
});

import { makeFreezer } from "./frozen.ts";
import { Option, Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { definition } from "../definition.ts";
import { Flow } from "../flow.ts";
import { machine } from "../machine.ts";
import { Input } from "./input.ts";
import { Life } from "./life.ts";
import { pendingOwners } from "./serve.ts";
import { step } from "./step.ts";
import { actorKey, emptyWorld, type Lane, Mail, Phase } from "./world.ts";

const actor = { machine: "Test/Shelf", name: "s" };

// RETURN_TYPE: a non-Idle lane as the World holds it.
const lane = (phase: Phase, owner: number, queued: ReadonlyArray<number>): Lane => ({
  actor,
  operation: "save",
  head: { id: "att-1", input: {}, retryCount: 0, owner, phase },
  queue: queued.map((q) => ({ input: {}, owner: q })),
});

describe("pending work a late turn may not leave (Turn R21, I27)", () => {
  it("Turn R21: an InFlight head and every queued commit, behind a Held head too, own pending work; a Held head does not", () => {
    const lanes = [lane(Phase.Unsent(), 3, [4]), lane(Phase.Held(), 5, [6, 7])];

    expect([...pendingOwners(lanes, actor)].toSorted((a, b) => a - b)).toEqual([3, 4, 6, 7]);
    expect([...pendingOwners(lanes, { ...actor, name: "other" })]).toEqual([]);
  });
});

const Lead = definition({
  id: "Serve/Lead",
  states: ["ON"],
  events: { Rename: { name: Schema.String } },
  memory: { name: Flow.initial(Schema.String, "") },
});

const LeadMachine = machine(Lead, ({ S }) => ({
  default: S.ON,
  on: { Rename: { updateMemory: ({ event }) => ({ name: event.name }) } },
}));

const Line = definition({
  id: "Serve/Line",
  states: ["ON"],
  events: {},
  internalEvents: { Noted: {}, Renamed: {} },
  memory: { seen: Flow.initial(Schema.String, "") },
  context: { name: Lead.Provider.select(Schema.String, (l) => l.memory.name) },
});

const LineMachine = machine(Line, ({ S, E }) => ({
  default: S.ON,
  onContext: [{ select: ({ context }) => context.name, event: E.Renamed }],
  on: {
    Noted: { updateMemory: ({ memory }) => ({ seen: `${memory.seen}n` }) },
    Renamed: { updateMemory: ({ memory }) => ({ seen: `${memory.seen}r` }) },
  },
}));

const lead = { machine: "Serve/Lead", name: "lead" };
const line = { machine: "Serve/Line", name: "line" };

describe("a context update that waits for its providers (Actors R19)", () => {
  // No Story queues mail behind a waiting update in one step: the mailboxes are set by hand.
  it("Actors R19: a context update deferred while its provider has mail keeps its place, so the mail behind it stays behind it", () => {
    const machines = new Map([
      [lead.machine, { ...LeadMachine.compiled, wiring: new Map() }],
      [line.machine, { ...LineMachine.compiled, wiring: new Map([["name", lead]]) }],
    ]);

    const env = { now: 0, seed: "0", admit: makeFreezer() };
    const open = { ...emptyWorld(false), life: Life.Open() };

    const ensured = step(
      machines,
      open,
      Input.Ensure({
        actor: line,
        use: Option.some("story"),
        existing: false,
        wiring: Option.none(),
      }),
      env,
    ).world;

    // The line's update comes first in rotation, while its provider still has a rename queued.
    const queued = {
      ...ensured,
      mail: new Map([
        [
          actorKey(line),
          [Mail.Context({ actor: line }), Mail.Event({ actor: line, tag: "Noted", payload: {} })],
        ],
        [actorKey(lead), [Mail.Event({ actor: lead, tag: "Rename", payload: { name: "Core" } })]],
      ]),
    };

    const served = step(machines, queued, Input.Serve(), env).world;

    expect(served.incarnations.get(actorKey(line))?.memory).toEqual({ seen: "rn" });
  });
});

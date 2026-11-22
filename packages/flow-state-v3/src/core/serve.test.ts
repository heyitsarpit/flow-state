import { makeFreezer } from "./frozen.ts";
import { Option, Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { type ActorRef, definition } from "../definition.ts";
import { loose } from "../test/loose.ts";
import { Flow } from "../flow.ts";
import { machine } from "../machine.ts";
import { send } from "../send.ts";
import { RuntimeDefaults } from "./defaults.ts";
import { Input } from "./input.ts";
import { Life } from "./life.ts";
import { pendingOwners } from "./serve.ts";
import { step } from "./step.ts";
import { activation, attempt, chain } from "./test/ids.ts";
import { actorKey, emptyWorld, type Lane, Mail, OwnedBy, Phase } from "./world.ts";

const actor = { machine: "Test/Shelf", name: "s" };

const ownedBy = (n: number) => OwnedBy.State({ activation: activation(n) });

// RETURN_TYPE: a non-Idle lane as the World holds it.
const lane = (phase: Phase, owner: number, queued: ReadonlyArray<number>): Lane => ({
  actor,
  operation: "save",
  head: { id: attempt("att-1"), input: {}, retryCount: 0, owner: ownedBy(owner), phase },
  queue: queued.map((q) => ({ input: {}, owner: ownedBy(q) })),
});

describe("pending work a late turn may not leave (Turn R21, I27)", () => {
  it("Turn R21: an InFlight head and every queued commit, behind a Held head too, own pending work; a Held head does not", () => {
    const lanes = [lane(Phase.Unsent(), 3, [4]), lane(Phase.Held(), 5, [6, 7])];

    expect([...pendingOwners(lanes)].toSorted((a, b) => a - b)).toEqual([3, 4, 6, 7]);
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
  context: { name: Flow.context(Lead.M.name) },
});

const LineMachine = machine(Line, ({ S, E, C }) => ({
  default: S.ON,
  onContext: [C.name.change({ event: E.Renamed })],
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

    const env = { now: 0, seed: "0", admit: makeFreezer(), step: () => Option.none() };
    const open = { ...emptyWorld(false), life: Life.Open() };

    const ensured = step(
      machines,
      open,
      Input.Ensure({
        actor: line,
        use: Option.some("story"),
        start: "create",
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
          [
            Mail.Context({ actor: line, chain: Option.none() }),
            Mail.Event({ actor: line, tag: "Noted", payload: {}, chain: Option.none() }),
          ],
        ],
        [
          actorKey(lead),
          [
            Mail.Event({
              actor: lead,
              tag: "Rename",
              payload: { name: "Core" },
              chain: Option.none(),
            }),
          ],
        ],
      ]),
    };

    const served = step(machines, queued, Input.Serve(), env).world;

    expect(served.incarnations.get(actorKey(line))?.memory).toEqual({ seen: "rn" });
  });
});

const Echo = definition({
  id: "Serve/Echo",
  states: ["ON"],
  events: {},
  internalEvents: { Renamed: {} },
  memory: { echoed: Flow.initial(Schema.Number, 0) },
  context: { name: Flow.context(Lead.M.name) },
});

// A ref as the core reads it: the core never checks a ref is made, the host door does.
const leadRef: ActorRef<typeof Lead> = loose({ machine: LeadMachine, value: "lead", context: {} });

const EchoMachine = machine(Echo, ({ S, E, C }) => ({
  default: S.ON,
  onContext: [C.name.change({ event: E.Renamed })],
  on: {
    Renamed: {
      updateMemory: ({ memory }) => ({ echoed: memory.echoed + 1 }),
      actions: [send(() => leadRef, Lead.E.Rename({ name: "Core" }))],
    },
  },
}));

const echo = { machine: "Serve/Echo", name: "echo" };

// The echo's update waits on one admitted event's count while the lead's rename, on another's,
// changes the name it reads; each count has sent as given. Returns the echo once served.
const joined = (waiting: number, joining: number) => {
  const machines = new Map([
    [lead.machine, { ...LeadMachine.compiled, wiring: new Map() }],
    [echo.machine, { ...EchoMachine.compiled, wiring: new Map([["name", lead]]) }],
  ]);

  const env = { now: 0, seed: "0", admit: makeFreezer(), step: () => Option.none() };
  const open = { ...emptyWorld(false), life: Life.Open() };

  const ensured = step(
    machines,
    open,
    Input.Ensure({
      actor: echo,
      use: Option.some("story"),
      start: "create",
      wiring: Option.none(),
    }),
    env,
  ).world;

  const queued = {
    ...ensured,
    chains: new Map([
      [chain(1), { root: "Started to echo", sent: waiting }],
      [chain(2), { root: "Rename to lead", sent: joining }],
    ]),
    chainCount: 2,
    mail: new Map([
      [actorKey(echo), [Mail.Context({ actor: echo, chain: Option.some(chain(1)) })]],
      [
        actorKey(lead),
        [
          Mail.Event({
            actor: lead,
            tag: "Rename",
            payload: { name: "Core" },
            chain: Option.some(chain(2)),
          }),
        ],
      ],
    ]),
  };

  return step(machines, queued, Input.Serve(), env).world.incarnations.get(actorKey(echo));
};

const refusalOf = (served: ReturnType<typeof joined>) =>
  (served?.issues ?? []).map((i) => `${i.code} ${Option.getOrElse(i.slot, () => "")}`);

describe("a second wave reaching a context update that waits (Actors R13, I20)", () => {
  // Two admitted events' chains meet only when an update waits across rotations: set by hand.
  it("Actors R13, I20: the waiting update follows the joining wave's count when it is higher, so its onContext turn's send is refused at the loop guard", () => {
    const served = joined(0, RuntimeDefaults.loopGuard);
    const guard = String(RuntimeDefaults.loopGuard);

    expect(served?.memory).toEqual({ echoed: 0 });
    expect(refusalOf(served)).toEqual([
      `InvalidTurn loop guard: ${guard} events sent from Rename to lead`,
    ]);
  });

  it("Actors R13, I20: the waiting update keeps its own count when the joining wave's is lower, so its onContext turn's send is still refused at the loop guard", () => {
    const served = joined(RuntimeDefaults.loopGuard, 0);
    const guard = String(RuntimeDefaults.loopGuard);

    expect(served?.memory).toEqual({ echoed: 0 });
    expect(refusalOf(served)).toEqual([
      `InvalidTurn loop guard: ${guard} events sent from Started to echo`,
    ]);
  });

  // A chain id one past the count of chains would, after a partial clear, give the next admitted
  // event's chain a live chain's id and reset its count to zero.
  it("Actors R13: a partial clear of chains keeps every live chain's count, so the waiting update's send is still refused at the loop guard", () => {
    const machines = new Map([
      [lead.machine, { ...LeadMachine.compiled, wiring: new Map() }],
      [echo.machine, { ...EchoMachine.compiled, wiring: new Map([["name", lead]]) }],
    ]);

    const env = { now: 0, seed: "0", admit: makeFreezer(), step: () => Option.none() };
    const open = { ...emptyWorld(false), life: Life.Open() };

    const ensured = step(
      machines,
      open,
      Input.Ensure({
        actor: echo,
        use: Option.some("story"),
        start: "create",
        wiring: Option.none(),
      }),
      env,
    ).world;

    // Chain 1 was cleared; chain 2 is live, at the guard, and the echo's update follows it.
    const queued = {
      ...ensured,
      chains: new Map([[chain(2), { root: "Started to echo", sent: RuntimeDefaults.loopGuard }]]),
      chainCount: 2,
      mail: new Map([
        [actorKey(echo), [Mail.Context({ actor: echo, chain: Option.some(chain(2)) })]],
        [
          actorKey(lead),
          [
            Mail.Event({
              actor: lead,
              tag: "Rename",
              payload: { name: "Core" },
              chain: Option.none(),
            }),
          ],
        ],
      ]),
    };

    const served = step(machines, queued, Input.Serve(), env).world.incarnations.get(
      actorKey(echo),
    );

    const guard = String(RuntimeDefaults.loopGuard);

    expect(served?.memory).toEqual({ echoed: 0 });
    expect(refusalOf(served)).toEqual([
      `InvalidTurn loop guard: ${guard} events sent from Started to echo`,
    ]);
  });
});

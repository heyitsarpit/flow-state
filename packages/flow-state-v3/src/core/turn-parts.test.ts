import { makeFreezer } from "./frozen.ts";
import { Effect, Option, Predicate, Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { transaction } from "../contract.ts";
import { definition } from "../definition.ts";
import { Flow } from "../flow.ts";
import { machine } from "../machine.ts";
import { compiledOf } from "../compiled-of.ts";
import { RuntimeDefaults } from "./defaults.ts";
import { Input } from "./input.ts";
import { Life } from "./life.ts";
import { type Env, step } from "./step.ts";
import { type ActorId, actorKey, type Command, emptyWorld, Mail, type World } from "./world.ts";

// The mailbox, the drain and the one host wake, checked on the core's step: a mailbox no Story can
// fill in one step is set by hand, as the drain would leave it after a yield.

const env: Env = { now: 0, seed: "0", admit: makeFreezer(), step: () => Option.none() };

const Lead = definition({
  id: "Parts/Lead",
  states: ["ON"],
  events: { Rename: { name: Schema.String } },
  memory: { name: Flow.initial(Schema.String, "") },
});

const LeadMachine = machine(Lead, ({ S }) => ({
  default: S.ON,
  on: { Rename: { updateMemory: ({ event }) => ({ name: event.name }) } },
}));

const Line = definition({
  id: "Parts/Line",
  states: ["ON"],
  events: {},
  internalEvents: { Renamed: {} },
  memory: { seen: Flow.initial(Schema.String, "") },
  context: { name: Flow.context(Lead.M.name) },
});

const LineMachine = machine(Line, ({ S, E, C }) => ({
  default: S.ON,
  onContext: [C.name.change({ event: E.Renamed })],
  on: { Renamed: { updateMemory: ({ memory }) => ({ seen: `${memory.seen}r` }) } },
}));

const Noise = definition({ id: "Parts/Noise", states: ["ON"], events: { Poke: {} } });

const NoiseMachine = machine(Noise, ({ S }) => ({ default: S.ON, on: { Poke: {} } }));

const lead: ActorId = { machine: "Parts/Lead", name: "lead" };

const line: ActorId = { machine: "Parts/Line", name: "line" };

const noise = (n: number) => ({ machine: "Parts/Noise", name: `n${String(n)}` });

const machines = new Map([
  [lead.machine, { ...compiledOf(LeadMachine), wiring: new Map() }],
  [line.machine, { ...compiledOf(LineMachine), wiring: new Map([["name", lead]]) }],
  [noise(0).machine, { ...compiledOf(NoiseMachine), wiring: new Map() }],
]);

const ensure = (world: World, actor: ActorId) =>
  step(
    machines,
    world,
    Input.Ensure({ actor, use: Option.some("story"), start: "create", wiring: Option.none() }),
    env,
  ).world;

const event = (actor: ActorId, tag: string, payload = {}) =>
  Mail.Event({ actor, tag, payload, chain: Option.none(), resendable: true });

// Changes I7: at most one context update waits per actor.
const updatesWaiting = (world: World) =>
  [...world.mail].flatMap(([key, box]) =>
    box.filter(Mail.$is("Context")).length > 1 ? [`${key} holds two context updates`] : [],
  );

describe("the mailbox serves a change with its front mail (Changes R21, I7)", () => {
  // The drain's last item is the line's context update: every noise actor's poke and the lead's
  // rename come before it in rotation, so the update is item `drainYield`.
  const queued = () => {
    const pokes = RuntimeDefaults.drainYield - 2;
    const actors = [line, ...Array.from({ length: pokes }, (_, n) => noise(n))];
    const started = actors.reduce(ensure, { ...emptyWorld(false), life: Life.Open() });

    return {
      ...started,
      mail: new Map([
        ...Array.from(
          { length: pokes },
          (_, n) => [actorKey(noise(n)), [event(noise(n), "Poke")]] as const,
        ),
        [actorKey(lead), [event(lead, "Rename", { name: "Core" })]],
      ]),
    };
  };

  it.fails("Changes R21: a context update served as the drain's last item is served with its reaction's turn in the same step, so no yield falls between them", () => {
    const served = step(machines, queued(), Input.Serve(), env).world;

    expect({
      seen: served.incarnations.get(actorKey(line))?.memory["seen"],
      left: (served.mail.get(actorKey(line)) ?? []).map((m) => m._tag),
    }).toEqual({ seen: "r", left: [] });
  });

  it("Changes I7: a wave that reaches an actor with a context update waiting joins it, so no step leaves two waiting", () => {
    const before = queued();

    // The line's update waits in its mailbox while the lead's rename makes a wave that reaches it.
    const waiting = {
      ...before,
      mail: new Map<string, ReadonlyArray<Mail>>([
        [actorKey(line), [Mail.Context({ actor: line, chain: Option.none() })]],
        ...before.mail,
      ]),
    };

    const yielded = step(machines, waiting, Input.Serve(), env);

    expect([...updatesWaiting(waiting), ...updatesWaiting(yielded.world)]).toEqual([]);
  });
});

const Ticker = definition({
  id: "Parts/Ticker",
  states: ["ON"],
  events: {},
  internalEvents: { Tick: {} },
  schedules: { slow: {}, tick: {} },
});

const TickerMachine = machine(Ticker, ({ S, E }) => ({
  default: S.ON,
  states: {
    ON: {
      on: { Tick: {} },
      schedules: {
        slow: { schedule: "1 minute", send: E.Tick },
        tick: { schedule: "1 second", send: E.Tick },
      },
    },
  },
}));

const ticker: ActorId = { machine: "Parts/Ticker", name: "ticker" };

const tickerMachines = new Map([
  [ticker.machine, { ...compiledOf(TickerMachine), wiring: new Map() }],
]);

// A command's tag as text, so a tag the build adds can be named before it exists.
// RETURN_TYPE: widened to text on purpose: the tag compared may not be in today's union.
const tagOf = (command: Command): string => command._tag;

const atOf = (command: Option.Option<Command>) =>
  Option.flatMap(command, (c) =>
    Predicate.hasProperty(c, "at") ? Option.some(c.at) : Option.none(),
  );

describe("one host wake (Changes realization, One host wake; algorithm, a step's last two rows)", () => {
  it.fails("Changes T14: a step that arms two schedules, the later one declared first, returns no per-timer command and ends with one Wake at the earliest alarm", () => {
    const { commands } = step(
      tickerMachines,
      { ...emptyWorld(false), life: Life.Open() },
      Input.Ensure({
        actor: ticker,
        use: Option.some("story"),
        start: "create",
        wiring: Option.none(),
      }),
      env,
    );

    expect({
      perTimer: commands.map(tagOf).filter((tag) => tag === "Arm" || tag === "Disarm"),
      wakes: commands.map(tagOf).filter((tag) => tag === "Wake").length,
      last: Option.map(Option.fromUndefinedOr(commands.at(-1)), tagOf),
      at: atOf(Option.fromUndefinedOr(commands.at(-1))),
    }).toEqual({ perTimer: [], wakes: 1, last: Option.some("Wake"), at: Option.some(1000) });
  });
});

const save = transaction({
  id: "Parts/save",
  input: { text: Schema.String },
  key: [],
  concurrency: "cancel",
  services: [],
  commit: () => Effect.void,
});

const Draft = definition({
  id: "Parts/Draft",
  states: ["ON"],
  events: { Type: { text: Schema.String } },
  internalEvents: { Saved: {}, Unsure: Flow.uncertain({}) },
  memory: { text: Flow.initial(Schema.String, "") },
  operations: ({ E }) => ({
    save: save.outcomes({ success: E.Saved, failure: {}, unknown: E.Unsure }),
  }),
});

const DraftMachine = machine(Draft, ({ S, O }) => ({
  default: S.ON,
  on: {
    Type: {
      updateMemory: ({ event }) => ({ text: event.text }),
      actions: [O.save.commit(({ memory }) => ({ text: memory.text }))],
    },
    Saved: {},
    Unsure: {},
  },
}));

const draft: ActorId = { machine: "Parts/Draft", name: "draft" };

const draftMachines = new Map([
  [draft.machine, { ...compiledOf(DraftMachine), wiring: new Map() }],
]);

const RELEASES: ReadonlySet<string> = new Set(["Interrupt", "EndWork"]);

const STARTS: ReadonlySet<string> = new Set(["Invoke", "Lookup"]);

describe("a step's work commands, releases before starts (Changes Q9, build-time choice 2)", () => {
  it("Changes Q9: a cancel-policy commit that replaces a call on the wire returns the old call's release before the new call's start", () => {
    const started = step(
      draftMachines,
      { ...emptyWorld(false), life: Life.Open() },
      Input.Ensure({
        actor: draft,
        use: Option.some("story"),
        start: "create",
        wiring: Option.none(),
      }),
      env,
    ).world;

    const first = step(
      draftMachines,
      started,
      Input.Send({ actor: draft, tag: "Type", payload: { text: "a" } }),
      env,
    );

    const second = step(
      draftMachines,
      first.world,
      Input.Send({ actor: draft, tag: "Type", payload: { text: "ab" } }),
      env,
    );

    const work = second.commands.map(tagOf).filter((tag) => RELEASES.has(tag) || STARTS.has(tag));
    const lastRelease = work.findLastIndex((tag) => RELEASES.has(tag));
    const firstStart = work.findIndex((tag) => STARTS.has(tag));

    expect({
      both: lastRelease !== -1 && firstStart !== -1,
      ordered: lastRelease < firstStart,
    }).toEqual({
      both: true,
      ordered: true,
    });
  });
});

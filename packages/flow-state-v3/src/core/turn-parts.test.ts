import { makeFreezer } from "./frozen.ts";
import { Brand, Duration, Effect, Option, Predicate, Schema } from "effect";
import { Alarm, byDeadline } from "./alarms.ts";
import { describe, expect, it } from "vite-plus/test";
import { transaction } from "../contract.ts";
import { definition } from "../definition.ts";
import { Flow } from "../flow.ts";
import { machine } from "../machine.ts";
import { compiledOf } from "../compiled-of.ts";
import { RuntimeDefaults } from "./defaults.ts";
import { Input } from "./input.ts";
import { Life } from "./life.ts";
import { readsOf, scopeOf } from "./reads.ts";
import { type Env, step } from "./step.ts";
import {
  type ActorId,
  actorKey,
  type ArmingId,
  type CallId,
  type Command,
  emptyWorld,
  type IncarnationId,
  Mail,
  type TicketId,
  type Wiring,
  type World,
} from "./world.ts";

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

  it("Changes R21: a context update served as the drain's last item is served with its reaction's turn in the same step, so no yield falls between them", () => {
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

const tagOf = (command: Command) => command._tag;

const atOf = (command: Option.Option<Command>) =>
  Option.flatMap(command, (c) =>
    Predicate.hasProperty(c, "at") ? Option.some(c.at) : Option.none(),
  );

describe("one host wake (Changes realization, One host wake; algorithm, a step's last two rows)", () => {
  const armed = () =>
    step(
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

  // Every command the step returns is named, so a per-alarm command under any name is caught.
  it("Changes T14: a step that arms two schedules, the later one declared first, returns no per-timer command and ends with one Wake at the earliest alarm", () => {
    const { commands } = armed();

    expect({
      commands: commands.map(tagOf),
      at: atOf(Option.fromUndefinedOr(commands.at(-1))),
    }).toEqual({ commands: ["Wake"], at: Option.some(1000) });
  });

  it("Changes T14: an early Tick, from a wake an earlier step superseded, takes no alarm, loses none and owes no new wake", () => {
    const { world } = armed();
    const early = step(tickerMachines, world, Input.Tick(), { ...env, now: 500 });

    expect({
      alarms: [...early.world.alarms.values()].map((a) => a.at).toSorted((a, b) => a - b),
      commands: early.commands.map(tagOf),
      evidence: early.evidence.length,
    }).toEqual({ alarms: [1000, 60_000], commands: [], evidence: 0 });
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

const Probe = definition({
  id: "Parts/Probe",
  states: ["IDLE", "ARMED"],
  events: { Arm: { by: Schema.Number } },
  internalEvents: { Renamed: {}, Ring: {} },
  memory: { by: Flow.initial(Schema.Number, 0) },
  context: { name: Flow.context(Lead.M.name) },
  schedules: { ring: {} },
});

// A probe whose root callbacks each hand `hear` the input they ran with, by callback kind.
// FLOW_STATE_ALLOW_UNKNOWN: each callback's input, compared whole with the record readsOf builds.
const probeOf = (hear: (kind: string, input: unknown) => void) =>
  machine(Probe, ({ S, E, C }) => ({
    default: S.IDLE,
    onContext: [
      C.name.change({
        when: (_now, _before, reads) => {
          hear("Reaction", reads);

          return true;
        },
        event: E.Renamed,
      }),
    ],
    on: { Renamed: {}, Ring: {} },
    states: {
      IDLE: {
        on: {
          Arm: {
            target: S.ARMED,
            guard: [
              (reads) => {
                hear("Guard", reads);

                return true;
              },
            ],
            updateMemory: (reads) => {
              hear("Patch", reads);

              return { by: reads.event.by };
            },
          },
        },
      },
      ARMED: {
        schedules: {
          ring: {
            schedule: (reads) => {
              hear("Schedule", reads);

              return Duration.seconds(1);
            },
            send: E.Ring,
          },
        },
      },
    },
  }));

const probe: ActorId = { machine: "Parts/Probe", name: "probe" };

describe("one builder of callback inputs (Changes R22, T15)", () => {
  it("Changes T15: each root callback reads the record readsOf builds from the incarnation, for its kind and view", () => {
    // FLOW_STATE_ALLOW_UNKNOWN: each callback's input, compared whole with the record readsOf builds.
    const heard = new Map<string, unknown>();

    const probeMachines = new Map([
      [lead.machine, { ...compiledOf(LeadMachine), wiring: new Map() }],
      [
        probe.machine,
        {
          ...compiledOf(probeOf((kind, input) => void heard.set(kind, input))),
          wiring: new Map([["name", lead]]),
        },
      ],
    ]);

    const open = { ...emptyWorld(false), life: Life.Open() };

    const started = step(
      probeMachines,
      open,
      Input.Ensure({
        actor: probe,
        use: Option.some("story"),
        start: "create",
        wiring: Option.none(),
      }),
      env,
    ).world;

    const before = Option.getOrThrow(
      Option.fromUndefinedOr(started.incarnations.get(actorKey(probe))),
    );

    const armed = step(
      probeMachines,
      started,
      Input.Send({ actor: probe, tag: "Arm", payload: { by: 2 } }),
      env,
    ).world;

    const after = Option.getOrThrow(
      Option.fromUndefinedOr(armed.incarnations.get(actorKey(probe))),
    );

    step(
      probeMachines,
      armed,
      Input.Send({ actor: lead, tag: "Rename", payload: { name: "Core" } }),
      env,
    );

    const event = { by: 2 };

    expect({
      Guard: heard.get("Guard"),
      Patch: heard.get("Patch"),
      Schedule: heard.get("Schedule"),
    }).toEqual({
      Guard: readsOf(scopeOf(before), "Guard", { event }),
      Patch: readsOf(scopeOf(before), "Patch", { event, now: env.now }),
      Schedule: readsOf(scopeOf(after), "Schedule", {
        key: Option.none(),
        operations: new Map(),
        now: env.now,
      }),
    });
    expect(heard.get("Reaction")).toEqual(readsOf(scopeOf(after), "Reaction", {}));
  });
});

describe("the alarms due at one instant (Changes Q9, build-time choice 1)", () => {
  it("Changes Q9: alarms due together are taken by deadline, then Bound, Silent, Release, Collect, Grace and Schedule, whatever order they were set in", () => {
    const at = (alarm: Alarm, when: number) => ({ alarm, at: when });
    const arming = Brand.nominal<ArmingId>();
    const incarnation = Brand.nominal<IncarnationId>()("inc-1");

    const set = [
      at(
        Alarm.Schedule({ actor: lead, incarnation, schedule: "s", track: "s", arming: arming(1) }),
        5,
      ),
      at(Alarm.Grace({ actor: lead, incarnation }), 5),
      at(Alarm.Collect({ entry: "e" }), 5),
      at(Alarm.Release({ call: Brand.nominal<CallId>()("call-1") }), 5),
      at(Alarm.Silent({ ticket: Brand.nominal<TicketId>()("ticket-1") }), 5),
      at(Alarm.Bound(), 9),
      at(Alarm.Bound(), 5),
    ];

    expect(set.toSorted(byDeadline(() => 0)).map((a) => `${a.alarm._tag}@${String(a.at)}`)).toEqual(
      ["Bound@5", "Silent@5", "Release@5", "Collect@5", "Grace@5", "Schedule@5", "Bound@9"],
    );
  });
});

describe("mail an actor's end finds in its mailbox (Changes R24, the trigger table)", () => {
  it("Changes R24: an event queued for an actor disposed in the same step is unhandled, not dropped unseen", () => {
    const started = ensure({ ...emptyWorld(false), life: Life.Open() }, noise(0));

    const queued = {
      ...started,
      mail: new Map([[actorKey(noise(0)), [event(noise(0), "Poke")]]]),
    };

    const disposed = step(machines, queued, Input.DisposeActor({ actor: noise(0) }), env);

    expect({
      unhandled: disposed.evidence.filter((e) => e._tag === "Unhandled"),
      left: disposed.world.mail.size,
    }).toEqual({
      unhandled: [expect.objectContaining({ actor: noise(0), event: "Poke" })],
      left: 0,
    });
  });
});

const Link = definition({
  id: "Parts/Link",
  states: ["ON"],
  events: {},
  memory: { name: Flow.initial(Schema.String, "") },
  context: { up: Flow.context(Lead.M.name) },
});

const LinkMachine = machine(Link, ({ S }) => ({ default: S.ON }));

const linkOf = (name: string) => ({ machine: "Parts/Link", name });

const linkMachines = new Map([
  [lead.machine, { ...compiledOf(LeadMachine), wiring: new Map() }],
  [linkOf("a").machine, { ...compiledOf(LinkMachine), wiring: new Map() }],
]);

describe("the order of ends (Changes R9, I17)", () => {
  it("Changes I17: a consumer ends before an older provider of its own machine, which no order by machine or by age alone gives", () => {
    const a = linkOf("a");
    const b = linkOf("b");

    const ensured = (world: World, actor: ActorId, wiring: Option.Option<Wiring>) =>
      step(
        linkMachines,
        world,
        Input.Ensure({ actor, use: Option.some("story"), start: "create", wiring }),
        env,
      ).world;

    const both = ensured(
      ensured({ ...emptyWorld(false), life: Life.Open() }, a, Option.none()),
      b,
      Option.some(new Map([[actorKey(b), new Map([["up", a]])]])),
    );

    const finished = step(linkMachines, both, Input.DisposeRuntime(), env).evidence.flatMap((e) =>
      e._tag === "Finished" ? [e.actor.name] : [],
    );

    expect(finished).toEqual(["b", "a"]);
  });
});

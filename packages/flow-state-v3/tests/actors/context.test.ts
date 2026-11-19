import assert from "node:assert/strict";
import { Effect, Option, Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { attachInspector, type Evidence } from "../../src/host/inspect.ts";
import { Story, type StoryRun } from "../../src/host/testing/index.ts";
import {
  actorRef,
  app,
  definition,
  deny,
  Flow,
  FlowError,
  machine,
  runtimeSetup,
} from "../../src/index.ts";
import { checked } from "../rules/rules.ts";

const Session = definition({
  id: "Context/Session",
  states: ["READY"],
  events: { SignIn: { user: Schema.String } },
  memory: {
    user: Flow.initial(Schema.String, ""),
    token: Flow.private(Flow.initial(Schema.String, "secret")),
  },
});

const SessionMachine = machine(Session, ({ S }) => ({
  default: S.READY,
  on: { SignIn: { updateMemory: ({ event }) => ({ user: event.user }) } },
}));

const Badge = definition({
  id: "Context/Badge",
  states: ["SHOWN"],
  events: {},
  internalEvents: { UserChanged: { user: Schema.String } },
  memory: { greeting: Flow.initial(Schema.String, "") },
  context: {
    user: Session.Provider.select(Schema.String, (s) => s.memory.user),
    broken: Session.Provider.select(Schema.Number, (s) => {
      if (s.memory.user.startsWith("boom")) throw new Error("boom");

      return s.memory.user.length;
    }),
  },
});

const BadgeMachine = machine(Badge, ({ S, E }) => ({
  default: S.SHOWN,
  onContext: [
    {
      select: ({ context }) => context.user,
      event: E.UserChanged.from((user: string) => ({ user })),
    },
  ],
  on: { UserChanged: { updateMemory: ({ event }) => ({ greeting: `hi ${event.user}` }) } },
}));

const Reader = definition({
  id: "Context/Reader",
  states: ["READING"],
  events: { Read: {} },
  memory: { read: Flow.initial(Schema.String, "") },
  context: { user: Session.Provider.select(Schema.String, (s) => s.memory.user) },
});

const ReaderMachine = machine(Reader, ({ S }) => ({
  default: S.READING,
  on: {
    Read: {
      guard: [(input) => "context" in input || deny("NoContext")],
      updateMemory: (input) => ({ read: "context" in input ? "context" : "none" }),
    },
  },
}));

const Watcher = definition({
  id: "Context/Watcher",
  states: ["WATCHING"],
  events: {},
  internalEvents: { Seen: { user: Schema.String } },
  memory: { seen: Flow.initial(Schema.String, "") },
  context: { user: Session.Provider.select(Schema.String, (s) => s.memory.user) },
});

const WatcherMachine = machine(Watcher, ({ S, E }) => ({
  default: S.WATCHING,
  onContext: [
    { select: ({ context }) => context.user, event: E.Seen.from((user: string) => ({ user })) },
  ],
  on: { Seen: { updateMemory: ({ event }) => ({ seen: event.user }) } },
}));

const Pair = definition({
  id: "Context/Pair",
  states: ["PAIRED"],
  events: {},
  internalEvents: { Paired: { pair: Schema.String } },
  memory: { pairs: Flow.initial(Schema.Array(Schema.String), []) },
  context: {
    left: Watcher.Provider.select(Schema.String, (s) => s.memory.seen),
    right: Watcher.Provider.select(Schema.String, (s) => s.memory.seen),
  },
});

const PairMachine = machine(Pair, ({ S, E }) => ({
  default: S.PAIRED,
  onContext: [
    {
      select: ({ context }) => `${context.left}|${context.right}`,
      event: E.Paired.from((pair: string) => ({ pair })),
    },
  ],
  on: {
    Paired: { updateMemory: ({ event, memory }) => ({ pairs: [...memory.pairs, event.pair] }) },
  },
}));

const Both = definition({
  id: "Context/Both",
  states: ["PAIRED"],
  events: {},
  internalEvents: { Paired: { pair: Schema.String } },
  memory: { pairs: Flow.initial(Schema.Array(Schema.String), []) },
  context: {
    user: Session.Provider.select(Schema.String, (s) => s.memory.user),
    seen: Watcher.Provider.select(Schema.String, (s) => s.memory.seen),
  },
});

const BothMachine = machine(Both, ({ S, E }) => ({
  default: S.PAIRED,
  onContext: [
    {
      select: ({ context }) => `${context.user}|${context.seen}`,
      event: E.Paired.from((pair: string) => ({ pair })),
    },
  ],
  on: {
    Paired: { updateMemory: ({ event, memory }) => ({ pairs: [...memory.pairs, event.pair] }) },
  },
}));

// How many times the aside selector ran: a selector is pure (R19), and the count shows only
// whether a wave ran it.
const asides = { reads: 0 };

const Counted = definition({
  id: "Context/Counted",
  states: ["READY"],
  events: {},
  context: {
    user: Session.Provider.select(Schema.String, (s) => s.memory.user),
    aside: Session.Provider.select(Schema.String, (s) => {
      asides.reads += 1;

      return s.memory.user;
    }),
  },
});

const CountedMachine = machine(Counted, ({ S }) => ({ default: S.READY }));

// A lamp whose toggle changes only its state, never its memory.
const Lamp = definition({ id: "Context/Lamp", states: ["ON", "OFF"], events: { Toggle: {} } });

const LampMachine = machine(Lamp, ({ S }) => ({
  default: S.ON,
  states: { ON: { on: { Toggle: { target: S.OFF } } }, OFF: { on: { Toggle: { target: S.ON } } } },
}));

const Glow = definition({
  id: "Context/Glow",
  states: ["SHOWN"],
  events: {},
  context: {
    lit: Lamp.Provider.select(Schema.String, (s) => {
      if (s.state === "OFF") throw new Error("dark");

      return s.state;
    }),
  },
});

const GlowMachine = machine(Glow, ({ S }) => ({ default: S.SHOWN }));

const UpstreamNode = definition({ id: "Context/Node", states: ["ON"], events: {} });

const Node = definition({
  id: "Context/Node",
  states: ["ON"],
  events: {},
  context: { up: UpstreamNode.Provider.select(Schema.String, (s) => s.state) },
});

const NodeMachine = machine(Node, ({ S }) => ({ default: S.ON }));

const main = actorRef(SessionMachine, "main");
const other = actorRef(SessionMachine, "other");
const badge = actorRef(BadgeMachine, "badge");
const pair = actorRef(PairMachine, "pair");
const counted = actorRef(CountedMachine, "counted");
const lamp = actorRef(LampMachine, "lamp");
const glow = actorRef(GlowMachine, "glow");

const setup = runtimeSetup({
  app: app({
    id: "context",
    machines: {
      session: SessionMachine,
      badge: { machine: BadgeMachine, context: { user: main, broken: main } },
      watcher: { machine: WatcherMachine, context: { user: main } },
      pair: {
        machine: PairMachine,
        context: {
          left: actorRef(WatcherMachine, "left"),
          right: actorRef(WatcherMachine, "right"),
        },
      },
      node: { machine: NodeMachine, context: { up: actorRef(NodeMachine, "b") } },
      reader: { machine: ReaderMachine, context: { user: main } },
      counted: { machine: CountedMachine, context: { user: main, aside: other } },
      lamp: LampMachine,
      glow: { machine: GlowMachine, context: { lit: lamp } },
      both: {
        machine: BothMachine,
        context: { user: main, seen: actorRef(WatcherMachine, "left") },
      },
    },
  }),
});

const unwired = runtimeSetup({
  app: app({ id: "unwired", machines: { session: SessionMachine, badge: BadgeMachine } }),
});

const ready = () => {
  const runtime = setup.construct();
  Effect.runSync(runtime.ready());
  const seen: Array<Evidence> = [];
  attachInspector(runtime, (e) => void seen.push(e));

  return { runtime, seen };
};

const thrownCode = (run: () => unknown) => {
  try {
    run();
  } catch (error) {
    assert.ok(error instanceof FlowError);

    return error.code;
  }

  return "none";
};

const turnsOf = (seen: ReadonlyArray<Evidence>, event: string) =>
  seen.filter((e) => e._tag === "Turn" && e.event === event).length;

describe("context binding (Actors R18, I28)", () => {
  it("Actors R19: a wave runs only the selectors whose provider's snapshot changed", () => {
    const { runtime } = ready();
    const handle = runtime.ensureActor(counted);
    const before = asides.reads;
    runtime.ensureActor(main).send(Session.E.SignIn({ user: "ada" }));

    expect(Option.map(handle.getSnapshot(), (s) => s.context)).toEqual(
      Option.some({ user: "ada", aside: "" }),
    );
    expect(asides.reads).toBe(before);
  });

  it("Actors R19: a slot whose selector failed is read again when its provider returns to the snapshot it last selected from, and its issue clears", () => {
    const { runtime } = ready();
    const handle = runtime.ensureActor(glow);
    const switched = runtime.ensureActor(lamp);
    switched.send(Lamp.E.Toggle());

    expect(Option.map(handle.getSnapshot(), (s) => s.issues.length)).toEqual(Option.some(1));

    switched.send(Lamp.E.Toggle());

    expect(Option.map(handle.getSnapshot(), (s) => s.issues)).toEqual(Option.some([]));
  });

  it("Actors R18, Turn R22: a consumer's baseline is silent at admission, and its snapshot shows the selected context", () => {
    const { runtime, seen } = ready();
    const handle = runtime.ensureActor(badge);

    expect(Option.map(handle.getSnapshot(), (s) => s.context)).toEqual(
      Option.some({ user: "", broken: 0 }),
    );
    expect(turnsOf(seen, "UserChanged")).toBe(0);
  });

  it("Actors R18: a missing provider is refused at admission with MissingContextProvider, leaving nothing", () => {
    const runtime = unwired.construct();
    Effect.runSync(runtime.ready());
    const seen: Array<Evidence> = [];
    attachInspector(runtime, (e) => void seen.push(e));

    expect(thrownCode(() => runtime.ensureActor(badge))).toBe("MissingContextProvider");
    expect(seen).toEqual([]);
  });

  it("Actors R18, I28: a provider graph that reaches an actor again is refused with ContextCycle", () => {
    const { runtime, seen } = ready();

    expect(thrownCode(() => runtime.ensureActor(actorRef(NodeMachine, "a")))).toBe("ContextCycle");
    expect(seen).toEqual([]);
  });

  it("Actors R24: a context ref of a machine this Runtime's app does not run is refused ForeignActorRef", () => {
    const { runtime } = ready();

    const strange = actorRef(
      machine(Session, ({ S }) => ({ default: S.READY })),
      "main",
    );

    expect(
      thrownCode(() =>
        runtime.ensureActor(actorRef(BadgeMachine, "b2", { context: { user: strange } })),
      ),
    ).toBe("ForeignActorRef");
    expect(() => Story.app(setup, { id: "context/foreign", fixtures: [] }).ensure(strange)).toThrow(
      FlowError,
    );
  });

  it("Actors R5: two refs of one live identity with different context are refused ConflictingActorRef", () => {
    const { runtime } = ready();
    runtime.ensureActor(badge);

    expect(
      thrownCode(() =>
        runtime.ensureActor(actorRef(BadgeMachine, "badge", { context: { user: other } })),
      ),
    ).toBe("ConflictingActorRef");
    expect(thrownCode(() => runtime.ensureActor(badge))).toBe("none");
  });

  it("Actors R20: disposing a provider with bound consumers is refused BlockedByDependents", () => {
    const { runtime } = ready();
    runtime.ensureActor(badge);

    expect(thrownCode(() => runtime.disposeActor(main))).toBe("BlockedByDependents");
    runtime.disposeActor(badge);
    expect(thrownCode(() => runtime.disposeActor(main))).toBe("none");
  });

  it("Actors R7, R18: a bound consumer is a use of its provider; when the consumer ends, the provider ends after its grace", async () => {
    const run = checked(
      await Story.app(setup, { id: "context/use", fixtures: [] })
        .ensure(badge)
        .advance("1 second")
        .checkpoint("used")
        .detach(badge)
        .advance("1 second")
        .checkpoint("free")
        .run(),
    );

    expect(run.checkpoints.used.inspection.actors).toHaveLength(2);
    expect(run.checkpoints.free.inspection.actors).toEqual([]);
  });
});

describe("onContext defects (Turn R22)", () => {
  const Echo = definition({
    id: "Context/Echo",
    states: ["SHOWN"],
    events: {},
    internalEvents: { Echoed: { user: Schema.String } },
    memory: { echoes: Flow.initial(Schema.Number, 0) },
    context: { user: Session.Provider.select(Schema.String, (s) => s.memory.user) },
  });

  // Its mapper throws for the user "x"; its when throws for the user "y".
  const EchoMachine = machine(Echo, ({ S, E }) => ({
    default: S.SHOWN,
    onContext: [
      {
        select: ({ context }) => context.user,
        when: (next: string) => {
          if (next === "y") throw new Error("when");

          return true;
        },
        event: E.Echoed.from((user: string) => {
          if (user === "x") throw new Error("mapper");

          return { user };
        }),
      },
    ],
    on: { Echoed: { updateMemory: ({ memory }) => ({ echoes: memory.echoes + 1 }) } },
  }));

  it("Turn R22, R25: a when or mapper defect keeps the previous baseline, so a return to it is silent, and the return clears its issue", () => {
    const runtime = runtimeSetup({
      app: app({
        id: "echo",
        machines: {
          session: SessionMachine,
          echo: { machine: EchoMachine, context: { user: main } },
        },
      }),
    }).construct();

    Effect.runSync(runtime.ready());
    const echo = runtime.ensureActor(actorRef(EchoMachine, "echo"));
    const session = runtime.ensureActor(main);

    for (const user of ["x", "", "y", ""]) session.send(Session.E.SignIn({ user }));

    expect(Option.map(echo.getSnapshot(), (s) => s.memory.echoes)).toEqual(Option.some(0));
    expect(Option.map(echo.getSnapshot(), (s) => s.issues.length)).toEqual(Option.some(0));
  });
});

describe("context waves (Actors R19, I27; Turn R22)", () => {
  it("Turn R22: a provider change gives the consumer one onContext event; an equal selection is silent", () => {
    const { runtime, seen } = ready();
    const handle = runtime.ensureActor(badge);
    const session = runtime.ensureActor(main);
    session.send(Session.E.SignIn({ user: "ada" }));
    session.send(Session.E.SignIn({ user: "ada" }));

    expect(turnsOf(seen, "UserChanged")).toBe(1);
    expect(Option.map(handle.getSnapshot(), (s) => s.memory.greeting)).toEqual(
      Option.some("hi ada"),
    );
    expect(Option.map(handle.getSnapshot(), (s) => s.context["user"])).toEqual(Option.some("ada"));
  });

  it("Actors R19: a throwing selector keeps its slot's last value and raises one issue; the other slots and the provider go on", () => {
    const { runtime, seen } = ready();
    const handle = runtime.ensureActor(badge);
    const session = runtime.ensureActor(main);
    session.send(Session.E.SignIn({ user: "boom" }));

    const read = Option.getOrThrow(handle.getSnapshot());
    expect(read.context).toEqual({ user: "boom", broken: 0 });
    expect(read.issues.map((d) => d.path[2])).toEqual(["context broken"]);
    expect(seen.filter((e) => e._tag === "Issue")).toHaveLength(1);
    expect(Option.map(session.getSnapshot(), (s) => s.memory.user)).toEqual(Option.some("boom"));
  });

  it("Actors R19, I27: in a diamond the consumer gets one update per wave, never mixing new and stale values", () => {
    const { runtime } = ready();
    const handle = runtime.ensureActor(pair);
    runtime.ensureActor(actorRef(WatcherMachine, "left"));
    runtime.ensureActor(actorRef(WatcherMachine, "right"));
    runtime.ensureActor(main).send(Session.E.SignIn({ user: "ada" }));

    expect(Option.map(handle.getSnapshot(), (s) => s.memory.pairs)).toEqual(
      Option.some(["ada|ada"]),
    );
  });

  it("Actors R19, I27: a consumer bound to a provider and to that provider's consumer gets one update per wave, after both settle", () => {
    const { runtime } = ready();
    const handle = runtime.ensureActor(actorRef(BothMachine, "both"));
    runtime.ensureActor(main).send(Session.E.SignIn({ user: "ada" }));

    expect(Option.map(handle.getSnapshot(), (s) => s.memory.pairs)).toEqual(
      Option.some(["ada|ada"]),
    );
  });
});

describe("issues by source (Turn R25; Actors R19)", () => {
  it("Turn R25: a throwing selector's issue clears when its slot next selects", () => {
    const { runtime } = ready();
    const handle = runtime.ensureActor(badge);
    const session = runtime.ensureActor(main);
    session.send(Session.E.SignIn({ user: "boom" }));
    session.send(Session.E.SignIn({ user: "ada" }));

    expect(Option.map(handle.getSnapshot(), (s) => s.issues)).toEqual(Option.some([]));
    expect(Option.map(handle.getSnapshot(), (s) => s.context["broken"])).toEqual(Option.some(3));
  });

  it("Actors R19: a selector that keeps throwing publishes one issue, not one per wave", () => {
    const { runtime, seen } = ready();
    runtime.ensureActor(badge);
    const session = runtime.ensureActor(main);

    for (const user of ["boom1", "boom2", "boom3"]) session.send(Session.E.SignIn({ user }));

    expect(seen.filter((e) => e._tag === "Issue")).toHaveLength(1);
  });
});

describe("context in callbacks (Turn R12)", () => {
  // A known gap, owned by the machine-structure slice: guards and updates are not handed context.
  it.fails("Turn R12: a guard and an update receive the turn's context", () => {
    const { runtime } = ready();
    const reader = runtime.ensureActor(actorRef(ReaderMachine, "reader"));
    reader.send(Reader.E.Read());

    expect(Option.map(reader.getSnapshot(), (s) => s.memory.read)).toEqual(Option.some("context"));
  });
});

const KeptSession = definition({
  id: "Context/KeptSession",
  persist: true,
  states: ["READY"],
  events: { SignIn: { user: Schema.String } },
  memory: { user: Flow.initial(Schema.String, "") },
});

const KeptSessionMachine = machine(KeptSession, ({ S }) => ({
  default: S.READY,
  on: { SignIn: { updateMemory: ({ event }) => ({ user: event.user }) } },
}));

const KeptWatcher = definition({
  id: "Context/KeptWatcher",
  persist: true,
  states: ["WATCHING"],
  events: { Ping: {} },
  internalEvents: { Seen: { user: Schema.String } },
  memory: { seen: Flow.initial(Schema.String, "") },
  context: { user: KeptSession.Provider.select(Schema.String, (s) => s.memory.user) },
});

const KeptWatcherMachine = machine(KeptWatcher, ({ S, E }) => ({
  default: S.WATCHING,
  onContext: [
    { select: ({ context }) => context.user, event: E.Seen.from((user: string) => ({ user })) },
  ],
  on: { Seen: { updateMemory: ({ event }) => ({ seen: event.user }) }, Ping: {} },
}));

// A watcher whose selector throws while nobody is signed in.
const KeptStrict = definition({
  id: "Context/KeptStrict",
  persist: true,
  states: ["WATCHING"],
  events: { Ping: {} },
  internalEvents: { Seen: { user: Schema.String } },
  memory: { seen: Flow.initial(Schema.String, "") },
  context: {
    user: KeptSession.Provider.select(Schema.String, (s) => {
      if (s.memory.user === "") throw new Error("nobody");

      return s.memory.user;
    }),
  },
});

const KeptStrictMachine = machine(KeptStrict, ({ S, E }) => ({
  default: S.WATCHING,
  onContext: [
    { select: ({ context }) => context.user, event: E.Seen.from((user: string) => ({ user })) },
  ],
  on: { Seen: { updateMemory: ({ event }) => ({ seen: event.user }) }, Ping: {} },
}));

const keptSession = actorRef(KeptSessionMachine, "main");
const keptWatcher = actorRef(KeptWatcherMachine, "w");

const kept = runtimeSetup({
  app: app({
    id: "kept",
    machines: {
      session: KeptSessionMachine,
      watcher: { machine: KeptWatcherMachine, context: { user: keptSession } },
      strict: { machine: KeptStrictMachine, context: { user: keptSession } },
    },
  }),
  scope: "kept",
  persistence: { captureMs: 0 },
});

describe("the return's wave (Actors R9, R18; Turn R22)", () => {
  it("Actors R9, Turn R22: a persisted consumer returned by a send after its provider changed gets one wave before the send", async () => {
    const run = checked(
      await Story.app(kept, { id: "context/return", fixtures: [] })
        .ensure(keptWatcher)
        .detach(keptWatcher)
        .advance("1 second")
        .send(keptSession, KeptSession.E.SignIn({ user: "ada" }))
        .advance("1 second")
        .send(keptWatcher, KeptWatcher.E.Ping())
        .checkpoint("back")
        .run(),
    );

    const turns = run.evidence.flatMap((e) => (e._tag === "Turn" ? [e.event] : []));
    expect(turns).toEqual(["SignIn", "Seen", "Ping"]);
    expect(run.checkpoints.back.read(keptWatcher)?.memory.seen).toBe("ada");
  });

  it("Actors R9, R18: a slot whose selector threw at its start is saved never selected, so a return after a reload hears its first value", async () => {
    const strict = actorRef(KeptStrictMachine, "s");

    const run = checked(
      await Story.app(kept, { id: "context/strict-return", fixtures: [] })
        .ensure(strict)
        .detach(strict)
        .advance("1 second")
        .send(keptSession, KeptSession.E.SignIn({ user: "ada" }))
        .reload({ reattach: false })
        .send(strict, KeptStrict.E.Ping())
        .checkpoint("back")
        .run(),
    );

    expect(run.checkpoints.back.read(strict)?.memory.seen).toBe("ada");
  });

  it("Actors R18: a reload binds a consumer to the provider its ref named, not its entry's default", async () => {
    const otherSession = actorRef(KeptSessionMachine, "other");
    const overridden = actorRef(KeptWatcherMachine, "w", { context: { user: otherSession } });

    const run = checked(
      await Story.app(kept, { id: "context/reload-override", fixtures: [] })
        .ensure(otherSession)
        .send(otherSession, KeptSession.E.SignIn({ user: "bob" }))
        .ensure(overridden)
        .reload()
        .checkpoint("reloaded")
        .run(),
    );

    expect(run.checkpoints.reloaded.read(keptWatcher)?.context).toEqual({ user: "bob" });
  });

  it("Actors R18: a reload restores a consumer's baseline silently", async () => {
    const run = checked(
      await Story.app(kept, { id: "context/reload", fixtures: [] })
        .ensure(keptWatcher)
        .send(keptSession, KeptSession.E.SignIn({ user: "ada" }))
        .reload()
        .checkpoint("reloaded")
        .run(),
    );

    const seen = run.evidence.filter((e) => e._tag === "Turn" && e.event === "Seen");
    expect(seen).toHaveLength(1);
  });

  // The turns after the reload: the provider's change, the consumer's one wave, then the event
  // that returned it.
  const afterReload = (run: StoryRun) =>
    run.evidence
      .slice(run.evidence.findIndex((e) => e._tag === "Incarnated" && e.actor.name === "main"))
      .flatMap((e) => (e._tag === "Turn" ? [e.event] : []));

  it("Actors R9, R18: a consumer that ended before a reload, returned after its provider changed, gets one wave before the send", async () => {
    const run = checked(
      await Story.app(kept, { id: "context/return-after-reload", fixtures: [] })
        .ensure(keptWatcher)
        .detach(keptWatcher)
        .advance("1 second")
        .reload()
        .send(keptSession, KeptSession.E.SignIn({ user: "ada" }))
        .advance("1 second")
        .send(keptWatcher, KeptWatcher.E.Ping())
        .checkpoint("back")
        .run(),
    );

    expect(afterReload(run)).toEqual(["SignIn", "Seen", "Ping"]);
    expect(run.checkpoints.back.read(keptWatcher)?.memory.seen).toBe("ada");
  });

  it("Actors R9, R18: a consumer whose provider changed after it ended, returned after a reload, gets one wave", async () => {
    const run = checked(
      await Story.app(kept, { id: "context/changed-then-reload", fixtures: [] })
        .ensure(keptWatcher)
        .detach(keptWatcher)
        .advance("1 second")
        .send(keptSession, KeptSession.E.SignIn({ user: "ada" }))
        .advance("1 second")
        .reload()
        .send(keptWatcher, KeptWatcher.E.Ping())
        .checkpoint("back")
        .run(),
    );

    expect(run.checkpoints.back.read(keptWatcher)?.memory.seen).toBe("ada");
  });

  it("Actors R9: a consumer returned after a reload with its provider unchanged gets no wave", async () => {
    const run = checked(
      await Story.app(kept, { id: "context/unchanged-return", fixtures: [] })
        .ensure(keptWatcher)
        .send(keptSession, KeptSession.E.SignIn({ user: "ada" }))
        .detach(keptWatcher)
        .advance("1 second")
        .reload()
        .send(keptWatcher, KeptWatcher.E.Ping())
        .checkpoint("back")
        .run(),
    );

    expect(run.evidence.filter((e) => e._tag === "Turn" && e.event === "Seen")).toHaveLength(1);
  });
});

// A kept watcher whose when throws for the user "y".
const KeptEcho = definition({
  id: "Context/KeptEcho",
  persist: true,
  states: ["SHOWN"],
  events: {},
  internalEvents: { Echoed: {} },
  memory: { echoes: Flow.initial(Schema.Number, 0) },
  context: { user: KeptSession.Provider.select(Schema.String, (s) => s.memory.user) },
});

const KeptEchoMachine = machine(KeptEcho, ({ S, E }) => ({
  default: S.SHOWN,
  onContext: [
    {
      select: ({ context }) => context.user,
      when: (next: string) => {
        if (next === "y") throw new Error("when");

        return true;
      },
      event: E.Echoed,
    },
  ],
  on: { Echoed: { updateMemory: ({ memory }) => ({ echoes: memory.echoes + 1 }) } },
}));

describe("a kept baseline across a reload (Turn R22; Restore R2)", () => {
  const echoing = runtimeSetup({
    app: app({
      id: "kept-echo",
      machines: {
        session: KeptSessionMachine,
        echo: { machine: KeptEchoMachine, context: { user: keptSession } },
      },
    }),
    scope: "kept-echo",
    persistence: { captureMs: 0 },
  });

  const echo = actorRef(KeptEchoMachine, "echo");

  const story = (reloaded: boolean) => {
    const before = Story.app(echoing, { id: "context/kept-echo", fixtures: [] })
      .ensure(echo)
      .send(keptSession, KeptSession.E.SignIn({ user: "a" }))
      .send(keptSession, KeptSession.E.SignIn({ user: "y" }));

    return (reloaded ? before.reload() : before)
      .send(keptSession, KeptSession.E.SignIn({ user: "a" }))
      .checkpoint("back");
  };

  it("Turn R22, Restore R2: a when defect keeps the previous baseline across a reload as it does live, so the return to it is silent", async () => {
    for (const reloaded of [false, true]) {
      // oxlint-disable-next-line no-await-in-loop -- one run at a time: each is its own world
      const run = checked(await story(reloaded).run());

      expect(run.checkpoints.back.read(echo)?.memory.echoes).toBe(1);
    }
  });
});

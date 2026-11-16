import assert from "node:assert/strict";
import { Effect, Option, Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { attachInspector, type Evidence } from "../../src/host/inspect.ts";
import { Story } from "../../src/host/testing/index.ts";
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
    user: Session.Provider.select((s) => s.memory.user),
    broken: Session.Provider.select((s) => {
      if (s.memory.user === "boom") throw new Error("boom");

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
  context: { user: Session.Provider.select((s) => s.memory.user) },
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
  context: { user: Session.Provider.select((s) => s.memory.user) },
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
    left: Watcher.Provider.select((s) => s.memory.seen),
    right: Watcher.Provider.select((s) => s.memory.seen),
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
    user: Session.Provider.select((s) => s.memory.user),
    seen: Watcher.Provider.select((s) => s.memory.seen),
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

const UpstreamNode = definition({ id: "Context/Node", states: ["ON"], events: {} });

const Node = definition({
  id: "Context/Node",
  states: ["ON"],
  events: {},
  context: { up: UpstreamNode.Provider.select((s) => s.state) },
});

const NodeMachine = machine(Node, ({ S }) => ({ default: S.ON }));

const main = actorRef(SessionMachine, "main");
const other = actorRef(SessionMachine, "other");
const badge = actorRef(BadgeMachine, "badge");
const pair = actorRef(PairMachine, "pair");

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

describe("context waves (Actors R19, I27; Turn R22)", () => {
  it("Turn R22: a provider change gives the consumer one onContext event; an equal selection is silent", () => {
    const { runtime, seen } = ready();
    const handle = runtime.ensureActor(badge);
    const session = runtime.ensureActor(main);
    session.send({ _tag: "SignIn", user: "ada" });
    session.send({ _tag: "SignIn", user: "ada" });

    expect(turnsOf(seen, "UserChanged")).toBe(1);
    expect(Option.map(handle.getSnapshot(), (s) => s.memory["greeting"])).toEqual(
      Option.some("hi ada"),
    );
    expect(Option.map(handle.getSnapshot(), (s) => s.context["user"])).toEqual(Option.some("ada"));
  });

  it("Actors R19: a throwing selector keeps its slot's last value and raises one issue; the other slots and the provider go on", () => {
    const { runtime, seen } = ready();
    const handle = runtime.ensureActor(badge);
    const session = runtime.ensureActor(main);
    session.send({ _tag: "SignIn", user: "boom" });

    const read = Option.getOrThrow(handle.getSnapshot());
    expect(read.context).toEqual({ user: "boom", broken: 0 });
    expect(read.issues.map((d) => d.path[2])).toEqual(["context broken"]);
    expect(seen.filter((e) => e._tag === "Issue")).toHaveLength(1);
    expect(Option.map(session.getSnapshot(), (s) => s.memory["user"])).toEqual(Option.some("boom"));
  });

  it("Actors R19, I27: in a diamond the consumer gets one update per wave, never mixing new and stale values", () => {
    const { runtime } = ready();
    const handle = runtime.ensureActor(pair);
    runtime.ensureActor(actorRef(WatcherMachine, "left"));
    runtime.ensureActor(actorRef(WatcherMachine, "right"));
    runtime.ensureActor(main).send({ _tag: "SignIn", user: "ada" });

    expect(Option.map(handle.getSnapshot(), (s) => s.memory["pairs"])).toEqual(
      Option.some(["ada|ada"]),
    );
  });

  it("Actors R19, I27: a consumer bound to a provider and to that provider's consumer gets one update per wave, after both settle", () => {
    const { runtime } = ready();
    const handle = runtime.ensureActor(actorRef(BothMachine, "both"));
    runtime.ensureActor(main).send({ _tag: "SignIn", user: "ada" });

    expect(Option.map(handle.getSnapshot(), (s) => s.memory["pairs"])).toEqual(
      Option.some(["ada|ada"]),
    );
  });
});

describe("context in callbacks (Turn R12)", () => {
  // A known gap, owned by the machine-structure slice: guards and updates are not handed context.
  it.fails("Turn R12: a guard and an update receive the turn's context", () => {
    const { runtime } = ready();
    const reader = runtime.ensureActor(actorRef(ReaderMachine, "reader"));
    reader.send({ _tag: "Read" });

    expect(Option.map(reader.getSnapshot(), (s) => s.memory["read"])).toEqual(
      Option.some("context"),
    );
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
  context: { user: KeptSession.Provider.select((s) => s.memory.user) },
});

const KeptWatcherMachine = machine(KeptWatcher, ({ S, E }) => ({
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
        .send(keptSession, { _tag: "SignIn", user: "ada" })
        .advance("1 second")
        .send(keptWatcher, { _tag: "Ping" })
        .checkpoint("back")
        .run(),
    );

    const turns = run.evidence.flatMap((e) => (e._tag === "Turn" ? [e.event] : []));
    expect(turns).toEqual(["SignIn", "Seen", "Ping"]);
    expect(run.checkpoints.back.read(keptWatcher)?.memory["seen"]).toBe("ada");
  });

  it("Actors R18: a reload binds a consumer to the provider its ref named, not its entry's default", async () => {
    const otherSession = actorRef(KeptSessionMachine, "other");
    const overridden = actorRef(KeptWatcherMachine, "w", { context: { user: otherSession } });

    const run = checked(
      await Story.app(kept, { id: "context/reload-override", fixtures: [] })
        .send(otherSession, { _tag: "SignIn", user: "bob" })
        .ensure(otherSession)
        .send(otherSession, { _tag: "SignIn", user: "bob" })
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
        .send(keptSession, { _tag: "SignIn", user: "ada" })
        .reload()
        .checkpoint("reloaded")
        .run(),
    );

    const seen = run.evidence.filter((e) => e._tag === "Turn" && e.event === "Seen");
    expect(seen).toHaveLength(1);
  });
});

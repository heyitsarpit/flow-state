import { Cause, Duration, Effect, Exit, Option, Schema, type Fiber } from "effect";
import { RuntimeDefaults } from "../core/defaults.ts";
import { describe, expect, it } from "vite-plus/test";
import { actorRef, app, definition, Flow, machine } from "../index.ts";
import { bootWith, platformOver, testing } from "./testing/seam.ts";

const Session = definition({
  id: "Restore/Session",
  persist: true,
  states: ["READY"],
  events: { SignIn: { user: Schema.String } },
  memory: { user: Flow.initial(Schema.String, "") },
});

const SessionMachine = machine(Session, ({ S }) => ({
  default: S.READY,
  on: { SignIn: { updateMemory: ({ event }) => ({ user: event.user }) } },
}));

const Badge = definition({
  id: "Restore/Badge",
  persist: true,
  states: ["SHOWN"],
  events: { Ping: {} },
  memory: { pings: Flow.initial(Schema.Number, 0) },
  context: { user: Session.Provider.select(Schema.String, (s) => s.memory.user) },
});

const BadgeMachine = machine(Badge, ({ S }) => ({
  default: S.SHOWN,
  on: { Ping: { updateMemory: ({ memory }) => ({ pings: memory.pings + 1 }) } },
}));

const main = actorRef(SessionMachine, "main");
const other = actorRef(SessionMachine, "other");

const badges = app({
  id: "badges",
  machines: {
    session: SessionMachine,
    badge: { machine: BadgeMachine, context: { user: main } },
  },
});

const badgeId = { machine: "Restore/Badge", name: "badge" };

describe("context bindings survive a reload (Actors R18; WriteAhead R4)", () => {
  it("Actors R18: a consumer whose ref overrode its provider binds that provider again when its record restores", () => {
    const store = new Map<string, string>();
    const first = bootWith(badges, store, 1);

    first.built.runtime.ensureActor(actorRef(SessionMachine, "main")).send({
      _tag: "SignIn",
      user: "ann",
    });
    first.built.runtime.ensureActor(other).send({ _tag: "SignIn", user: "bob" });
    first.built.runtime.ensureActor(actorRef(BadgeMachine, "badge", { context: { user: other } }));
    first.tab.settle();

    const second = bootWith(badges, store, 2);
    testing.send(second.built, badgeId, "Ping", {});
    second.tab.settle();

    expect(Option.map(testing.snapshot(second.built, badgeId), (s) => s.context)).toEqual(
      Option.some({ user: "bob" }),
    );
  });
});

const outcome = (fiber: Fiber.Fiber<void, { readonly code: string }>) =>
  Option.match(Option.fromUndefinedOr(fiber.pollUnsafe()), {
    onNone: () => "pending",
    onSome: (exit) =>
      Exit.isSuccess(exit)
        ? "ran"
        : Option.match(Cause.findErrorOption(exit.cause), {
            onNone: () => "threw",
            onSome: (e) => e.code,
          }),
  });

describe("forgetting a scope (Restore R10, I18)", () => {
  it("Restore R10: dispose({ forget: true }) deletes every record of the scope before it succeeds", () => {
    const store = new Map<string, string>([["lane/elsewhere|op|{}", "kept by no one"]]);
    const { built, tab } = bootWith(badges, store, 1);
    built.runtime.ensureActor(other).send({ _tag: "SignIn", user: "bob" });
    tab.settle();

    expect(store.size).toBeGreaterThan(1);

    const disposing = Effect.runFork(built.runtime.dispose({ forget: true }));
    tab.settle();
    tab.advance(Duration.toMillis(RuntimeDefaults.disposalBound));

    expect(outcome(disposing)).toBe("ran");
    expect([...store.keys()]).toEqual([]);
  });

  it("Restore R10: a refused deletion fails StorageFailure and the records stay", () => {
    const store = new Map<string, string>();
    const refusals = { left: Array.of<true>() };
    const { built, tab } = bootWith(badges, store, 1, true, undefined, refusals);
    built.runtime.ensureActor(other).send({ _tag: "SignIn", user: "bob" });
    tab.settle();
    const saved = new Map(store);

    // The store refuses every write from here on: the disposal's own and the deletion.
    refusals.left.push(true, true, true);
    const disposing = Effect.runFork(built.runtime.dispose({ forget: true }));
    tab.settle();
    tab.advance(Duration.toMillis(RuntimeDefaults.disposalBound));

    expect(outcome(disposing)).toBe("StorageFailure");
    expect(store).toEqual(saved);
  });

  it("Restore I18: with the disposal's write still unanswered, a forget fails StorageFailure and deletes nothing", () => {
    const store = new Map<string, string>([["actor/Restore/Session/main", "saved before"]]);

    const { built, tab } = bootWith(badges, store, 1, true, { captureMs: 0, hung: true });
    built.runtime.ensureActor(other).send({ _tag: "SignIn", user: "bob" });
    tab.settle();

    const disposing = Effect.runFork(built.runtime.dispose({ forget: true }));
    tab.settle();
    tab.advance(Duration.toMillis(RuntimeDefaults.disposalBound));

    expect(outcome(disposing)).toBe("StorageFailure");
    expect([...store.keys()]).toEqual(["actor/Restore/Session/main"]);
  });

  it("Restore R10: a forget before the Runtime booted fails StorageFailure and deletes nothing", () => {
    const store = new Map<string, string>([["actor/Restore/Session/main", "saved before"]]);
    const tab = platformOver(store, 1);
    const built = testing.build({ app: badges, scope: "test", persistence: {} }, tab.platform);

    const disposing = Effect.runFork(built.runtime.dispose({ forget: true }));
    tab.settle();

    expect(outcome(disposing)).toBe("StorageFailure");
    expect([...store.keys()]).toEqual(["actor/Restore/Session/main"]);
  });

  it("Restore R10: an ordinary disposal keeps the scope's records", () => {
    const store = new Map<string, string>();
    const { built, tab } = bootWith(badges, store, 1);
    built.runtime.ensureActor(other).send({ _tag: "SignIn", user: "bob" });
    tab.settle();
    const saved = new Map(store);

    const disposing = Effect.runFork(built.runtime.dispose());
    tab.settle();
    tab.advance(Duration.toMillis(RuntimeDefaults.disposalBound));

    expect(outcome(disposing)).toBe("ran");
    expect(store).toEqual(saved);
  });
});

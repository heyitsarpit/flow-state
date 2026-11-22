import { Predicate, Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { Booking, WARN_MS } from "../../fixtures/wizard/machines/booking.ts";
import { usual } from "../../fixtures/wizard/stories/usual.ts";
import { layerIndexedDb } from "../../src/host/persistence.ts";
import { Fake, Story } from "../../src/host/testing/index.ts";
import { actorRef, app, definition, Flow, machine, runtimeSetup } from "../../src/index.ts";
import { loose } from "../../src/test/loose.ts";
import { played } from "../rules/played.ts";
import { timersOf } from "../timers.ts";

// A saved booking restored under a later build whose definition declares its schedules, edited in
// the declaration: reordered, one added, one removed, one renamed. The declaration lands with the
// runtime half of declared schedules; today the definition accepts the declaration and reads none of
// it. The build is written as plain JavaScript writes it.

type Tokens = {
  readonly S: Readonly<Record<string, unknown>>;
  readonly E: Readonly<Record<string, unknown>>;
};

const untyped: {
  readonly definition: (config: unknown) => Tokens;
  readonly machine: (definition: unknown, body: (tokens: Tokens) => unknown) => unknown;
} = loose({ definition, machine });

type Held = { readonly memory: { readonly heldUntil: number }; readonly now: number };

// The booking edited in a later build: its schedules declared in `declared`'s order, placed in
// HELD by `placed`.
const declaredBuild = (declared: ReadonlyArray<string>, placed: ReadonlyArray<string>) => {
  const Edited = untyped.definition({
    id: "Wizard/Booking",
    persist: true,
    states: ["PICKING", "HELD", "BOOKED", "EXPIRED"],
    events: Booking.events,
    internalEvents: { Warned: {}, Expired: {}, Reminded: {} },
    memory: {
      slotId: Flow.initial(Schema.String, ""),
      heldUntil: Flow.initial(Schema.Number, 0),
      warning: Flow.initial(Schema.Boolean, false),
    },
    schedules: Object.fromEntries(declared.map((name) => [name, {}])),
  });

  return untyped.machine(Edited, ({ S, E }) => {
    const bodies: Readonly<Record<string, unknown>> = {
      expire: {
        schedule: ({ memory, now }: Held) => memory.heldUntil - now,
        send: E["Expired"],
        armOn: [Flow.entry, E["Extended"]],
      },
      warn: {
        schedule: ({ memory, now }: Held) => memory.heldUntil - WARN_MS - now,
        send: E["Warned"],
        armOn: [Flow.entry, E["Extended"]],
      },
      nudge: {
        schedule: 30_000,
        send: E["Warned"],
        armOn: [Flow.entry, E["Extended"]],
      },
      remind: { schedule: 60_000, send: E["Reminded"] },
    };

    return {
      default: S["PICKING"],
      states: {
        HELD: {
          on: {
            Warned: { updateMemory: () => ({ warning: true }) },
            Expired: { target: S["EXPIRED"], updateMemory: () => ({ slotId: "" }) },
            Reminded: { updateMemory: () => ({ warning: true }) },
          },
          schedules: Object.fromEntries(placed.map((name) => [name, bodies[name]])),
        },
      },
    };
  });
};

const RECORD = "actor/Wizard/Booking/inspection";

// The held booking's saved record, reloaded under the declared build: the restored timers.
const restoredTimers = async (declared: ReadonlyArray<string>, placed: ReadonlyArray<string>) => {
  const saved = await played(usual);
  const text = saved.checkpoints.held.records.stored.get(RECORD) ?? "";
  const edited = declaredBuild(declared, placed);

  expect(text).toContain('"state":"HELD"');

  const setup = runtimeSetup({
    app: app({ id: "wizard", machines: { booking: loose(edited) } }),
    services: layerIndexedDb(),
    scope: "wizard",
    persistence: { captureMs: 0 },
  });

  const ref: never = loose(actorRef(loose(edited), "inspection"));

  const run = await played(
    Story.app(setup, { id: "wizard/declared", fixtures: [] })
      .world(Fake.storage.put(RECORD, text))
      .reload()
      .ensure(ref)
      .checkpoint("restored"),
  );

  return timersOf(run.checkpoints.restored.read(ref));
};

describe("restore under a build that declares its schedules (Schedules R14; Types R8)", () => {
  it("Schedules R14: a saved booking restores under its schedules declared in either order, each keeping its deadline", async () => {
    const deadlines = { warn: { dueAt: 480_000 }, expire: { dueAt: 600_000 } };

    expect(await restoredTimers(["warn", "expire"], ["expire", "warn"])).toEqual(deadlines);
    expect(await restoredTimers(["expire", "warn"], ["expire", "warn"])).toEqual(deadlines);
  });

  it("Schedules R14: a schedule declared and placed in the later build starts at the restore with its full delay; the saved ones keep theirs", async () => {
    expect(
      await restoredTimers(["expire", "warn", "remind"], ["expire", "warn", "remind"]),
    ).toEqual({ expire: { dueAt: 600_000 }, warn: { dueAt: 480_000 }, remind: { dueAt: 60_000 } });
  });

  it("Schedules R14: a schedule removed from the declaration and the body drops its saved deadline", async () => {
    expect(await restoredTimers(["expire"], ["expire"])).toEqual({ expire: { dueAt: 600_000 } });
  });

  it("Schedules R14: a schedule renamed in the declaration is a removal and an addition: the new name starts fresh at the restore, never carrying warn's deadline", async () => {
    expect(await restoredTimers(["expire", "nudge"], ["expire", "nudge"])).toEqual({
      expire: { dueAt: 600_000 },
      nudge: { dueAt: 30_000 },
    });
  });
});

// A persisted poller with one timer per key, its key declared with `fields` in that order.
const poller = (fields: ReadonlyArray<string>) => {
  const Poller = untyped.definition({
    id: "Declared/Poller",
    persist: true,
    states: ["ON"],
    events: {},
    internalEvents: { Polled: {} },
    schedules: { poll: { key: Object.fromEntries(fields.map((field) => [field, Schema.String])) } },
  });

  return untyped.machine(Poller, ({ S, E }) => ({
    default: S["ON"],
    states: {
      ON: {
        schedules: {
          poll: {
            keys: () => [{ id: "a", zone: "eu" }],
            schedule: 600_000,
            send: E["Polled"],
          },
        },
      },
    },
  }));
};

const POLLER = "actor/Declared/Poller/one";

// The poller's timers after a run under one key order, saved a minute in, then a reload two minutes into a new
// run under another: a carried timer keeps 600000, a fresh one would be due at 720000.
const reorderedTimers = async (saved: ReadonlyArray<string>, restored: ReadonlyArray<string>) => {
  const setupOf = (built: unknown) =>
    runtimeSetup({
      app: app({ id: "poller", machines: { poller: loose(built) } }),
      services: layerIndexedDb(),
      scope: "poller",
      persistence: { captureMs: 0 },
    });

  const first = poller(saved);
  const firstRef: never = loose(actorRef(loose(first), "one"));

  const before = await played(
    Story.app(setupOf(first), { id: "poller/saved", fixtures: [] })
      .ensure(firstRef)
      .advance("1 minute")
      .checkpoint("saved"),
  );

  const text = before.checkpoints.saved.records.stored.get(POLLER) ?? "";
  const second = poller(restored);
  const secondRef: never = loose(actorRef(loose(second), "one"));

  expect(text).toContain("poll");

  const after = await played(
    Story.app(setupOf(second), { id: "poller/restored", fixtures: [] })
      .world(Fake.storage.put(POLLER, text))
      .advance("2 minutes")
      .reload()
      .ensure(secondRef)
      .checkpoint("restored"),
  );

  const timers: unknown = timersOf(after.checkpoints.restored.read(secondRef));

  return Predicate.isObject(timers) ? Object.values(timers) : [];
};

describe("a declared key's field order across a reload (Schedules I14; Types R8)", () => {
  it("Schedules I14: a key declared { id, zone } and restored under { zone, id } is the same timer, keeping its deadline (holds today: key text is canonical JSON)", async () => {
    expect(await reorderedTimers(["id", "zone"], ["zone", "id"])).toEqual([
      [{ key: { id: "a", zone: "eu" }, dueAt: 600_000 }],
    ]);
  });
});

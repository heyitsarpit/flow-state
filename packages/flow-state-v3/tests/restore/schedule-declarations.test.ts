import { Schema } from "effect";
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
// runtime half of declared schedules; until then the declared build is refused, so each check is
// inverted. The types follow later, so the build is written as plain JavaScript writes it.

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
        schedule: ({ memory, now }: Held) => memory.heldUntil - WARN_MS - now,
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
  it.fails("Schedules R14: a saved booking restores under its schedules declared in either order, each keeping its deadline", async () => {
    const deadlines = { warn: { dueAt: 480_000 }, expire: { dueAt: 600_000 } };

    expect(await restoredTimers(["warn", "expire"], ["expire", "warn"])).toEqual(deadlines);
    expect(await restoredTimers(["expire", "warn"], ["expire", "warn"])).toEqual(deadlines);
  });

  it.fails("Schedules R14: a schedule declared and placed in the later build starts at the restore with its full delay; the saved ones keep theirs", async () => {
    expect(
      await restoredTimers(["expire", "warn", "remind"], ["expire", "warn", "remind"]),
    ).toEqual({ expire: { dueAt: 600_000 }, warn: { dueAt: 480_000 }, remind: { dueAt: 60_000 } });
  });

  it.fails("Schedules R14: a schedule removed from the declaration and the body drops its saved deadline", async () => {
    expect(await restoredTimers(["expire"], ["expire"])).toEqual({ expire: { dueAt: 600_000 } });
  });

  it.fails("Schedules R14: a schedule renamed in the declaration is a removal and an addition: the new name starts at the restore", async () => {
    expect(await restoredTimers(["expire", "nudge"], ["expire", "nudge"])).toEqual({
      expire: { dueAt: 600_000 },
      nudge: { dueAt: 480_000 },
    });
  });
});

import { Duration } from "effect";
import { describe, expectTypeOf, it } from "vite-plus/test";
import { Room } from "../../fixtures/home/machines/room.ts";
import type { Pay } from "../../fixtures/services/shop/machines/pay.ts";
import type { Sync } from "../../fixtures/sync/machines/sync.ts";
import type * as Flow from "../../src/index.ts";
import { machine, type Machine } from "../../src/index.ts";

// Types derived from a fixture's own definition, the way an app reads them. Each pin is two-sided:
// the right line asserted exactly, the wrong line refused under `@ts-expect-error`.

describe("a schedule's send mapper is typed by the declaration (Types R3, R8; Schedules R16)", () => {
  it("Types R3: an unkeyed schedule's send mapper receives `key` as undefined; reading a field of it is refused", () => {
    expectTypeOf(
      machine(Room, ({ S, E }) => ({
        default: S.OFFLINE,
        states: {
          OFFLINE: {
            schedules: {
              reconnect: {
                schedule: Duration.hours(1),
                send: E.Nudged.from((firing) => {
                  expectTypeOf(firing.key).toEqualTypeOf<undefined>();

                  return { attempt: firing.attempt };
                }),
              },
            },
          },
          ONLINE: { default: S.ONLINE.IDLE },
        },
      })),
    ).toEqualTypeOf<Machine<typeof Room>>();

    void machine(Room, ({ S, E }) => ({
      default: S.OFFLINE,
      states: {
        OFFLINE: {
          schedules: {
            reconnect: {
              schedule: Duration.hours(1),
              // @ts-expect-error Types R3: reconnect is declared without a key, so its key is undefined
              send: E.Nudged.from(({ key }) => ({ attempt: key.id.length })),
            },
          },
        },
        ONLINE: { default: S.ONLINE.IDLE },
      },
    }));
  });

  it("Types R8: a keyed schedule's send mapper receives the declared key; a field the key lacks is refused", () => {
    expectTypeOf(
      machine(Room, ({ S, E }) => ({
        default: S.OFFLINE,
        states: {
          OFFLINE: {
            schedules: {
              poll: {
                keys: ({ memory }) => memory.sensors.map((s) => ({ id: s.id })),
                schedule: Duration.minutes(1),
                restartOn: () => "motion",
                paused: { Vacation: () => false, Saving: () => false },
                send: E.Polled.from(({ key }) => {
                  expectTypeOf(key).toEqualTypeOf<{ readonly id: string }>();

                  return { id: key.id, at: 0 };
                }),
              },
            },
          },
          ONLINE: { default: S.ONLINE.IDLE },
        },
      })),
    ).toEqualTypeOf<Machine<typeof Room>>();

    void machine(Room, ({ S, E }) => ({
      default: S.OFFLINE,
      states: {
        OFFLINE: {
          schedules: {
            poll: {
              keys: ({ memory }) => memory.sensors.map((s) => ({ id: s.id })),
              schedule: Duration.minutes(1),
              restartOn: () => "motion",
              paused: { Vacation: () => false, Saving: () => false },
              // @ts-expect-error Types R8: poll's declared key holds id alone
              send: E.Polled.from(({ key }) => ({ id: key.kind, at: 0 })),
            },
          },
        },
        ONLINE: { default: S.ONLINE.IDLE },
      },
    }));
  });
});

describe("phantom types of a definition's tokens (Types R1, R10)", () => {
  it("Types R10: E.X.Type is the event's payload, what a handler's `event` is", () => {
    expectTypeOf<Parameters<typeof Sync.E.SyncRepo>[0]>().toEqualTypeOf<{
      readonly repo: string;
    }>();

    expectTypeOf<typeof Sync.E.SyncRepo.Type>().toEqualTypeOf<{ readonly repo: string }>();
    // @ts-expect-error Types R10: SyncRepo's payload holds repo alone
    expectTypeOf<typeof Sync.E.SyncRepo.Type>().toEqualTypeOf<{ readonly repository: string }>();
  });

  it("Types R10: a payload-less event's E.X.Type is empty", () => {
    expectTypeOf<keyof typeof Sync.E.Synced.Type>().toEqualTypeOf<never>();
    // @ts-expect-error Types R10: Synced declares no field
    expectTypeOf<keyof typeof Sync.E.Synced.Type>().toEqualTypeOf<"repo">();
  });

  it("Types R10: a helper written apart from a body names E.X.Type, and a field the payload lacks is refused", () => {
    expectTypeOf(
      (event: typeof Sync.E.SyncRepo.Type) => event.repo,
    ).returns.toEqualTypeOf<string>();
    // @ts-expect-error Types R10: SyncRepo's payload has no branch
    void ((event: typeof Sync.E.SyncRepo.Type) => event.branch);
  });

  it("Types R10: D.M.field.Type is the public memory field's type", () => {
    type Sensor = { readonly id: string; readonly kind: "temperature" | "motion" };

    expectTypeOf<(typeof Room.Memory.Type)["sensors"]>().toEqualTypeOf<ReadonlyArray<Sensor>>();

    expectTypeOf<typeof Room.M.sensors.Type>().toEqualTypeOf<ReadonlyArray<Sensor>>();

    type AnyKind = ReadonlyArray<{ readonly id: string; readonly kind: string }>;

    // @ts-expect-error Types R10: a sensor's kind is temperature or motion, not any string
    expectTypeOf<typeof Room.M.sensors.Type>().toEqualTypeOf<AnyKind>();
    // @ts-expect-error Types R10: Room's memory has no field sensor
    void Room.M.sensor;
  });
});

describe("a shared body is typed by an exported row (Types R1, G2)", () => {
  it("Types R1: BodyTokens<D> names a body's tokens, so a shared body needs no Parameters<typeof machine<...>>", () => {
    type HandDerived = Parameters<Parameters<typeof machine<typeof Pay>>[1]>[0];

    expectTypeOf<HandDerived["S"]>().toEqualTypeOf<typeof Pay.S>();

    expectTypeOf<Flow.BodyTokens<typeof Pay>>().toEqualTypeOf<HandDerived>();
    // @ts-expect-error Types R1: the whole token record, not one with E or O erased
    expectTypeOf<Flow.BodyTokens<typeof Pay>>().toEqualTypeOf<
      HandDerived & { readonly E: never }
    >();
  });
});

describe("a definition's face holds tokens and codecs, not its config (Types R1; one way to reach each fact)", () => {
  it("Types R1: the config echo leaves the face; the codecs for whole values stay", () => {
    expectTypeOf<typeof Room.State.Type>().toEqualTypeOf<
      "OFFLINE" | "ONLINE.IDLE" | "ONLINE.HEATING"
    >();
    expectTypeOf<typeof Room>().toHaveProperty("Event");
    expectTypeOf<typeof Room>().toHaveProperty("Input");
    expectTypeOf<typeof Room>().toHaveProperty("Memory");
    expectTypeOf<typeof Room>().toHaveProperty("Snapshot");
    expectTypeOf<typeof Room>().toHaveProperty("state");

    expectTypeOf<Extract<keyof typeof Room, "states">>().toEqualTypeOf<never>();
    expectTypeOf<Extract<keyof typeof Room, "events">>().toEqualTypeOf<never>();
    expectTypeOf<Extract<keyof typeof Room, "internalEvents">>().toEqualTypeOf<never>();
    expectTypeOf<Extract<keyof typeof Room, "memory">>().toEqualTypeOf<never>();
    expectTypeOf<Extract<keyof typeof Room, "context">>().toEqualTypeOf<never>();
    expectTypeOf<Extract<keyof typeof Room, "operations">>().toEqualTypeOf<never>();
    expectTypeOf<Extract<keyof typeof Room, "schedules">>().toEqualTypeOf<never>();
  });

  it("Types R1: a memory token's type is its .Type; its schema leaves the face", () => {
    type Sensor = { readonly id: string; readonly kind: "temperature" | "motion" };

    expectTypeOf<(typeof Room.Memory.Type)["sensors"]>().toEqualTypeOf<ReadonlyArray<Sensor>>();
    expectTypeOf<Extract<keyof typeof Room.M.sensors, "schema">>().toEqualTypeOf<never>();
  });

  it("Types R1: an operation handle carries no Input or Key type; outside-body code names the contract's input Schema", () => {
    expectTypeOf<keyof typeof Pay.O>().toEqualTypeOf<
      "pay" | "place" | "void" | "intent" | "order"
    >();
    expectTypeOf<typeof Pay.O.pay>().not.toHaveProperty("Input");
    expectTypeOf<typeof Pay.O.pay>().not.toHaveProperty("Key");
  });
});

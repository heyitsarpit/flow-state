import { Duration } from "effect";
import { describe, expectTypeOf, it } from "vite-plus/test";
import { Room } from "../../fixtures/home/machines/room.ts";
import type { Pay } from "../../fixtures/services/shop/machines/pay.ts";
import type { Sync } from "../../fixtures/sync/machines/sync.ts";
import type * as Flow from "../../src/index.ts";
import { machine, type Machine } from "../../src/index.ts";

// Types derived from a fixture's own definition, the way an app reads them. Each holding pin is
// two-sided: the right line asserted exactly, the wrong line refused under `@ts-expect-error`. An
// inverted pin refuses a type that does not exist yet; it names the row that flips it, and the
// flipped test asserts the type exactly and refuses a wrong field.

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

    // @ts-expect-error Types R10: inverted until E.X.Type lands; then it equals { readonly repo: string } and a wrong field fails
    expectTypeOf<typeof Sync.E.SyncRepo.Type>().toEqualTypeOf<{ readonly repo: string }>();
  });

  it("Types R10: D.M.field.Type is the public memory field's type", () => {
    type Sensor = { readonly id: string; readonly kind: "temperature" | "motion" };

    expectTypeOf<typeof Room.M.sensors.schema.Type>().toEqualTypeOf<ReadonlyArray<Sensor>>();

    // @ts-expect-error Types R10: inverted until D.M.field.Type lands; then it equals the sensors list and a wrong field fails
    expectTypeOf<typeof Room.M.sensors.Type>().toEqualTypeOf<ReadonlyArray<Sensor>>();
  });
});

describe("a shared body is typed by an exported row (Types R1, G2)", () => {
  it("Types R1: BodyTokens<D> names a body's tokens, so a shared body needs no Parameters<typeof machine<...>>", () => {
    type HandDerived = Parameters<Parameters<typeof machine<typeof Pay>>[1]>[0];

    expectTypeOf<HandDerived["S"]>().toEqualTypeOf<typeof Pay.S>();

    // @ts-expect-error Types R1: inverted until BodyTokens is exported; then pay.ts's payBody takes BodyTokens<typeof Pay>
    expectTypeOf<Flow.BodyTokens<typeof Pay>["S"]>().toEqualTypeOf<typeof Pay.S>();
  });
});

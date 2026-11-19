import { describe, expectTypeOf, it } from "vite-plus/test";
import { Schema } from "effect";
import { definition, Flow, machine, type Machine } from "../../src/index.ts";

const Player = definition({
  id: "types/Player",
  states: ["OFF", { ON: ["PLAYING", "PAUSED"] }],
  events: { Play: {}, Rename: { docId: Schema.String } },
  memory: {
    docId: Flow.input(Schema.String),
    pos: Flow.initial(Schema.Number, 0),
    secret: Flow.private(Flow.initial(Schema.String, "")),
  },
});

type Outside = typeof Player.Snapshot.Type;

// @ts-expect-error an outside snapshot's type omits Flow.private fields (Turn R23)
export const secretOf = (snapshot: Outside) => snapshot.memory.secret;

// RETURN_TYPE: the State Schema's type is the leaf paths alone.
export const stateOf = (snapshot: Outside): "OFF" | "ON.PLAYING" | "ON.PAUSED" => snapshot.state;

describe("Compile R4, R7, Turn R23: the state tree and memory writes", () => {
  it("each wrong line fails to compile beside its exact right one", () => {
    expectTypeOf(
      machine(Player, ({ S }) => ({
        default: S.OFF,
        on: { Play: S.ON.history },
        states: { ON: { default: S.ON.PLAYING, on: { Play: S.ON.PAUSED } } },
      })),
    ).toEqualTypeOf<Machine<typeof Player>>();

    void machine(Player, ({ S }) => ({
      default: S.OFF,
      states: {
        // @ts-expect-error a compound's default names one of its direct children (Compile R4)
        ON: { default: S.OFF },
      },
    }));

    void machine(Player, ({ S }) => ({
      default: S.OFF,
      states: {
        // @ts-expect-error a leaf has no default (Compile R4)
        OFF: { default: S.OFF },
        ON: { default: S.ON.PLAYING },
      },
    }));

    void machine(Player, ({ S }) => ({
      // @ts-expect-error the root's default is a direct child (Compile R4)
      default: S.ON.PLAYING,
    }));

    void machine(Player, ({ S }) => ({
      default: S.OFF,
      states: {
        ON: {
          default: S.ON.PLAYING,
          states: {
            // @ts-expect-error a child the compound lacks (Compile R3, R14)
            STOPPED: {},
          },
        },
      },
    }));

    void machine(Player, ({ S }) => ({
      default: S.OFF,
      on: {
        // @ts-expect-error a leaf has no history (Machines O2)
        Play: S.OFF.history,
      },
    }));

    expectTypeOf(
      machine(Player, ({ S }) => ({
        default: S.OFF,
        on: { Play: { updateMemory: ({ memory }) => ({ pos: memory.pos + 1, secret: "s" }) } },
      })),
    ).toEqualTypeOf<Machine<typeof Player>>();

    void machine(Player, ({ S }) => ({
      default: S.OFF,
      on: {
        Rename: {
          // @ts-expect-error an input field is read-only: it names the actor (Compile R7)
          updateMemory: ({ event }) => ({ docId: event.docId }),
        },
      },
    }));
  });
});

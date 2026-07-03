import { Schema } from "effect";
import { FastCheck } from "effect/testing";
import { describe, expect, it } from "vite-plus/test";

import * as flow from "./index.js";
import { test } from "./testing.js";

const TypeNameEventSchema = Schema.Struct({
  type: Schema.Literal("TYPE_NAME"),
  name: Schema.String,
});

const ClearEventSchema = Schema.Struct({
  type: Schema.Literal("CLEAR"),
});

const SubmitEventSchema = Schema.Struct({
  type: Schema.Literal("SUBMIT"),
});

const FormEventSchema = Schema.Union([TypeNameEventSchema, ClearEventSchema, SubmitEventSchema]);
const AdvanceMillisSchema = Schema.Literals([0, 500, 1_999, 2_000, 2_500]);

type FormEvent = Schema.Schema.Type<typeof FormEventSchema>;
type AdvanceMillis = Schema.Schema.Type<typeof AdvanceMillisSchema>;
type FormContext = Readonly<{
  readonly name: string;
}>;
type FormState = "editing" | "submitted";
type TimerState = "waiting" | "done";

const formEventArbitrary = Schema.toArbitrary(FormEventSchema);
const advanceMillisArbitrary = Schema.toArbitrary(AdvanceMillisSchema);

const formMachine = flow.machine<FormContext, FormEvent, FormState>({
  id: "flow-test.property.schema-events",
  initial: "editing",
  context: () => ({ name: "" }),
  states: {
    editing: {
      on: {
        TYPE_NAME: {
          update: ({ event }) => (event.type === "TYPE_NAME" ? { name: event.name } : {}),
        },
        CLEAR: {
          update: () => ({ name: "" }),
        },
        SUBMIT: {
          target: "submitted",
          guard: ({ context }) => context.name.trim().length > 0,
        },
      },
    },
    submitted: {},
  },
});

function createTimerMachine(id: string) {
  return flow.machine<{ readonly ticks: number }, never, TimerState>({
    id,
    initial: "waiting",
    context: () => ({ ticks: 0 }),
    states: {
      waiting: {
        after: flow.after({
          id: `${id}.dismiss`,
          delay: "2 seconds",
          target: "done",
          update: ({ context }) => ({ ticks: context.ticks + 1 }),
        }),
      },
      done: {},
    },
  });
}

function expectedFormOutcome(events: ReadonlyArray<FormEvent>): Readonly<{
  readonly state: FormState;
  readonly context: FormContext;
}> {
  let state: FormState = "editing";
  let context: FormContext = { name: "" };

  for (const event of events) {
    if (state === "submitted") {
      continue;
    }

    switch (event.type) {
      case "TYPE_NAME":
        context = { name: event.name };
        break;
      case "CLEAR":
        context = { name: "" };
        break;
      case "SUBMIT":
        if (context.name.trim().length > 0) {
          state = "submitted";
        }
        break;
    }
  }

  return {
    state,
    context,
  };
}

describe("flow test property support", () => {
  it("replays schema-derived event sequences through the focused harness", () => {
    FastCheck.assert(
      FastCheck.property(FastCheck.array(formEventArbitrary, { maxLength: 12 }), (events) => {
        const harness = test(formMachine).run();
        for (const event of events) {
          harness.send(event);
        }

        const expected = expectedFormOutcome(events);

        expect(harness.state()).toBe(expected.state);
        expect(harness.context()).toEqual(expected.context);
        expect(harness.issues()).toEqual([]);
      }),
      { numRuns: 50 },
    );
  });

  it("supports async properties for virtual-time scenarios", async () => {
    await FastCheck.assert(
      FastCheck.asyncProperty(advanceMillisArbitrary, async (millis: AdvanceMillis) => {
        const harness = test(createTimerMachine("flow-test.property.timer")).run();

        await harness.advance(`${millis} millis`);

        if (millis >= 2_000) {
          expect(harness.state()).toBe("done");
          expect(harness.context().ticks).toBe(1);
          expect(
            harness
              .timers()
              .events("flow-test.property.timer.dismiss")
              .map((receipt) => receipt.type),
          ).toEqual(["timer:start", "timer:fire"]);
          return;
        }

        expect(harness.state()).toBe("waiting");
        expect(harness.context().ticks).toBe(0);
        expect(harness.timers().active("flow-test.property.timer.dismiss")).toMatchObject({
          status: "scheduled",
          generation: 1,
        });
      }),
      { numRuns: 25 },
    );
  });
});

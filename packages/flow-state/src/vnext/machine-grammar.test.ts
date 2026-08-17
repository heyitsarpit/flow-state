import { Effect, Stream } from "effect";
import { describe, expect, it } from "vite-plus/test";

import { definition, machine, resource, stream, transaction } from "./index.js";

const Workflow = definition({
  id: "Grammar/Workflow",
  states: ["IDLE", "RUNNING", "DONE"],
  events: { Start: (id: string) => ({ id }), Finish: null },
  memory: () => ({ activeId: null as string | null }),
});

const record = resource({ id: "grammar.record", lookup: (id: string) => Effect.succeed({ id }) });
const save = transaction({
  id: "grammar.save",
  key: (input: { readonly id: string }) => input.id,
  commit: (input: { readonly id: string }) => Effect.succeed(input.id),
});
const events = stream({ id: "grammar.events", subscribe: (id: string) => Stream.make(id) });

const invalidMachine = (config: unknown): unknown =>
  Reflect.apply(machine, undefined, [Workflow, () => config]);

describe("private vNext flat machine grammar", () => {
  it("normalizes one flat complete graph and inert activity/timer slots", () => {
    const workflow = machine(Workflow, ({ S, E, activity }) => ({
      initial: S.IDLE,
      states: {
        IDLE: {
          on: {
            Start: {
              target: S.RUNNING,
              guard: ({ event }) => event.id.length > 0,
              updateMemory: ({ event }) => ({ activeId: event.id }),
            },
          },
        },
        RUNNING: {
          redirect: { when: ({ memory }) => memory.activeId === null, target: S.IDLE },
          activities: [
            activity.ensure(record, {
              params: ({ memory }) => (memory.activeId === null ? null : [memory.activeId]),
              outcomes: { success: () => E.Finish() },
            }),
            activity.run(save, {
              params: ({ memory }) => (memory.activeId === null ? null : { id: memory.activeId }),
            }),
            activity.stream(events, {
              params: ({ memory }) => (memory.activeId === null ? null : [memory.activeId]),
              key: ([id]) => id,
            }),
          ],
          timers: { timeout: { delay: "1 second", target: S.IDLE } },
        },
        DONE: { type: "final" },
      },
    }));

    expect(workflow.initial).toBe(Workflow.S.IDLE);
    expect(workflow.descriptors.map(({ id }) => id)).toEqual([
      "grammar.record",
      "grammar.save",
      "grammar.events",
    ]);
    expect(workflow.timerNames).toEqual(["timeout"]);
    expect(Object.isFrozen(workflow.states.RUNNING?.activities)).toBe(true);
  });

  it("rejects missing, nested, parallel, history, legacy, and invalid final forms", () => {
    expect(() => invalidMachine({ initial: Workflow.S.IDLE, states: { IDLE: {} } })).toThrow();
    expect(() =>
      invalidMachine({
        initial: Workflow.S.IDLE,
        states: { IDLE: { states: {} }, RUNNING: {}, DONE: { type: "final" } },
      }),
    ).toThrow();
    expect(() =>
      invalidMachine({
        initial: Workflow.S.IDLE,
        context: {},
        states: { IDLE: {}, RUNNING: {}, DONE: { type: "final" } },
      }),
    ).toThrow();
    for (const legacyKey of ["invoke", "always", "after"] as const)
      expect(() =>
        invalidMachine({
          initial: Workflow.S.IDLE,
          states: {
            IDLE: { [legacyKey]: {} },
            RUNNING: {},
            DONE: { type: "final" },
          },
        }),
      ).toThrow();
    expect(() =>
      invalidMachine({
        initial: Workflow.S.IDLE,
        states: {
          IDLE: { on: { Start: "RUNNING" } },
          RUNNING: {},
          DONE: { type: "final" },
        },
      }),
    ).toThrow();
    expect(() =>
      invalidMachine({
        initial: Workflow.S.IDLE,
        states: { IDLE: { type: "parallel" }, RUNNING: {}, DONE: { type: "final" } },
      }),
    ).toThrow();
    expect(() =>
      invalidMachine({
        initial: Workflow.S.IDLE,
        states: { IDLE: { history: "deep" }, RUNNING: {}, DONE: { type: "final" } },
      }),
    ).toThrow();
    expect(() =>
      invalidMachine({
        initial: Workflow.S.IDLE,
        memory: {},
        states: { IDLE: {}, RUNNING: {}, DONE: { type: "final" } },
      }),
    ).toThrow();
    expect(() =>
      invalidMachine({
        initial: Workflow.S.IDLE,
        states: { IDLE: {}, RUNNING: {}, DONE: { type: "final", on: {} } },
      }),
    ).toThrow();
  });

  it("rejects foreign tokens, unknown events, transition fields, and duplicate timer names", () => {
    const Foreign = definition({ id: "Grammar/Foreign", states: ["IDLE"], events: {} });
    expect(() =>
      invalidMachine({
        initial: Foreign.S.IDLE,
        states: { IDLE: {}, RUNNING: {}, DONE: { type: "final" } },
      }),
    ).toThrow();
    expect(() =>
      invalidMachine({
        initial: Workflow.S.IDLE,
        states: {
          IDLE: { on: { Unknown: Workflow.S.RUNNING } },
          RUNNING: {},
          DONE: { type: "final" },
        },
      }),
    ).toThrow();
    expect(() =>
      invalidMachine({
        initial: Workflow.S.IDLE,
        states: {
          IDLE: { on: { Start: { target: Workflow.S.RUNNING, actions: [] } } },
          RUNNING: {},
          DONE: { type: "final" },
        },
      }),
    ).toThrow();
    expect(() =>
      invalidMachine({
        initial: Workflow.S.IDLE,
        states: {
          IDLE: { timers: { shared: { delay: 1, target: Workflow.S.RUNNING } } },
          RUNNING: { timers: { shared: { delay: 1, target: Workflow.S.DONE } } },
          DONE: { type: "final" },
        },
      }),
    ).toThrow();
  });
});

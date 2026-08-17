import { Effect, Stream } from "effect";
import { describe, expect, it } from "vite-plus/test";

import {
  app,
  child,
  definition,
  machine,
  module,
  resource,
  stream,
  transaction,
  type EventOf,
  type InputOf,
  type MemoryOf,
  type RequirementsOf,
  type SelectedOf,
  type StateOf,
  view,
} from "./index.js";

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2
    ? true
    : false;
type Expect<Value extends true> = Value;

class ProjectRepo {
  readonly _tag = "ProjectRepo";
}

class DynamicAudit {
  readonly _tag = "DynamicAudit";
}

const Todo = definition({
  id: "Todos/Editor",
  states: ["READY", "SAVING"],
  events: {
    SaveRequested: (title: string) => ({ title }),
    SaveCompleted: null,
  },
  memory: ({ input }: { readonly input: { readonly todoId: string } }) => ({
    todoId: input.todoId,
    draft: "",
  }),
});

type _DefinitionId = Expect<Equal<typeof Todo.id, "Todos/Editor">>;
type _DefinitionInput = Expect<Equal<InputOf<typeof Todo>, { readonly todoId: string }>>;
type _DefinitionMemory = Expect<
  Equal<MemoryOf<typeof Todo>, Readonly<{ todoId: string; draft: string }>>
>;
type _DefinitionState = Expect<
  Equal<StateOf<typeof Todo>, typeof Todo.S.READY | typeof Todo.S.SAVING>
>;
type _DefinitionEvent = Expect<
  Equal<
    EventOf<typeof Todo>,
    ReturnType<typeof Todo.E.SaveRequested> | ReturnType<typeof Todo.E.SaveCompleted>
  >
>;

const project = resource({
  id: "projects.by-id",
  lookup: (
    id: `project-${number}`,
  ): Effect.Effect<{ readonly id: string }, "missing", ProjectRepo> => Effect.succeed({ id }),
});

const saveProject = transaction({
  id: "projects.save",
  key: (params: { readonly id: string; readonly title: string }) => ({ id: params.id }),
  commit: (params: {
    readonly id: string;
    readonly title: string;
  }): Effect.Effect<{ readonly id: string }, "rejected", ProjectRepo> =>
    Effect.succeed({ id: params.id }),
});

const projectEvents = stream({
  id: "projects.events",
  subscribe: (_id: string) => Stream.make("event"),
});

const PublicDefinition = definition({
  id: "Public",
  states: ["IDLE", "DONE"],
  events: { Open: (id: `project-${number}`) => ({ id }), Done: null },
  memory: () => ({ selected: null as `project-${number}` | null }),
});

const publicMachine = machine(PublicDefinition, ({ S, E, activity }) => ({
  initial: S.IDLE,
  states: {
    IDLE: {
      on: {
        Open: {
          target: S.DONE,
          updateMemory: ({ event }) => ({ selected: event.id }),
        },
      },
      activities: [
        activity.ensure(project, {
          params: ({ memory }) => (memory.selected === null ? null : [memory.selected]),
          outcomes: { success: () => E.Done() },
        }),
        activity.run(saveProject, {
          params: ({ memory }) =>
            memory.selected === null ? null : { id: memory.selected, title: "saved" },
          outcomes: { success: () => E.Done() },
        }),
        activity.stream(projectEvents, {
          params: ({ memory }) => (memory.selected === null ? null : [memory.selected]),
          key: ([id]) => id,
          outcomes: { value: () => E.Done() },
        }),
      ],
    },
    DONE: { type: "final" },
  },
}));

const publicView = view(publicMachine, {
  id: "public.view",
  select: (snapshot) => {
    const streamSnapshot = snapshot.streams.get(projectEvents);
    if (streamSnapshot.status !== "idle") {
      const exactStreamKey: string = streamSnapshot.key;
      void exactStreamKey;
    }
    const assertMissingTimer = (): void => {
      // @ts-expect-error this machine declared no timer names
      snapshot.timers.get("missing");
    };
    void assertMissingTimer;
    return { state: snapshot.value, selected: snapshot.memory.selected };
  },
});
const publicModule = module({ id: "Public", machines: [publicMachine], views: [publicView] });
const DynamicDefinition = definition({
  id: "Public/Dynamic",
  states: ["READY"],
  events: {},
  memory: ({ input }: { readonly input: { readonly id: string } }) => ({ id: input.id }),
});
const dynamicAudit = resource({
  id: "public.dynamic-audit",
  lookup: (id: string): Effect.Effect<string, never, DynamicAudit> => Effect.succeed(id),
});
const dynamicMachine = machine(DynamicDefinition, ({ S, activity }) => ({
  initial: S.READY,
  states: {
    READY: { activities: [activity.ensure(dynamicAudit, { params: ({ memory }) => [memory.id] })] },
  },
}));
const publicApp = app({
  id: "public-app",
  persistenceVersion: "1",
  modules: [publicModule],
  dynamicMachines: [dynamicMachine],
});

type _MachineState = Expect<Equal<StateOf<typeof publicMachine>, StateOf<typeof PublicDefinition>>>;
type _MachineEvent = Expect<Equal<EventOf<typeof publicMachine>, EventOf<typeof PublicDefinition>>>;
type _View = Expect<
  Equal<
    SelectedOf<typeof publicView>,
    Readonly<{
      state: StateOf<typeof PublicDefinition>;
      selected: `project-${number}` | null;
    }>
  >
>;
type _Requirements = Expect<Equal<RequirementsOf<typeof publicApp>, ProjectRepo | DynamicAudit>>;
type TypeChecks = readonly [
  _DefinitionId,
  _DefinitionInput,
  _DefinitionMemory,
  _DefinitionState,
  _DefinitionEvent,
  _MachineState,
  _MachineEvent,
  _View,
  _Requirements,
];
const typeChecks: TypeChecks = [true, true, true, true, true, true, true, true, true];
void typeChecks;

describe("private vNext definition and exact carriers", () => {
  it("derives immutable length-prefixed tokens and callable events without running memory", () => {
    expect(Todo.S.READY).toEqual({
      kind: "state",
      name: "READY",
      id: "S|12:Todos/Editor|5:READY",
    });
    expect(Todo.E.SaveRequested("title")).toEqual({
      type: "E|12:Todos/Editor|13:SaveRequested",
      title: "title",
    });
    expect(Object.isFrozen(Todo.S.READY)).toBe(true);
    expect(Object.isFrozen(Todo.E.SaveRequested("title"))).toBe(true);
  });

  it("rejects invalid authored identity and event payload carriers locally", () => {
    expect(() => definition({ id: "", states: ["READY"], events: {} })).toThrow();
    expect(() => definition({ id: "bad\u0000id", states: ["READY"], events: {} })).toThrow();
    expect(() => definition({ id: "\ud800", states: ["READY"], events: {} })).toThrow();
    expect(() => definition({ id: "x".repeat(257), states: ["READY"], events: {} })).toThrow();

    const Boundaries = definition({
      id: "a|1:b",
      states: ["c|2:d"],
      events: { Invalid: () => ({ type: "overwrite" }) },
    });
    expect(Boundaries.S["c|2:d"].id).toBe("S|5:a|1:b|5:c|2:d");
    expect(() => Boundaries.E.Invalid()).toThrow();

    const invalidPayload = definition({
      id: "InvalidPayload",
      states: ["READY"],
      events: { Bad: (() => null) as never },
    });
    expect(() => Reflect.apply(invalidPayload.E.Bad, undefined, [])).toThrow();

    const empty = definition({ id: "EmptyMemory", states: ["READY"], events: {} });
    expect(empty.memory).toBeUndefined();
  });
});

const assertNegativeTypes = (): void => {
  // @ts-expect-error definition state tokens remain a closed exact map
  void Todo.S.UNKNOWN;

  // @ts-expect-error definition event tokens remain a closed exact map
  void Todo.E.Unknown;

  // @ts-expect-error event payload arguments stay exact
  Todo.E.SaveRequested(123);

  // @ts-expect-error memory is a constructor, not a type-only marker
  definition({ id: "bad.memory-marker", states: ["READY"], events: {}, memory: {} });

  // @ts-expect-error initialMemory is removed in favor of the definition memory constructor
  definition({ id: "bad.initial-memory", states: ["READY"], events: {}, initialMemory: {} });

  // @ts-expect-error resource argument tuples stay exact
  project.ref("workspace-1");

  resource({
    id: "bad.resource",
    lookup: (id: string) => Effect.succeed(id),
    // @ts-expect-error resource definitions have no second identity projection
    key: (id: string) => id,
  });

  resource({
    id: "bad.resource-tuples",
    lookup: (id: string) => Effect.succeed(id),
    // @ts-expect-error every resource callback receives the same exact tuple
    tags: (_id: number) => [],
  });

  // @ts-expect-error Date is not a canonical resource-ref input
  resource({ id: "bad.resource-input", lookup: (_date: Date) => Effect.void });

  // @ts-expect-error transaction scope was removed from private vNext
  transaction({ id: "bad.transaction", commit: () => Effect.void, scope: "global" });

  // @ts-expect-error transactions accept exactly zero or one commit parameter
  transaction({
    id: "bad.transaction-arity",
    key: () => "key",
    commit: (_a: string, _b: string) => Effect.void,
  });

  transaction({
    id: "bad.preview-value",
    key: (params: { readonly id: `project-${number}` }) => params.id,
    preview: {
      // @ts-expect-error preview replacement must match the exact referenced resource value
      apply: ({ params }) => [{ ref: project.ref(params.id), replace: "wrong" }],
    },
    commit: (_params: { readonly id: `project-${number}` }) => Effect.void,
  });

  // @ts-expect-error stream pressure policy belongs to the authored Effect Stream
  stream({ id: "bad.stream", subscribe: () => Stream.empty, pressure: "latest" });

  // @ts-expect-error selectors belong to machine-local stream bindings
  stream({ id: "bad.stream-selector", subscribe: () => Stream.empty, select: () => null });

  // @ts-expect-error transaction refs require the projected key
  saveProject.ref();

  // @ts-expect-error transaction refs accept the key, not commit params
  saveProject.ref({ id: "p", title: "wrong" });

  // @ts-expect-error child selectors belong to parent machine bindings
  child({ id: "bad.child-selector", machine: publicMachine, select: () => null });

  module({
    id: "InvalidRoot",
    // @ts-expect-error roots require void input
    machines: [machine(Todo, ({ S }) => ({ initial: S.READY, states: { READY: {}, SAVING: {} } }))],
    views: [],
  });

  module({
    id: "ForeignView",
    machines: [publicMachine],
    views: [
      // @ts-expect-error module views must be bound to a root owned by that module
      view(
        machine(definition({ id: "Other", states: ["READY"], events: {} }), ({ S }) => ({
          initial: S.READY,
          states: { READY: {} },
        })),
        { id: "other", select: () => null },
      ),
    ],
  });

  app({
    id: "bad-dynamic-thunk",
    persistenceVersion: "1",
    modules: [publicModule],
    // @ts-expect-error dynamic admission accepts declared machine values, not thunks
    dynamicMachines: [() => publicMachine],
  });

  app({
    id: "bad-dynamic-input",
    persistenceVersion: "1",
    modules: [publicModule],
    // @ts-expect-error dynamic admission does not accept construction inputs
    dynamicMachines: [{ machine: publicMachine, input: { id: "x" } }],
  });

  const widenedDynamics: readonly (typeof publicMachine)[] = [publicMachine];
  app({
    id: "bad-dynamic-array",
    persistenceVersion: "1",
    modules: [publicModule],
    // @ts-expect-error dynamic admission requires an exact tuple, not a widened array
    dynamicMachines: widenedDynamics,
  });

  machine(PublicDefinition, ({ S, activity }) => ({
    initial: S.IDLE,
    states: {
      IDLE: {
        // @ts-expect-error unknown event transition keys are rejected
        on: { Unknown: S.DONE },
        activities: [
          // @ts-expect-error descriptor-form resource bindings require a params selector
          activity.ensure(project),
          // @ts-expect-error computed invalidation cannot return a Promise
          activity.invalidate({ targets: () => Promise.resolve([]) }),
          // @ts-expect-error untyped strings are not invalidation targets
          activity.invalidate("projects.by-id"),
        ],
      },
      DONE: { type: "final" },
    },
  }));

  machine(PublicDefinition, ({ S }) => ({
    initial: S.IDLE,
    states: {
      IDLE: {
        on: {
          Open: {
            target: S.DONE,
            // @ts-expect-error memory updates cannot introduce unknown fields
            updateMemory: () => ({ missing: true }),
          },
        },
      },
      // @ts-expect-error final nodes cannot have transitions
      DONE: { type: "final", on: {} },
    },
  }));

  // @ts-expect-error machine behavior cannot redefine definition-owned memory
  machine(PublicDefinition, ({ S }) => ({
    initial: S.IDLE,
    states: { IDLE: {}, DONE: { type: "final" } },
    memory: {},
  }));
};
void assertNegativeTypes;

void publicApp;

import assert from "node:assert/strict";
import { Effect, Option, Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { Story } from "../../src/host/testing/index.ts";
import { attachInspector, type Evidence } from "../../src/host/inspect.ts";
import {
  actorRef,
  app,
  definition,
  Flow,
  FlowError,
  machine,
  runtimeSetup,
} from "../../src/index.ts";

const Editor = definition({
  id: "Identity/Editor",
  states: ["EDITING"],
  events: { Type: { text: Schema.String } },
  memory: {
    workspaceId: Flow.input(Schema.String.check(Schema.isNonEmpty())),
    ticketId: Flow.input(Schema.String),
    draft: Flow.initial(Schema.String, ""),
  },
});

const EditorMachine = machine(Editor, ({ S }) => ({
  default: S.EDITING,
  on: { Type: { updateMemory: ({ event, memory }) => ({ draft: memory.draft + event.text }) } },
}));

const Clock = definition({
  id: "Identity/Clock",
  states: ["TICKING"],
  events: { Tick: {} },
  memory: { ticks: Flow.initial(Schema.Number, 0) },
});

const ClockMachine = machine(Clock, ({ S }) => ({
  default: S.TICKING,
  on: { Tick: { updateMemory: ({ memory }) => ({ ticks: memory.ticks + 1 }) } },
}));

const setup = runtimeSetup({
  app: app({ id: "identity", machines: { editor: EditorMachine, clock: ClockMachine } }),
});

const ready = () => {
  const runtime = setup.construct();
  Effect.runSync(runtime.ready());

  return runtime;
};

// The FlowError a call threw, or none when it returned.
const thrownBy = (run: () => unknown) => {
  try {
    run();
  } catch (error) {
    assert.ok(error instanceof FlowError);

    return Option.some(error);
  }

  return Option.none<FlowError>();
};

const thrownCode = (run: () => unknown) =>
  Option.match(thrownBy(run), { onNone: () => "none", onSome: (e) => e.code });

const north = actorRef(EditorMachine, { workspaceId: "north", ticketId: "T-42" });

describe("identity by value (Actors R5, I7, I8, T4)", () => {
  it("Actors R5: a value names the actor by its input fields, whatever their order or the fields beside them", () => {
    const runtime = ready();
    const first = runtime.ensureActor(north);
    first.send({ _tag: "Type", text: "hi" });

    const reordered = runtime.ensureActor(
      actorRef(EditorMachine, { ticketId: "T-42", workspaceId: "north", page: 3 }),
    );

    expect(Option.map(reordered.getSnapshot(), (s) => s.memory["draft"])).toEqual(
      Option.some("hi"),
    );
  });

  it("Actors R5: two values with different input fields name two actors", () => {
    const runtime = ready();
    runtime.ensureActor(north).send({ _tag: "Type", text: "hi" });

    const south = runtime.ensureActor(
      actorRef(EditorMachine, { workspaceId: "south", ticketId: "T-42" }),
    );

    expect(Option.map(south.getSnapshot(), (s) => s.memory["draft"])).toEqual(Option.some(""));
  });

  it("Actors R6, Compile R6: ensuring a value ref creates the actor from that input", () => {
    const runtime = ready();
    const editor = runtime.ensureActor(north);

    expect(Option.map(editor.getSnapshot(), (s) => s.memory)).toEqual(
      Option.some({ workspaceId: "north", ticketId: "T-42", draft: "" }),
    );
  });

  it("Actors R6, I9: an input its Schema refuses throws SchemaValidation naming the field and leaves nothing; a valid ensure then succeeds", () => {
    const runtime = ready();
    const seen: Array<Evidence> = [];
    attachInspector(runtime, (e) => void seen.push(e));
    const empty = actorRef(EditorMachine, { workspaceId: "", ticketId: "T-1" });

    const thrown = Option.getOrThrow(thrownBy(() => runtime.ensureActor(empty)));

    expect(thrown.code).toBe("SchemaValidation");
    expect(thrown.diagnostics[0].path).toEqual(["Identity/Editor", "workspaceId"]);
    expect(seen).toEqual([]);

    const editor = runtime.ensureActor(
      actorRef(EditorMachine, { workspaceId: "w", ticketId: "T-1" }),
    );

    expect(Option.isSome(editor.getSnapshot())).toBe(true);
  });

  it("Actors R5: a singleton is named by its literal name", async () => {
    const one = actorRef(ClockMachine, "one");

    const run = await Story.app(setup, { id: "identity/singleton", fixtures: [] })
      .ensure(one)
      .send(one, { _tag: "Tick" })
      .checkpoint("ticked")
      .run();

    expect(run.checkpoints.ticked.read(one)?.memory["ticks"]).toBe(1);
  });

  it("Actors R5: a Story names a value-named actor by its input", async () => {
    const run = await Story.app(setup, { id: "identity/story", fixtures: [] })
      .ensure(north)
      .send(north, { _tag: "Type", text: "a" })
      .send(actorRef(EditorMachine, { ticketId: "T-42", workspaceId: "north" }), {
        _tag: "Type",
        text: "b",
      })
      .checkpoint("typed")
      .run();

    expect(run.checkpoints.typed.read(north)?.memory["draft"]).toBe("ab");
  });
});

describe("createActor (Actors R6)", () => {
  it("Actors R6: each createActor is a new local actor created from its input", () => {
    const runtime = ready();
    const input = { workspaceId: "north", ticketId: "T-42" };
    const first = runtime.createActor(EditorMachine, { input });
    const second = runtime.createActor(EditorMachine, { input });
    first.send({ _tag: "Type", text: "x" });

    expect(Option.map(first.getSnapshot(), (s) => s.memory["draft"])).toEqual(Option.some("x"));
    expect(Option.map(second.getSnapshot(), (s) => s.memory["draft"])).toEqual(Option.some(""));
    expect(Option.map(runtime.ensureActor(north).getSnapshot(), (s) => s.memory["draft"])).toEqual(
      Option.some(""),
    );
  });

  it("Actors R6: a local actor lives until disposed, never ended by the grace", async () => {
    const runtime = ready();
    const local = runtime.createActor(ClockMachine, { input: {} });
    await Effect.runPromise(Effect.sleep("150 millis"));
    local.send({ _tag: "Tick" });

    expect(Option.map(local.getSnapshot(), (s) => s.memory["ticks"])).toEqual(Option.some(1));

    runtime.disposeActor(local);
    expect(Option.map(local.getSnapshot(), (s) => s.lifecycle)).toEqual(Option.some("disposed"));
  });

  it("Actors R4, R22: createActor rejects RuntimeNotReady before ready and RuntimeDisposed after dispose", () => {
    const runtime = setup.construct();
    expect(thrownCode(() => runtime.createActor(ClockMachine, { input: {} }))).toBe(
      "RuntimeNotReady",
    );
    Effect.runSync(runtime.ready());
    Effect.runSync(runtime.dispose());
    expect(thrownCode(() => runtime.createActor(ClockMachine, { input: {} }))).toBe(
      "RuntimeDisposed",
    );
  });

  it("Actors R6: createActor checks its input by its Schemas", () => {
    const runtime = ready();

    expect(
      thrownCode(() =>
        runtime.createActor(EditorMachine, { input: { workspaceId: "", ticketId: "T" } }),
      ),
    ).toBe("SchemaValidation");
  });
});

describe("isolation (Actors R24, I34)", () => {
  it("Actors R24: a handle of one Runtime is refused by another, and two Runtimes share no actor", () => {
    const a = ready();
    const b = ready();
    const handle = a.ensureActor(north);
    handle.send({ _tag: "Type", text: "a" });

    expect(thrownCode(() => b.disposeActor(handle))).toBe("ForeignActorRef");
    expect(Option.map(b.ensureActor(north).getSnapshot(), (s) => s.memory["draft"])).toEqual(
      Option.some(""),
    );
    expect(thrownCode(() => a.disposeActor(handle))).toBe("none");
  });

  it("Actors R24: a ref of a machine this Runtime's app does not run is refused ForeignActorRef", () => {
    const runtime = ready();
    const Stray = definition({ id: "Identity/Stray", states: ["IDLE"], events: { Go: {} } });

    const stray = actorRef(
      machine(Stray, ({ S }) => ({ default: S.IDLE })),
      "stray",
    );

    expect(thrownCode(() => runtime.ensureActor(stray))).toBe("ForeignActorRef");
    expect(thrownCode(() => runtime.disposeActor(stray))).toBe("ForeignActorRef");
  });
});

describe("app entries (Runtime O1)", () => {
  it("Runtime O1: an app entry's context is optional", () => {
    const runtime = runtimeSetup({
      app: app({ id: "entries", machines: { clock: { machine: ClockMachine } } }),
    }).construct();

    Effect.runSync(runtime.ready());

    expect(Option.isSome(runtime.ensureActor(actorRef(ClockMachine, "c")).getSnapshot())).toBe(
      true,
    );
  });
});

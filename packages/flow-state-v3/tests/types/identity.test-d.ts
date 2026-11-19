import { describe, expectTypeOf, it } from "vite-plus/test";
import { Schema } from "effect";
import { type ActorRef, actorRef, definition, Flow, machine } from "../../src/index.ts";

const Editor = definition({
  id: "types/Editor",
  states: ["EDITING"],
  events: {},
  memory: {
    workspaceId: Flow.input(Schema.String),
    ticketId: Flow.input(Schema.String),
    draft: Flow.initial(Schema.String, ""),
  },
});

const EditorMachine = machine(Editor, ({ S }) => ({ default: S.EDITING }));

const Clock = definition({ id: "types/Clock", states: ["TICKING"], events: {} });

const ClockMachine = machine(Clock, ({ S }) => ({ default: S.TICKING }));

const runtimeName: string = "clock";

describe("Actors R5: an actor's name", () => {
  it("each wrong line fails to compile beside its exact right one", () => {
    expectTypeOf(actorRef(EditorMachine, { workspaceId: "north", ticketId: "T-42" })).toEqualTypeOf<
      ActorRef<typeof Editor>
    >();

    // A value may carry fields beyond the input; only the input names the actor (Actors R5).
    void actorRef(EditorMachine, { workspaceId: "north", ticketId: "T-42", page: 3 });

    expectTypeOf(actorRef(ClockMachine, "clock")).toEqualTypeOf<ActorRef<typeof Clock>>();

    // @ts-expect-error a machine with input is named only by a value (Actors R5)
    void actorRef(EditorMachine, "north");

    // @ts-expect-error a value lacking an input field names no actor (Actors R5)
    void actorRef(EditorMachine, { workspaceId: "north" });

    // @ts-expect-error a machine with no input is named only by a literal string (Actors R5)
    void actorRef(ClockMachine, { id: "clock" });

    // @ts-expect-error a runtime string is not a singleton's name (Actors R5)
    void actorRef(ClockMachine, runtimeName);

    // @ts-expect-error a singleton's name may not start with ~, which local actors use (Actors R5)
    void actorRef(ClockMachine, "~1");
  });
});

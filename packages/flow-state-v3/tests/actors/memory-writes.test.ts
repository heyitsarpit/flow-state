import { Effect, Option, Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { actorRef, app, definition, Flow, machine, runtimeSetup } from "../../src/index.ts";

const Ticket = definition({
  id: "MemoryWrites/Ticket",
  states: ["OPEN"],
  events: { Note: {}, Rename: {} },
  memory: {
    ticketId: Flow.input(Schema.String),
    notes: Flow.initial(Schema.Number, 0),
  },
});

// The input-field write fails the type check; the run check beneath stands for an untyped caller.
// The misspelt key still compiles: TypeScript does not excess-check a returned object, so the run
// refusal is its only check (the type half is owed, tests/types/excess-keys.test-d.ts).
const TicketMachine = machine(Ticket, ({ S }) => ({
  default: S.OPEN,
  on: {
    Note: { updateMemory: ({ memory }) => ({ notes: memory.notes + 1, noets: 7 }) },
    // @ts-expect-error Compile R7: ticketId is an input field, which names the actor
    Rename: { updateMemory: ({ memory }) => ({ notes: memory.notes, ticketId: "T-99" }) },
  },
}));

const setup = runtimeSetup({
  app: app({ id: "memory-writes", machines: { ticket: TicketMachine } }),
});

const memoryAfter = (event: typeof Ticket.E.Note | typeof Ticket.E.Rename) => {
  const runtime = setup.construct();
  Effect.runSync(runtime.ready());
  const ticket = runtime.ensureActor(actorRef(TicketMachine, { ticketId: "T-1" }));

  ticket.send(event({}));

  return ticket.getSnapshot();
};

describe("a turn's memory write (Compile R7, R14, Turn R8)", () => {
  it("Compile R7, Turn R8: a write naming an input field is refused whole; the identity field stays as created", () => {
    const after = memoryAfter(Ticket.E.Rename);

    expect(Option.map(after, (s) => s.memory)).toEqual(Option.some({ ticketId: "T-1", notes: 0 }));
    expect(Option.map(after, (s) => s.issues.map((d) => d.code))).toEqual(
      Option.some(["InvalidConfiguration"]),
    );
  });

  it("Compile R14, Turn R8: a write naming an undeclared field is refused whole; memory keeps its Memory Schema's shape", () => {
    const after = memoryAfter(Ticket.E.Note);

    expect(Option.map(after, (s) => s.memory)).toEqual(Option.some({ ticketId: "T-1", notes: 0 }));
    expect(Option.map(after, (s) => s.issues.map((d) => d.code))).toEqual(
      Option.some(["InvalidConfiguration"]),
    );
  });
});

const Note = definition({
  id: "MemoryWrites/Note",
  states: ["OPEN"],
  events: { Clear: {}, Add: {} },
  memory: { noteId: Flow.input(Schema.String), lines: Flow.initial(Schema.Number, 0) },
});

const NoteMachine = machine(Note, ({ S }) => ({
  default: S.OPEN,
  on: {
    // @ts-expect-error Turn R10: an update returns a patch of memory, never null
    Clear: { updateMemory: () => null },
    Add: { updateMemory: ({ memory }) => ({ lines: memory.lines + 1 }) },
  },
}));

describe("an update that returns no patch (Turn R10)", () => {
  it("Turn R10: an update returning null refuses its turn as a pre-commit defect; memory stays and the next event runs", () => {
    const runtime = runtimeSetup({
      app: app({ id: "memory-writes-patch", machines: { note: NoteMachine } }),
    }).construct();

    Effect.runSync(runtime.ready());
    const note = runtime.ensureActor(actorRef(NoteMachine, { noteId: "N-1" }));

    note.send(Note.E.Clear({}));
    note.send(Note.E.Add({}));

    const after = note.getSnapshot();

    expect(Option.map(after, (s) => s.memory)).toEqual(Option.some({ noteId: "N-1", lines: 1 }));
    expect(Option.map(after, (s) => s.issues.length)).toEqual(Option.some(1));
  });
});

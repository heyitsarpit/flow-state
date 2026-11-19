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

// Inverted: both writes compile today, because a returned object is not checked for excess keys.
// When returned shapes are exact, each line fails the type check: put `@ts-expect-error` on it,
// naming Compile R7 or R14, and keep the run check beneath it for a write that reaches the core.
const TicketMachine = machine(Ticket, ({ S }) => ({
  default: S.OPEN,
  on: {
    Note: { updateMemory: ({ memory }) => ({ notes: memory.notes + 1, noets: 7 }) },
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

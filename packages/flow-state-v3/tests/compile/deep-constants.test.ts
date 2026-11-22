import { Effect, Option, Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { dataView } from "../../src/host/inspect.ts";
import { actorRef, app, definition, Flow, machine, runtimeSetup } from "../../src/index.ts";
import { compiledOf } from "../../src/host/inspect.ts";

// A list nested `depth` deep, its innermost item a note.
const nested = (depth: number) => {
  let doc: Schema.Json = "note";

  for (let n = 0; n < depth; n += 1) doc = [doc];

  return doc;
};

const Template = definition({
  id: "Deep/Template",
  states: ["READY"],
  events: { Touch: {} },
  memory: {
    doc: Flow.initial(Schema.Json, nested(100_000)),
    touched: Flow.initial(Schema.Number, 0),
  },
});

const TemplateMachine = machine(Template, ({ S }) => ({
  default: S.READY,
  on: { Touch: { updateMemory: ({ memory }) => ({ touched: memory.touched + 1 }) } },
}));

describe("constants of any depth (Codec R1; Compile R15)", () => {
  it("Codec R1, Compile R15: a machine whose initial memory is 100,000 deep is checked at construct, starts and runs, with no thrown error", () => {
    const runtime = runtimeSetup({
      app: app({ id: "templates", machines: { template: TemplateMachine } }),
    }).construct();

    // oxlint-disable-next-line lint-bomb/no-effect-runner-in-domain -- a test boots its Runtime once, at its edge
    Effect.runSync(runtime.ready());
    const handle = runtime.ensureActor(actorRef(TemplateMachine, "one"));
    handle.send(Template.E.Touch());

    expect(Option.map(handle.getSnapshot(), (s) => s.memory.touched)).toEqual(Option.some(1));
  });

  it("Codec R1, Inspection: the machine's data view, which tools read, shows the 100,000-deep constant with no thrown error", () => {
    expect(() => dataView(compiledOf(TemplateMachine))).not.toThrow();
  });
});

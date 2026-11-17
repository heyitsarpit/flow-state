import { Option, Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { definition } from "../definition.ts";
import { Flow } from "../flow.ts";
import { machine } from "../machine.ts";
import { decodeRecords } from "./record.ts";

const Feed = definition({
  id: "Test/Feed",
  states: ["OPEN"],
  events: {},
  memory: { items: Flow.initial(Schema.Array(Schema.String), []) },
});

const FeedMachine = machine(Feed, ({ S }) => ({ default: S.OPEN }));

const Header = definition({
  id: "Test/Header",
  persist: true,
  states: ["SHOWN"],
  events: {},
  memory: { seen: Flow.initial(Schema.Number, 0) },
  context: {
    first: Feed.Provider.select(Schema.Option(Schema.String), (f) =>
      Option.fromUndefinedOr(f.memory.items[0]),
    ),
    last: Feed.Provider.select(Schema.UndefinedOr(Schema.String), (f) => f.memory.items.at(-1)),
    count: Feed.Provider.select(Schema.Number, (f) => f.memory.items.length),
  },
});

const HeaderMachine = machine(Header, ({ S }) => ({ default: S.SHOWN }));

// A slot whose Schema's check throws for the word "boom": its decode at the boot throws.
const Loud = Schema.String.check(
  Schema.makeFilter((word: string) => {
    // oxlint-disable-next-line lint-bomb/no-throw-in-core -- a user's check that throws: the defect the boot must quarantine
    if (word === "boom") throw new Error("boom");

    return true;
  }),
);

const Shout = definition({
  id: "Test/Shout",
  persist: true,
  states: ["SHOWN"],
  events: {},
  internalEvents: { Heard: {} },
  memory: { heard: Flow.initial(Schema.Number, 0) },
  context: { word: Feed.Provider.select(Loud, (f) => f.memory.items[0] ?? "") },
});

const ShoutMachine = machine(Shout, ({ S, E }) => ({
  default: S.SHOWN,
  onContext: [
    { select: ({ context, memory }) => `${context.word}${memory.heard}`, event: E.Heard },
  ],
  on: { Heard: { updateMemory: ({ memory }) => ({ heard: memory.heard + 1 }) } },
}));

const machines = new Map([
  [FeedMachine.compiled.id, FeedMachine.compiled],
  [HeaderMachine.compiled.id, HeaderMachine.compiled],
  [ShoutMachine.compiled.id, ShoutMachine.compiled],
]);

const shout = (seen: string, reactions: string) =>
  '{"context":{"word":{"machine":"Test/Feed","name":"f"}},"format":2,"graph":{},' +
  `"machine":"Test/Shout","memory":{"heard":0},"name":"s","reactions":${reactions},` +
  `"schedules":[],"seen":${seen},"state":"SHOWN"}`;

const key = "actor/Test/Header/h";

const formatOne = (seen: string) =>
  '{"context":{"first":{"machine":"Test/Feed","name":"f"}},"format":1,"machine":"Test/Header",' +
  `"memory":{"seen":0},"name":"h","schedules":[],"seen":${seen},"state":"SHOWN"}`;

describe("the format-1 step (Restore R5, T6)", () => {
  it("Restore R5, T6: every saved form reads back through its slot's Schema: an Option none and an undefined stay selected, not never selected", () => {
    const restored = decodeRecords(
      machines,
      new Map([
        [
          key,
          formatOne(
            '{"count":{"value":0,"~":"json"},"first":{"~":"none"},"last":{"~":"undefined"}}',
          ),
        ],
      ]),
    );

    const seen = restored.records[0]?.seen;

    expect(restored.quarantined).toEqual([]);
    expect(seen?.get("first")?.value).toEqual(Option.none());
    expect(seen?.has("last")).toBe(true);
    expect(seen?.get("count")?.value).toBe(0);
  });

  it("Restore R5, T6: a saved value its slot's Schema refuses steps to a slot never selected, and the record still restores", () => {
    const restored = decodeRecords(
      machines,
      new Map([[key, formatOne('{"count":{"value":"many","~":"json"}}')]]),
    );

    expect(restored.quarantined).toEqual([]);
    expect(restored.records[0]?.seen.has("count")).toBe(false);
  });

  it("Restore R5: a form no release wrote, `__proto__` among them, quarantines the record and never throws", () => {
    for (const form of ['{"~":"__proto__"}', '{"~":"constructor"}', '{"~":"some"}', "[]"]) {
      const restored = decodeRecords(machines, new Map([[key, formatOne(`{"first":${form}}`)]]));

      expect(restored.quarantined.map((q) => q.key)).toEqual([key]);
    }
  });
});

describe("format 2 records at the boot (Restore R5)", () => {
  it("Restore R5: a slot Schema whose decode throws quarantines the record, and the boot goes on", () => {
    const restored = decodeRecords(
      machines,
      new Map([["actor/Test/Shout/s", shout('{"word":"boom"}', "[null]")]]),
    );

    expect(restored.quarantined.map((q) => q.key)).toEqual(["actor/Test/Shout/s"]);
  });

  it("Restore R5: saved baselines that do not match the machine's reactions in number are read from the record's own slots and memory", () => {
    const restored = decodeRecords(
      machines,
      new Map([["actor/Test/Shout/s", shout('{"word":"hi"}', "[null,null]")]]),
    );

    expect(restored.quarantined).toEqual([]);
    expect(restored.records[0]?.frames.map(Option.isSome)).toEqual([true]);
  });

  it("Restore R5: the format-2 step keeps each baseline's own memory copy, now a shared one it names", () => {
    const two =
      '{"context":{"word":{"machine":"Test/Feed","name":"f"}},"format":2,"graph":{},' +
      '"machine":"Test/Shout","memory":{"heard":0},"name":"s",' +
      '"reactions":[{"memory":{"heard":7},"slots":{}}],"schedules":[],"seen":{"word":"hi"},' +
      '"state":"SHOWN"}';

    const restored = decodeRecords(machines, new Map([["actor/Test/Shout/s", two]]));
    const frame = restored.records[0]?.frames[0];

    expect(restored.quarantined).toEqual([]);
    expect(frame?.pipe(Option.map((f) => f.memory.get("heard")))).toEqual(Option.some(7));
  });
});

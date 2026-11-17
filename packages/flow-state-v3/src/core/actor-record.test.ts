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

const machines = new Map([
  [FeedMachine.compiled.id, FeedMachine.compiled],
  [HeaderMachine.compiled.id, HeaderMachine.compiled],
]);

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

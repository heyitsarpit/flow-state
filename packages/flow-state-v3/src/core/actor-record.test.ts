import { Option, Result, Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { definition } from "../definition.ts";
import { Flow } from "../flow.ts";
import { machine } from "../machine.ts";
import { encodeActor } from "./actor-record.ts";
import { decodeRecords } from "./record.ts";
import { FORMAT } from "./record-format.ts";

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
    first: Flow.context(Schema.Option(Schema.String), {
      reads: { items: Feed.M.items },
      select: ({ items }) => Option.fromUndefinedOr(items[0]),
    }),
    last: Flow.context(Schema.UndefinedOr(Schema.String), {
      reads: { items: Feed.M.items },
      select: ({ items }) => items.at(-1),
    }),
    count: Flow.context(Schema.Number, {
      reads: { items: Feed.M.items },
      select: ({ items }) => items.length,
    }),
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
  context: {
    word: Flow.context(Loud, {
      reads: { items: Feed.M.items },
      select: ({ items }) => items[0] ?? "",
    }),
  },
});

const ShoutMachine = machine(Shout, ({ S, E, C }) => ({
  default: S.SHOWN,
  onContext: [C.word.change({ event: E.Heard })],
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

type Baselines = ReadonlyArray<Option.Option<{ readonly value: unknown }>>;

// Each restored baseline's value, undefined for one with none; nothing when no record restored.
const valuesOf = (records: ReadonlyArray<{ readonly baselines: Baselines }>) =>
  records.flatMap((r) =>
    r.baselines.map((b) => Option.getOrUndefined(Option.map(b, (x) => x.value))),
  );

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

  it("Restore R5: saved baselines that do not match the machine's reactions in number are their slots' last values", () => {
    const restored = decodeRecords(
      machines,
      new Map([["actor/Test/Shout/s", shout('{"word":"hi"}', "[null,null]")]]),
    );

    expect(restored.quarantined).toEqual([]);
    expect(valuesOf(restored.records)).toEqual(["hi"]);
  });

  it("Restore R5: the format-2 step goes on through format 3's: a baseline keeps its own value of its slot, and the memory it read is dropped", () => {
    const two =
      '{"context":{"word":{"machine":"Test/Feed","name":"f"}},"format":2,"graph":{},' +
      '"machine":"Test/Shout","memory":{"heard":0},"name":"s",' +
      '"reactions":[{"memory":{"heard":7},"slots":{"word":{"value":"ho"}}}],"schedules":[],' +
      '"seen":{"word":"hi"},"state":"SHOWN"}';

    const restored = decodeRecords(machines, new Map([["actor/Test/Shout/s", two]]));

    expect(restored.quarantined).toEqual([]);
    expect(valuesOf(restored.records)).toEqual(["ho"]);
  });
});

const Watch = definition({
  id: "Test/Watch",
  persist: true,
  states: ["SHOWN"],
  events: {},
  internalEvents: { Heard: {} },
  memory: { heard: Flow.initial(Schema.Number, 0) },
  context: {
    count: Flow.context(Schema.Number, {
      reads: { items: Feed.M.items },
      select: ({ items }) => items.length,
    }),
  },
});

const WatchMachine = machine(Watch, ({ S, E, C }) => ({
  default: S.SHOWN,
  onContext: [C.count.change({ event: E.Heard })],
  on: { Heard: { updateMemory: ({ memory }) => ({ heard: memory.heard + 1 }) } },
}));

const watchMachines = new Map([...machines, [WatchMachine.compiled.id, WatchMachine.compiled]]);

// A format-3 record of the watch: its one reaction's frame as given, its slot last seen at 2.
const formatThree = (frame: string) =>
  '{"context":{"count":{"machine":"Test/Feed","name":"f"}},"format":3,"graph":{},' +
  '"machine":"Test/Watch","memories":[{"heard":5}],"memory":{"heard":0},"name":"w",' +
  `"reactions":[${frame}],"schedules":[],"seen":{"count":2},"state":"SHOWN"}`;

const restoredWatch = (frame: string) =>
  decodeRecords(watchMachines, new Map([["actor/Test/Watch/w", formatThree(frame)]]));

describe("a reaction's baseline is its slot's value (Actors R18, Turn R22, Restore R5)", () => {
  it("Restore R5, Actors R18, Turn R17: the record format is 5, which saves each reaction's baseline as its slot's value only and each schedule's timers", () => {
    expect(FORMAT).toBe(5);
  });

  it("Restore R5, Actors R18: the format-3 step reads a reaction's baseline from its frame's value of the reaction's slot, so a kept baseline is neither lost nor made up", () => {
    const restored = restoredWatch('{"memory":0,"slots":{"count":{"value":1}}}');

    expect(restored.quarantined).toEqual([]);
    expect(valuesOf(restored.records)).toEqual([1]);
  });

  it("Restore R5: a format-3 frame that saved no value of the reaction's slot reads the slot's last value; a frame of a slot never selected reads none; no frame reads none", () => {
    expect(valuesOf(restoredWatch('{"memory":null,"slots":{}}').records)).toEqual([2]);
    expect(
      restoredWatch('{"memory":null,"slots":{"count":{}}}').records[0]?.baselines.map(
        Option.isSome,
      ),
    ).toEqual([false]);
    expect(restoredWatch("null").records[0]?.baselines.map(Option.isSome)).toEqual([false]);
  });
});

describe("format 4 saves a reaction's baseline only where it differs from its slot (Restore R5, Actors R18)", () => {
  // A format-4 record of the watch whose one reaction saved the baseline given, its slot last seen
  // at 2.
  const formatFour = (baselines: string) =>
    `{"baselines":${baselines},"context":{"count":{"machine":"Test/Feed","name":"f"}},"format":4,` +
    '"graph":{},"machine":"Test/Watch","memory":{"heard":0},"name":"w","schedules":[],' +
    '"seen":{"count":2},"state":"SHOWN"}';

  it("Restore R5, Actors R18: a slot whose baselines equal it is left out, a baseline that differs is saved under its slot and event by its value, and none as an empty object; each reads back and writes the same text in format 5", () => {
    for (const [baselines, value] of [
      ["{}", 2],
      ['{"count":{"Heard":{"value":1}}}', 1],
      ['{"count":{"Heard":{}}}', undefined],
    ] as const) {
      const text = formatFour(baselines);
      const restored = decodeRecords(watchMachines, new Map([["actor/Test/Watch/w", text]]));
      const record = restored.records[0];

      expect(valuesOf(restored.records)).toEqual([value]);
      expect(
        record === undefined ? Result.fail("none") : encodeActor(WatchMachine.compiled, record),
      ).toEqual(Result.succeed(text.replace('"format":4', '"format":5')));
    }
  });
});

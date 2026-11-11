import { Equal, Option, Predicate } from "effect";
import type { Json } from "../port.ts";
import { coveredBy, type Remainder } from "../coverage.ts";
import type { StaticCase } from "../dsl/static-case.ts";
import {
  type Admission,
  Built,
  type DataView,
  Default,
  Made,
  MemoryField,
  type Source,
  type Surface,
  Tamper,
} from "../surface.ts";

type Closure = "cb" | "label" | "commit" | "guard" | "effect";

const counted = () => {
  const calls = new Map<Closure, number>();

  return {
    tick: (closure: Closure) => calls.set(closure, (calls.get(closure) ?? 0) + 1),
    of: (closure: Closure) => calls.get(closure) ?? 0,
  };
};

type Calls = ReturnType<typeof counted>;

/**
 * S1: two states, one public and three internal events (one uncertain), three memory fields of
 * three sources, one keyed write, and a guarded handler; every closure counts its calls.
 */
const s1 = (calls: Calls, change: (s: Source) => Source = (s) => s) =>
  change({
    id: "Static/Inert",
    states: ["Idle", "Busy"],
    initial: "Idle",
    events: ["Go"],
    internalEvents: ["Done", "Failed", "Unsure"],
    uncertain: ["Unsure"],
    memory: {
      count: MemoryField.Initial({ value: 0, schemaDefault: Option.none() }),
      label: MemoryField.Computed({
        compute: (fields) => {
          calls.tick("label");

          return `n=${JSON.stringify(fields["count"])}`;
        },
      }),
      who: MemoryField.Input(),
    },
    operations: [
      {
        name: "save",
        input: ["id"],
        key: ["id"],
        success: "Done",
        failure: { NotSent: "Failed" },
        unknown: "Unsure",
        commit: () => {
          calls.tick("commit");
        },
      },
    ],
    on: {
      Go: {
        guard: Option.some(() => {
          calls.tick("guard");

          return true;
        }),
        target: Option.some("Busy"),
      },
      Done: { guard: Option.none(), target: Option.none() },
      Failed: { guard: Option.none(), target: Option.none() },
      Unsure: { guard: Option.none(), target: Option.none() },
    },
    onMachine: () => {
      calls.tick("cb");
    },
  });

const withCount = (count: MemoryField) => (s: Source) => ({
  ...s,
  memory: { ...s.memory, count },
});

const NONE: ReadonlyArray<string> = [];

const crash = (thrown: string) => [`crashed: ${thrown}`];

const codes = (built: Built) =>
  Built.$match(built, {
    Compiled: () => NONE,
    Refused: ({ codes: found }) => found,
    Crashed: ({ thrown }) => crash(thrown),
  });

const viewOf = (built: Built) =>
  Built.$match(built, {
    Compiled: ({ view }) => Option.some(view),
    Refused: () => Option.none<DataView>(),
    Crashed: () => Option.none<DataView>(),
  });

const compiled = (surface: Surface, source: Source) =>
  Built.$match(surface.construct(source), {
    Compiled: ({ compiled: c }) => c,
    Refused: ({ codes: found }) => {
      throw new Error(`${source.id} was refused (${found.join(", ")}); the case builds on it`);
    },
    Crashed: ({ thrown }) => {
      throw new Error(`${source.id} crashed at construction (${thrown}); the case builds on it`);
    },
  });

const outcome = (result: Admission | Made) =>
  result._tag === "Crashed" ? `Crashed: ${result.thrown}` : result._tag;

const refusedCodes = (result: Admission | Made) => {
  if (result._tag === "Refused") return result.codes;

  return result._tag === "Crashed" ? crash(result.thrown) : NONE;
};

const memoryOf = (made: Made) =>
  Made.$match(made, {
    Memory: ({ memory }) => Option.some(memory),
    Refused: () => Option.none<Json>(),
    Crashed: () => Option.none<Json>(),
  });

const withNumber = (s: Source) => ({
  ...s,
  memory: { ...s.memory, n: MemoryField.NumberInput() },
});

const withSelf = (s: Source) => ({ ...s, states: [...s.states, "self"] });

const functionsIn = (value: Json) => {
  const found: Array<string> = [];

  JSON.stringify(value, (key, v) => {
    if (Predicate.isFunction(v)) found.push(key);

    return v;
  });

  return found.length;
};

/**
 * Static cases for Compile's construction: inert, named, shaped as declared, refusing what R5,
 * R9 and R12 name, refused at Runtime creation when malformed (R17), creation by the input alone
 * (R6), restore without creation (R8), and one machine per id in an app (R15).
 *
 * **Details**
 *
 * A surface that crashes where a case expects a result or a refusal fails the expectation, with
 * the crash in its text: a crash is never a refusal (Conformance R9).
 */
export const constructionCases: ReadonlyArray<StaticCase> = [
  {
    id: "CMP-01",
    cites: ["Compile R1", "Compile I1", "Compile I6"],
    run: (surface, expect) => {
      const calls = counted();
      const built = surface.construct(s1(calls));

      expect("Compile R1", "S1 constructs", codes(built), []);
      expect("Compile I1", "the machine callback runs once", calls.of("cb"), 1);
      expect("Compile I6", "no computed initial runs at construction", calls.of("label"), 0);
      expect("Compile I1", "no commit runs at construction", calls.of("commit"), 0);
      expect("Compile R1", "no guard runs at construction", calls.of("guard"), 0);
    },
  },
  {
    id: "CMP-02",
    cites: ["Compile R3", "Compile R4", "Compile R16", "Compile I4"],
    run: (surface, expect) => {
      const view = viewOf(surface.construct(s1(counted())));

      const read = (f: (v: DataView) => ReadonlyArray<string>) =>
        Option.map(view, (v) => f(v).toSorted());

      expect(
        "Compile I4",
        "its states",
        read((v) => v.states),
        Option.some(["Busy", "Idle"]),
      );
      expect(
        "Compile I4",
        "its events, public and internal",
        read((v) => v.events),
        Option.some(["Done", "Failed", "Go", "Unsure"]),
      );
      expect(
        "Compile R16",
        "its Flow.uncertain events",
        read((v) => v.uncertain),
        Option.some(["Unsure"]),
      );
      expect(
        "Compile I4",
        "its operations",
        read((v) => v.operations),
        Option.some(["save"]),
      );
    },
  },
  {
    id: "CMP-03",
    cites: ["Compile R5", "Compile I5"],
    run: (surface, expect) => {
      const calls = counted();

      const count = MemoryField.Initial({
        value: 0,
        schemaDefault: Option.some(Default.Value({ value: 1 })),
      });

      const found = codes(surface.construct(s1(calls, withCount(count))));

      expect(
        "Compile I5",
        "Flow.initial beside a Schema default is TwoDefaults",
        found.includes("TwoDefaults"),
        true,
      );
    },
  },
  {
    id: "CMP-04",
    cites: ["Compile R5", "Compile I6"],
    run: (surface, expect) => {
      const calls = counted();

      const impure = Default.Effect({
        run: () => {
          calls.tick("effect");

          return 1;
        },
      });

      const count = MemoryField.Initial({ value: 0, schemaDefault: Option.some(impure) });
      const found = codes(surface.construct(s1(calls, withCount(count))));

      expect(
        "Compile I6",
        "a default that is an Effect to run is refused as ImpureDefault, not run",
        found.includes("ImpureDefault"),
        true,
      );
      expect("Compile I6", "the Effect is never run", calls.of("effect"), 0);
    },
  },
  {
    id: "CMP-05",
    cites: ["Compile R9", "Compile I11"],
    run: (surface, expect) => {
      const sure = (s: Source) => ({
        ...s,
        operations: s.operations.map((op) => ({ ...op, unknown: "Done" })),
      });

      const found = codes(surface.construct(s1(counted(), sure)));

      expect(
        "Compile I11",
        "unknown: onto an event not Flow.uncertain is UnknownNotUncertain",
        found.includes("UnknownNotUncertain"),
        true,
      );
    },
  },
  {
    id: "CMP-06",
    cites: ["Compile R17", "Compile I15", "Compile I16"],
    run: (surface, expect) => {
      const c = compiled(surface, s1(counted()));
      const admit = (tamper: Tamper) => outcome(surface.admit(c, tamper));

      expect(
        "Compile I15",
        "S1 as compiled holds only Slots, so Runtime creation admits it",
        admit(Tamper.Untouched()),
        "Admitted",
      );
      expect(
        "Compile I15",
        "a bare function in a Slot's place is refused",
        admit(Tamper.BareFunction()),
        "Refused",
      );
      expect(
        "Compile I16",
        "a key field outside the input is refused",
        admit(Tamper.KeyOutsideInput({ operation: "save", field: "nope" })),
        "Refused",
      );
      expect("Compile R17", "no events table is refused", admit(Tamper.NoEvents()), "Refused");
    },
  },
  {
    id: "CMP-07",
    cites: ["Compile R16", "Compile I15"],
    run: (surface, expect) => {
      const view = viewOf(surface.construct(s1(counted())));

      expect(
        "Compile I15",
        "the data view holds no function",
        Option.map(view, (v) => functionsIn(v.whole)),
        Option.some(0),
      );
      expect(
        "Compile R16",
        "a closure is named by its place under operations.save",
        Option.map(view, (v) =>
          v.slots.some((s) => s.split(".").slice(0, 2).join(".") === "operations.save"),
        ),
        Option.some(true),
      );
    },
  },
  {
    id: "CMP-08",
    cites: ["Compile R6", "Compile I7"],
    run: (surface, expect) => {
      const c = compiled(surface, s1(counted(), withNumber));
      const create = (input: Readonly<Record<string, Json>>) => surface.create(c, input);
      const expected = { count: 0, label: "n=0", who: "w", n: 3 };

      expect(
        "Compile I7",
        "an input given in its encoded form is refused, never decoded",
        outcome(create({ who: "w", n: "3" })),
        "Refused",
      );
      expect(
        "Compile I7",
        "an input given in its type form is stored unchanged",
        memoryOf(create({ who: "w", n: 3 })),
        Option.some<Json>(expected),
      );
      const first = memoryOf(create({ who: "w", n: 3 }));

      expect(
        "Compile I7",
        "equal inputs give equal memory",
        Option.exists(first, () => Equal.equals(first, memoryOf(create({ who: "w", n: 3 })))),
        true,
      );
    },
  },
  {
    id: "CMP-09",
    cites: ["Compile R8", "Compile I8"],
    run: (surface, expect) => {
      const c = compiled(surface, s1(counted()));

      expect(
        "Compile I8",
        "restore keeps the record's fields and runs no creation",
        memoryOf(surface.restore(c, { count: 5, who: "w" })),
        Option.some<Json>({ count: 5, who: "w", label: "n=5" }),
      );
      expect(
        "Compile R8",
        "a record lacking an input field with no default is refused",
        refusedCodes(surface.restore(c, { count: 5 })),
        ["RestoreMissingInput"],
      );
    },
  },
  {
    id: "CMP-10",
    cites: ["Compile R12", "Compile I13"],
    run: (surface, expect) => {
      const built = surface.construct(s1(counted(), withSelf));

      const found = Built.$match(built, {
        Compiled: ({ compiled: c }) => refusedCodes(surface.admit(c, Tamper.Untouched())),
        Refused: ({ codes: refused }) => refused,
        Crashed: ({ thrown }) => crash(thrown),
      });

      expect(
        "Compile I13",
        "a state named self is refused as ReservedStateName",
        found.includes("ReservedStateName"),
        true,
      );
    },
  },
  {
    id: "CMP-11",
    cites: ["Compile R15", "Compile I14"],
    run: (surface, expect) => {
      const one = compiled(surface, s1(counted()));
      const two = compiled(surface, s1(counted()));

      expect("Compile R15", "S1 alone is one app", outcome(surface.admitApp([one])), "Admitted");
      expect(
        "Compile I14",
        "two machines under one id are refused",
        outcome(surface.admitApp([one, two])),
        "Refused",
      );
    },
  },
];

/**
 * The Compile Invariants these cases judge, each with the cases whose expectations cite it.
 */
export const constructionCovered = coveredBy(constructionCases);

/**
 * The part of each case-covered Compile Invariant these cases do not judge, by the Task that owes
 * it.
 */
export const constructionRemainders: ReadonlyArray<Remainder> = [
  {
    invariant: "Compile I1",
    owner: "@task.V3.T17",
    owed: "spies on actors, timers, storage, loaders and evidence (T1); only a commit run is caught",
  },
  {
    invariant: "Compile I5",
    owner: "@task.V3.T17",
    owed: "Flow.input beside a default, and a field with no source; only Flow.initial beside a Schema default is judged",
  },
  {
    invariant: "Compile I15",
    owner: "@task.V3.T17",
    owed: "a bare function in an operation's or a handler's Slot place at Runtime creation; only the memory's creation Slot is tampered",
  },
  {
    invariant: "Compile I4",
    owner: "@task.V3.T17",
    owed: "fragment states, events and operations; only a root machine's tables are compared",
  },
  {
    invariant: "Compile I6",
    owner: "@task.V3.T17",
    owed: "a plain Schema default's evaluation: a surface source's plain default has no counter",
  },
  {
    invariant: "Compile I7",
    owner: "@task.V3.T17",
    owed: "no clock or randomness read at creation (needs spies on both)",
  },
  {
    invariant: "Compile I8",
    owner: "@task.V3.T11",
    owed: "adoption and hydration never invoke creation; only restore is judged",
  },
  {
    invariant: "Compile I11",
    owner: "@task.V3.T17",
    owed: "the Flow.ignore clause: a surface source cannot map unknown: to Flow.ignore",
  },
  {
    invariant: "Compile I13",
    owner: "@task.V3.T17",
    owed: "is, child, root and __proto__, at construction (round-14 refuses self at Runtime creation), path depth, length, control characters and code-unit equality",
  },
  {
    invariant: "Compile I14",
    owner: "@task.V3.T17",
    owed: "one machine under two keys and colliding operation, domain and entity ids",
  },
];

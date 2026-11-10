import { Option, Predicate } from "effect";
import type { Json } from "../port.ts";
import type { CaseCovered } from "../coverage.ts";
import type { StaticCase } from "../dsl/static-case.ts";
import {
  Admission,
  Built,
  type DataView,
  Default,
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

const codes = (built: Built) =>
  Built.$match(built, {
    Compiled: () => NONE,
    Refused: ({ codes: found }) => found,
  });

const viewOf = (built: Built) =>
  Built.$match(built, {
    Compiled: ({ view }) => Option.some(view),
    Refused: () => Option.none<DataView>(),
  });

const compiled = (surface: Surface, source: Source) =>
  Built.$match(surface.construct(source), {
    Compiled: ({ compiled: c }) => c,
    Refused: ({ codes: found }) => {
      throw new Error(`S1 was refused (${found.join(", ")}); every case below builds on it`);
    },
  });

const admitted = (admission: Admission) => Admission.$is("Admitted")(admission);

const functionsIn = (value: Json) => {
  const found: Array<string> = [];

  JSON.stringify(value, (key, v) => {
    if (Predicate.isFunction(v)) found.push(key);

    return v;
  });

  return found.length;
};

/**
 * Static cases for Compile's construction: inert, named, shaped as declared, refusing what R5
 * and R9 name, and refused at Runtime creation when malformed (R17).
 */
export const constructionCases: ReadonlyArray<StaticCase> = [
  {
    id: "CMP-01",
    cites: ["Compile R1", "Compile I1", "Compile I2", "Compile I6"],
    run: (surface, expect) => {
      const calls = counted();
      const built = surface.construct(s1(calls));

      expect("Compile R1", "S1 constructs", codes(built), []);
      expect("Compile I2", "the machine callback runs once", calls.of("cb"), 1);
      expect("Compile I6", "no computed initial runs at construction", calls.of("label"), 0);
      expect("Compile I1", "no commit runs at construction", calls.of("commit"), 0);
      expect("Compile I1", "no guard runs at construction", calls.of("guard"), 0);
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
      const admit = (tamper: Tamper) => admitted(surface.admit(c, tamper));

      expect("Compile R17", "S1 untouched is admitted", admit(Tamper.Untouched()), true);
      expect(
        "Compile I15",
        "a bare function in a Slot's place is refused",
        admit(Tamper.BareFunction()),
        false,
      );
      expect(
        "Compile I16",
        "a key field outside the input is refused",
        admit(Tamper.KeyOutsideInput({ operation: "save", field: "nope" })),
        false,
      );
      expect("Compile R17", "no events table is refused", admit(Tamper.NoEvents()), false);
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
];

/**
 * The Compile Invariants these cases judge, each with the cases whose expectations cite it.
 */
export const constructionCovered: ReadonlyArray<CaseCovered> = [
  { invariant: "Compile I1", cases: ["CMP-01"] },
  { invariant: "Compile I2", cases: ["CMP-01"] },
  { invariant: "Compile I4", cases: ["CMP-02"] },
  { invariant: "Compile I5", cases: ["CMP-03"] },
  { invariant: "Compile I6", cases: ["CMP-01", "CMP-04"] },
  { invariant: "Compile I11", cases: ["CMP-05"] },
  { invariant: "Compile I15", cases: ["CMP-06", "CMP-07"] },
  { invariant: "Compile I16", cases: ["CMP-06"] },
];

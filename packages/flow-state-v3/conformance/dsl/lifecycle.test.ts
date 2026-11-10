import assert from "node:assert/strict";
import { describe, it } from "@effect/vitest";
import { Equal } from "effect";
import { advance, cellOf, due } from "./lifecycle.ts";
import { type Model, type Move, Phase } from "./lifecycle-model.ts";
import {
  type Cell,
  type Deadline,
  type Deadlines,
  Outcome,
  type Promotion,
  type Rules,
  rules,
  type TableA,
} from "./lifecycle-rules.ts";
import type { Trace } from "./lifecycle-trace.ts";
import { traces } from "./lifecycle.traces.ts";
import type { InvariantId } from "./oracle.ts";

const run = (trace: Trace, given: Rules) =>
  trace.steps.reduce<{ model: Model; refusals: ReadonlyArray<ReadonlyArray<InvariantId>> }>(
    ({ model, refusals }, step) => {
      const [next, found] =
        "due" in step ? due(model, step.due, given) : advance(model, step, given);

      return { model: next, refusals: [...refusals, found.map((r) => r.invariant)] };
    },
    { model: trace.start, refusals: [] },
  );

const holds = (trace: Trace, given: Rules) => {
  const { model, refusals } = run(trace, given);
  const phases = Object.fromEntries(model.attempts.map((a) => [a.id, a.phase]));

  return (
    Equal.equals(JSON.stringify(refusals), JSON.stringify(trace.refusals)) &&
    Object.keys(phases).length === Object.keys(trace.phases).length &&
    Object.entries(trace.phases).every(([id, phase]) => Equal.equals(phases[id], phase)) &&
    model.obligations.length === trace.owed
  );
};

const killed = (given: Rules) => traces.some((trace) => !holds(trace, given));

const phases = [
  Phase.Queued(),
  Phase.Unsent(),
  Phase.Resending(),
  Phase.OnWire(),
  Phase.Interrupted(),
  Phase.Held(),
  Phase.Restoring({ head: true }),
  Phase.Restoring({ head: false }),
  Phase.Gone({ why: "closed" }),
  Phase.Gone({ why: "evidence" }),
  Phase.Gone({ why: "settledInDisposal" }),
];

const invariants: ReadonlyArray<InvariantId> = [
  "WriteLanes I1",
  "WriteLanes I8",
  "WriteLanes I11",
  "WriteLanes I12",
  "WriteLanes I15",
  "WriteLanes I16",
  "WriteLanes I20",
  "WriteLanes I21",
  "Actors I29",
  "Actors I35",
  "Actors I36",
];

const outcomes = [
  Outcome.Stay(),
  ...phases.map((to) => Outcome.Move({ to })),
  ...invariants.map((invariant) => Outcome.Refuse({ invariant })),
];

const key = (row: string, phase: string, guard: string) => `${row}/${phase}/${guard}`;

const cellsAt = (model: Model, step: Move) => {
  const named = "attempt" in step ? [step.attempt] : model.attempts.map((a) => a.id);

  return model.attempts
    .filter((a) => named.includes(a.id))
    .map((life) => {
      const cell = cellOf(model, life, step);

      return [key(cell.row, cell.phase, cell.guard), life.phase] as const;
    });
};

const reached = () => {
  const seen = new Map<string, ReadonlyArray<Phase>>();

  for (const trace of traces) {
    let model = trace.start;

    for (const step of trace.steps) {
      if ("due" in step) {
        model = due(model, step.due)[0];
        continue;
      }

      for (const [at, phase] of cellsAt(model, step))
        seen.set(at, [...(seen.get(at) ?? []), phase]);
      model = advance(model, step)[0];
    }
  }

  return seen;
};

const identity = (original: Outcome, alternative: Outcome, from: ReadonlyArray<Phase>) => {
  const target = Outcome.$is("Move")(original) ? original : alternative;
  const other = target === original ? alternative : original;

  return (
    Outcome.$is("Move")(target) &&
    Outcome.$is("Stay")(other) &&
    from.every((phase) => Equal.equals(phase, target.to))
  );
};

const withCell = (row: keyof TableA, phase: string, guard: string, outcome: Outcome) => {
  const cells: Readonly<Record<string, Cell>> = rules.tableA[row];

  return {
    ...rules,
    tableA: {
      ...rules.tableA,
      [row]: { ...cells, [phase]: { ...cells[phase], [guard]: outcome } },
    },
  };
};

describe("The lane lifecycle (Table A, deadlines, promotion)", () => {
  it("every trace holds on the design's rules", () => {
    for (const trace of traces) assert.ok(holds(trace, rules), `${trace.name} (${trace.cites})`);
  });

  it("every cell at every guard value is reached by a trace", () => {
    const seen = reached();

    const missed = Object.entries(rules.tableA).flatMap(([row, byPhase]) =>
      Object.entries(byPhase).flatMap(([phase, cell]) =>
        Object.keys(cell)
          .map((guard) => key(row, phase, guard))
          .filter((at) => !seen.has(at)),
      ),
    );

    assert.deepEqual(missed, []);
  });

  it("every other outcome of every cell is killed by a trace", () => {
    const seen = reached();

    const survivors = Object.entries(rules.tableA).flatMap(([row, byPhase]) =>
      Object.entries(byPhase).flatMap(([phase, cell]) =>
        Object.entries(cell).flatMap(([guard, original]) =>
          outcomes
            .filter((alternative) => !Equal.equals(alternative, original))
            .filter(
              (alternative) =>
                !identity(original, alternative, seen.get(key(row, phase, guard)) ?? []),
            )
            .filter(
              (alternative) =>
                // SAFETY: `row` is a key of Table A, read from its own entries.
                // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Object.entries widens a record's keys to string
                !killed(withCell(row as keyof TableA, phase, guard, alternative)),
            )
            .map((alternative) => `${key(row, phase, guard)} -> ${JSON.stringify(alternative)}`),
        ),
      ),
    );

    assert.deepEqual(survivors, []);
  });

  it("every other deadline and Invariant of every obligation is killed by a trace", () => {
    const instants: ReadonlyArray<Deadline["by"]> = ["TurnCloses", "StepEnds", "never"];

    const named: ReadonlyArray<InvariantId> = [
      "WriteLanes I8",
      "WriteLanes I12",
      "WriteLanes I15",
      "WriteLanes I20",
      "WriteLanes I21",
      "Restore I6",
      "Actors I29",
      "Actors I32",
    ];

    const entries: ReadonlyArray<readonly [string, Deadline, (d: Deadline) => Deadlines]> = [
      ...(["Released", "Superseded", "NotSentCancelled"] as const).map(
        (report) =>
          [
            `Await ${report}`,
            rules.deadlines.Await[report],
            (d: Deadline) => ({
              ...rules.deadlines,
              Await: { ...rules.deadlines.Await, [report]: d },
            }),
          ] as const,
      ),
      [
        "PendingCancel",
        rules.deadlines.PendingCancel,
        (d: Deadline) => ({ ...rules.deadlines, PendingCancel: d }),
      ],
      ...(["plain", "runtimeDisposal", "disposeActor", "forget"] as const).map(
        (cause) =>
          [
            `AwaitRestore ${cause}`,
            rules.deadlines.AwaitRestore[cause],
            (d: Deadline) => ({
              ...rules.deadlines,
              AwaitRestore: { ...rules.deadlines.AwaitRestore, [cause]: d },
            }),
          ] as const,
      ),
      [
        "AwaitLetGo",
        rules.deadlines.AwaitLetGo,
        (d: Deadline) => ({ ...rules.deadlines, AwaitLetGo: d }),
      ],
    ];

    const survivors = entries.flatMap(([name, deadline, replaced]) => [
      ...instants
        .filter((by) => by !== deadline.by)
        .filter((by) => !killed({ ...rules, deadlines: replaced({ ...deadline, by }) }))
        .map((by) => `${name} by ${by}`),
      ...named
        .filter((invariant) => invariant !== deadline.invariant && deadline.by !== "never")
        .filter(
          (invariant) => !killed({ ...rules, deadlines: replaced({ ...deadline, invariant }) }),
        )
        .map((invariant) => `${name} as ${invariant}`),
    ]);

    assert.deepEqual(survivors, []);
  });

  it("every other promotion rule is killed by a trace", () => {
    const others: ReadonlyArray<Promotion> = ["never", "first", "second"];

    assert.deepEqual(
      others.filter((promotion) => !killed({ ...rules, promotion })),
      [],
    );
  });
});

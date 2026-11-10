import assert from "node:assert/strict";
import { describe, it } from "vite-plus/test";
import { Equal } from "effect";
import { cellOf, due } from "./lifecycle.ts";
import { apply } from "./lifecycle-fold.ts";
import { type Input, Life, type Model, type Move, Phase } from "./lifecycle-model.ts";
import {
  Act,
  type Cell,
  Fate,
  type TableC,
  type HeadRow,
  type Deadline,
  type Deadlines,
  Outcome,
  type Promotion,
  type Rules,
  rules,
  type TableA,
} from "./lifecycle-rules.ts";
import { Check, type Trace } from "./lifecycle-trace.ts";
import { traces } from "./lifecycle.traces.ts";
import type { InvariantId } from "./oracle.ts";

const run = (trace: Trace, given: Rules) =>
  trace.steps.reduce<{ model: Model; refusals: ReadonlyArray<ReadonlyArray<InvariantId>> }>(
    ({ model, refusals }, step) => {
      const [next, found] = "due" in step ? due(model, step.due, given) : apply(model, step, given);

      return { model: next, refusals: [...refusals, found.map((r) => r.invariant)] };
    },
    { model: trace.start, refusals: [] },
  );

const holds = (trace: Trace, given: Rules) => {
  const { model, refusals } = run(trace, given);
  const phases = Object.fromEntries(model.attempts.map((a) => [a.id, a.phase]));

  const same = <A>(got: ReadonlyArray<A>, want: ReadonlyArray<A>) =>
    got.length === want.length && got.every((value, i) => Equal.equals(value, want[i]));

  const marked = trace.checks.find(Check.$is("Marked"))?.count ?? trace.start.releasing.length;

  return (
    Equal.equals(JSON.stringify(refusals), JSON.stringify(trace.refusals)) &&
    Object.keys(phases).length === Object.keys(trace.phases).length &&
    Object.entries(trace.phases).every(([id, phase]) => Equal.equals(phases[id], phase)) &&
    model.obligations.length === trace.owed &&
    model.releasing.length === marked &&
    trace.checks.every((check) =>
      Check.$match(check, {
        Owing: ({ obligations }) => same(model.obligations, obligations),
        Lives: ({ lives }) =>
          same(
            model.endings.map((e) => e.life),
            lives,
          ),
        Marked: () => true,
      }),
    )
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

const ATTEMPT_MOVES: ReadonlyArray<string> = [
  "Send",
  "End",
  "Evidence",
  "Reload",
  "BootSettles",
  "DisposalStarts",
  "RuntimeDisposed",
  "StepEnds",
];

// RETURN_TYPE: a type predicate narrows a trace step to Table A's moves.
const isAttemptMove = (step: Input): step is Move => ATTEMPT_MOVES.includes(step._tag);

const reachedIn = (trace: Trace, seen: Map<string, ReadonlyArray<Phase>>) => {
  let model = trace.start;

  for (const step of trace.steps) {
    if ("due" in step) {
      model = due(model, step.due)[0];
      continue;
    }

    if (isAttemptMove(step))
      for (const [at, phase] of cellsAt(model, step))
        seen.set(at, [...(seen.get(at) ?? []), phase]);
    model = apply(model, step)[0];
  }
};

const reached = () => {
  const seen = new Map<string, ReadonlyArray<Phase>>();

  for (const trace of traces) reachedIn(trace, seen);

  return seen;
};

const identity = (original: Outcome, alternative: Outcome, from: ReadonlyArray<Phase>) => {
  const target = Outcome.$is("Move")(original) ? original : alternative;
  const other = target === original ? alternative : original;

  return (
    Outcome.$is("Move")(target) &&
    Outcome.$is("Stay")(other) &&
    from.length > 0 &&
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
      ["Commit", rules.deadlines.Commit, (d: Deadline) => ({ ...rules.deadlines, Commit: d })],
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

  it("every other action of every Table B cell is killed by a trace", () => {
    const acts = [
      ...(
        [
          "Mint",
          "Decline",
          "Queue",
          "SupersedeHead",
          "SupersedeQueued",
          "Replace",
          "ReplaceCancelled",
        ] as const
      ).map((admit) => Act.Admit({ admit })),
      Act.Stay(),
      Act.Quiet({ invariant: "WriteLanes I20" }),
      Act.Quiet({ invariant: "WriteLanes I21" }),
      Act.LetGo(),
      Act.Resend(),
      Act.PendingCancel(),
      Act.AwaitRelease(),
      Act.Interrupt(),
      ...(["Stay", "PendingCancel", "AwaitRelease", "Interrupt"] as const).map((head) =>
        Act.CancelAll({ head }),
      ),
      Act.Mark(),
    ];

    const needsHead = (a: Act) =>
      ["Resend", "PendingCancel", "AwaitRelease", "Interrupt"].includes(a._tag) ||
      (Act.$is("CancelAll")(a) && a.head !== "Stay") ||
      (Act.$is("Admit")(a) && ["Replace", "ReplaceCancelled"].includes(a.admit));

    const movesHeadWhereItIs = (row: string, a: Act) =>
      (row === "Resending" && Act.$is("Resend")(a)) ||
      (row === "Interrupted" &&
        (Act.$is("Interrupt")(a) || (Act.$is("CancelAll")(a) && a.head === "Interrupt")));

    const survivors = Object.entries(rules.tableB).flatMap(([row, byColumn]) =>
      Object.entries(byColumn).flatMap(([column, cell]) =>
        Object.entries(cell).flatMap(([guard, original]) =>
          acts
            .filter((alternative) => !Equal.equals(alternative, original))
            .filter((alternative) => row !== "Idle" || !needsHead(alternative))
            .filter((alternative) => !movesHeadWhereItIs(row, alternative))
            .filter((alternative) => {
              const cells: Readonly<Record<string, Readonly<Record<string, Act>>>> =
                // SAFETY: `row` is a key of Table B, read from its own entries.
                // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Object.entries widens a record's keys to string
                rules.tableB[row as HeadRow];

              const tableB = {
                ...rules.tableB,
                [row]: { ...cells, [column]: { ...cells[column], [guard]: alternative } },
              };

              return !killed({ ...rules, tableB });
            })
            .map((alternative) => `${row}/${column}/${guard} -> ${JSON.stringify(alternative)}`),
        ),
      ),
    );

    assert.deepEqual(survivors, []);
  });

  it("every other fate of every Table C cell is killed by a trace", () => {
    const allLives = [
      Life.Owed(),
      Life.Parked(),
      Life.Delivering({ retry: false }),
      Life.Delivering({ retry: true }),
      Life.Refused(),
      Life.Kept(),
      Life.KeptOpen(),
      Life.Evidence(),
      Life.Closed(),
    ];

    const fates = [
      Fate.Stay(),
      ...allLives.map((to) => Fate.Live({ to })),
      Fate.Refuse({ invariant: "WriteLanes I15" }),
      Fate.Refuse({ invariant: "Actors I24" }),
    ];

    const same = (life: string, original: Fate, alternative: Fate) => {
      const moved = [original, alternative].find(Fate.$is("Live"));
      const stays = [original, alternative].some(Fate.$is("Stay"));

      return stays && moved !== undefined && moved.to._tag === life;
    };

    const survivors = Object.entries(rules.tableC).flatMap(([row, byLife]) =>
      Object.entries(byLife).flatMap(([life, cell]) =>
        Object.entries(cell).flatMap(([guard, original]) =>
          fates
            .filter((alternative) => !Equal.equals(alternative, original))
            .filter((alternative) => !same(life, original, alternative))
            .filter((alternative) => {
              const cells: Readonly<Record<string, Readonly<Record<string, Fate>>>> =
                // SAFETY: `row` is a key of Table C, read from its own entries.
                // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Object.entries widens a record's keys to string
                rules.tableC[row as keyof TableC];

              const tableC = {
                ...rules.tableC,
                [row]: { ...cells, [life]: { ...cells[life], [guard]: alternative } },
              };

              return !killed({ ...rules, tableC });
            })
            .map((alternative) => `${row}/${life}/${guard} -> ${JSON.stringify(alternative)}`),
        ),
      ),
    );

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

import assert from "node:assert/strict";
import { describe, it } from "vite-plus/test";
import { Equal, Formatter, Predicate } from "effect";
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
import type { Trace } from "./lifecycle-trace.ts";
import { pendingTraces } from "./lifecycle-actor-lives.traces.ts";
import { traces } from "./lifecycle.traces.ts";
import { holds } from "./trace-judge.ts";
import type { InvariantId } from "./facts.ts";
import { disposal } from "../actors/disposal.ts";
import { attemptIdentity } from "../write-lanes/attempt-identity.ts";
import { deliveredOnce } from "../write-lanes/delivered-once.ts";
import { laneQueue } from "../write-lanes/lane-queue.ts";

const killed = (given: Rules) => traces.some((trace) => !holds(trace, given));

type Mutant = { readonly name: string; readonly rules: Rules };

const survivors = (mutants: ReadonlyArray<Mutant>) =>
  mutants.filter((m) => !killed(m.rules)).map((m) => m.name);

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
  "Retired WriteLanes I21",
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

const tableAMutants = (seen: ReadonlyMap<string, ReadonlyArray<Phase>>) =>
  Object.entries(rules.tableA).flatMap(([row, byPhase]) =>
    Object.entries(byPhase).flatMap(([phase, cell]) =>
      Object.entries(cell).flatMap(([guard, original]) =>
        outcomes
          .filter((alternative) => !Equal.equals(alternative, original))
          .filter(
            (alternative) =>
              !identity(original, alternative, seen.get(key(row, phase, guard)) ?? []),
          )
          .map((alternative) => ({
            name: `${key(row, phase, guard)} -> ${Formatter.format(alternative)}`,
            // SAFETY: `row` is a key of Table A, read from its own entries.
            // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Object.entries widens a record's keys to string
            rules: withCell(row as keyof TableA, phase, guard, alternative),
          })),
      ),
    ),
  );

const instants: ReadonlyArray<Deadline["by"]> = ["TurnCloses", "StepEnds", "never"];

const deadlineInvariants: ReadonlyArray<InvariantId> = [
  "WriteLanes I8",
  "WriteLanes I12",
  "WriteLanes I15",
  "WriteLanes I20",
  "Retired WriteLanes I21",
  "Restore I6",
  "Actors I29",
  "Actors I32",
];

const deadlineEntries: ReadonlyArray<readonly [string, Deadline, (d: Deadline) => Deadlines]> = [
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
  ...Object.entries(rules.deadlines.AwaitRestore).map(
    ([cause, deadline]) =>
      [
        `AwaitRestore ${cause}`,
        deadline,
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

const deadlineMutants = () =>
  deadlineEntries.flatMap(([name, deadline, replaced]) => [
    ...instants
      .filter((by) => by !== deadline.by)
      .map((by) => ({
        name: `${name} by ${by}`,
        rules: { ...rules, deadlines: replaced({ ...deadline, by }) },
      })),
    ...deadlineInvariants
      .filter((invariant) => invariant !== deadline.invariant && deadline.by !== "never")
      .map((invariant) => ({
        name: `${name} as ${invariant}`,
        rules: { ...rules, deadlines: replaced({ ...deadline, invariant }) },
      })),
  ]);

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
  Act.Quiet({ invariant: "Retired WriteLanes I21" }),
  Act.LetGo(),
  Act.Resend(),
  Act.PendingCancel(),
  Act.AwaitRelease(),
  Act.ReleaseHead(),
  Act.Interrupt(),
  ...(["Stay", "PendingCancel", "AwaitRelease", "Interrupt"] as const).map((head) =>
    Act.CancelAll({ head }),
  ),
  Act.Mark(),
];

const needsHead = (a: Act) =>
  ["Resend", "PendingCancel", "AwaitRelease", "ReleaseHead", "Interrupt"].includes(a._tag) ||
  (Act.$is("CancelAll")(a) && a.head !== "Stay") ||
  (Act.$is("Admit")(a) && ["Replace", "ReplaceCancelled"].includes(a.admit));

const movesHeadWhereItIs = (row: string, a: Act) =>
  (row === "Resending" && Act.$is("Resend")(a)) ||
  (row === "Interrupted" &&
    (Act.$is("Interrupt")(a) || (Act.$is("CancelAll")(a) && a.head === "Interrupt")));

const tableBMutants = () =>
  Object.entries(rules.tableB).flatMap(([row, byColumn]) =>
    Object.entries(byColumn).flatMap(([column, cell]) =>
      Object.entries(cell).flatMap(([guard, original]) =>
        acts
          .filter((alternative) => !Equal.equals(alternative, original))
          .filter((alternative) => row !== "Idle" || !needsHead(alternative))
          .filter((alternative) => !movesHeadWhereItIs(row, alternative))
          .map((alternative) => {
            const cells: Readonly<Record<string, Readonly<Record<string, Act>>>> =
              // SAFETY: `row` is a key of Table B, read from its own entries.
              // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Object.entries widens a record's keys to string
              rules.tableB[row as HeadRow];

            const tableB = {
              ...rules.tableB,
              [row]: { ...cells, [column]: { ...cells[column], [guard]: alternative } },
            };

            return {
              name: `${row}/${column}/${guard} -> ${Formatter.format(alternative)}`,
              rules: { ...rules, tableB },
            };
          }),
      ),
    ),
  );

const allLives = [
  Life.Owed(),
  Life.Parked(),
  Life.ParkedOpen(),
  Life.Delivering({ retry: false }),
  Life.Delivering({ retry: true }),
  Life.Refused(),
  Life.Kept(),
  Life.KeptOpen(),
  Life.Evidence(),
  Life.Closed(),
  Life.Maybe(),
];

const fates = [
  Fate.Stay(),
  ...allLives.map((to) => Fate.Live({ to })),
  Fate.Refuse({ invariant: "WriteLanes I15" }),
  Fate.Refuse({ invariant: "Actors I24" }),
];

const sameFate = (life: string, original: Fate, alternative: Fate) => {
  const moved = [original, alternative].find(Fate.$is("Live"));
  const stays = [original, alternative].some(Fate.$is("Stay"));

  return stays && moved !== undefined && moved.to._tag === life;
};

const tableCMutants = () =>
  Object.entries(rules.tableC).flatMap(([row, byLife]) =>
    Object.entries(byLife).flatMap(([life, cell]) =>
      Object.entries(cell).flatMap(([guard, original]) =>
        fates
          .filter((alternative) => !Equal.equals(alternative, original))
          .filter((alternative) => !sameFate(life, original, alternative))
          .map((alternative) => {
            const cells: Readonly<Record<string, Readonly<Record<string, Fate>>>> =
              // SAFETY: `row` is a key of Table C, read from its own entries.
              // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Object.entries widens a record's keys to string
              rules.tableC[row as keyof TableC];

            const tableC = {
              ...rules.tableC,
              [row]: { ...cells, [life]: { ...cells[life], [guard]: alternative } },
            };

            return {
              name: `${row}/${life}/${guard} -> ${Formatter.format(alternative)}`,
              rules: { ...rules, tableC },
            };
          }),
      ),
    ),
  );

const promotionMutants = () =>
  (["never", "first", "second"] as const)
    .filter((promotion: Promotion) => promotion !== rules.promotion)
    .map((promotion) => ({ name: `promotion ${promotion}`, rules: { ...rules, promotion } }));

const rulingOf = (trace: Trace) => /\(ruling [^)]+\)/u.exec(trace.cites)?.[0];

const HELD: ReadonlyArray<string> = [
  "the call on the wire succeeds and the next commit is promoted",
  "an unknown that is not retained owes its release",
  "a forgotten identity's restore ending: decided at the boot, delivered at adoption",
  "a releasing lane's Held head is released",
  "a reload after the Runtime's disposal",
  "promotion takes the first waiting commit in mint order",
  "an unretained unknown's release is due by the close of the turn that hears it",
  "an unretained unknown's release is not due at a turn that does not hear it",
  "an unretained unknown heard by no turn owes its release by the step's end",
  "an unretained unknown's release is owed by its own ending's turn, not the Attempt's other ending",
  "an unretained unknown whose ending closes unheard owes its release at once",
  "an unretained unknown not yet heard owes nothing at the step's end",
  "an unretained unknown released in its turn",
  "a replaced Attempt's second ending",
  "a pending cancel's ending of the other kind",
  "an unretained unknown Disposed during disposal holds its lane",
  "an acknowledged head never sent owes its restore from the reload",
  "an acknowledged head never sent is restored to Held and still owes its delivery",
  "an acknowledged head never sent meets its restore once it is delivered",
  "a head whose acknowledgement never landed owes no restore",
  "a retry re-sends a Held head",
  "a commit whose key did not encode declines Unencodable",
  "an Unencodable decline of an input the fixture says encodes is refused",
  "a key-less cancel of an operation with no lane declines nothing",
  "a second cancel of a never-sent head",
  "a key-less cancel acts on every lane of its operation",
  "a commit then a cancel apply in action order",
  "a cancel then a commit on a Held lane: the cancel releases the head, so the commit mints",
  "a cancel of a Held head promotes the next waiting commit in its turn",
  "a retry then a cancel in one turn releases the re-send",
  "an id minted twice",
  "a mint on another lane than the turn's commit",
  "a later commit's mint before the earlier commit's",
  "a reject commit behind a head declines Rejected",
  "a serialize commit declines Rejected",
  "a commit on an Idle lane declines Overloaded",
  "a commit that cannot encode declines",
  "a commit on an Idle lane declines Cancelled",
  "a commit on an Idle lane declines Restored",
  "a commit on an Idle lane declines StorageRefused",
  "a commit on an Idle lane declines Disposed",
  "a commit no suite fact lets decline NoPersistence is refused",
  "a commit no suite fact lets decline OldVersion is refused",
  "a commit no suite fact lets decline ModuleDisabled is refused",
  "a commit beside a lane minted at an older release declines OldVersion",
  "a commit declines Disposed while the Runtime disposes",
  "a 65th waiting commit declines Overloaded",
  "a 65th waiting commit minted",
  "Opens on a Parked ending",
  "a boot owes no restore to a Held head whose ending is a Kept row",
  "a boot owes a restore to a Held head whose Refused row the reload closes",
  "a boot owes a restore to a Held head whose live Owed row the reload closes",
  "a boot owes no restore to a Held head whose ending is a Delivering row",
  "a boot owes no restore to a Held head whose ending is a Parked row",
  "a forgotten actor's kept ending is let go",
  "a reload owes its Held head one restore, and the boot's incarnation owes no second",
  "a boot's restore ending comes before its incarnation opens, owed until delivered",
  "a boot owes no restore to a head whose own ending is parked",
  "a boot owes no restore to a head whose ending was decided in the disposal",
  "a boot owes a disposed identity's unbound Held head no restore, and refuses one",
  "a disposed identity's unbound Held head not restored at the boot is owed its restore at adoption",
  "a Held head's parked ending delivered meets its restore",
  "a delivery names the oldest open ending",
  "a turn heard while an older ending is still owed",
];

describe("The lane lifecycle (Table A, deadlines, promotion)", () => {
  it("every trace holds on the design's rules", () => {
    for (const trace of traces) assert.ok(holds(trace, rules), `${trace.name} (${trace.cites})`);
  });

  it("a boot owes no restore to a Held head whose row the reload keeps (Restore I6, R3)", () => {
    const names = new Set(traces.map((t) => t.name));

    for (const row of ["Kept", "Delivering", "Parked"])
      assert.ok(
        names.has(`a boot owes no restore to a Held head whose ending is a ${row} row`),
        row,
      );

    for (const row of ["Refused", "live Owed"])
      assert.ok(
        names.has(`a boot owes a restore to a Held head whose ${row} row the reload closes`),
        row,
      );
  });

  it("every pending trace still fails on the design's rules, owed to its Task", () => {
    for (const { owner, trace } of pendingTraces)
      assert.ok(!holds(trace, rules), `${trace.name} now holds: move it from ${owner}'s pending`);
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
    assert.deepEqual(survivors(tableAMutants(reached())), []);
  });

  it("every other deadline and Invariant of every obligation is killed by a trace", () => {
    assert.deepEqual(survivors(deadlineMutants()), []);
  });

  it("every other action of every Table B cell is killed by a trace", () => {
    assert.deepEqual(survivors(tableBMutants()), []);
  });

  it("every other fate of every Table C cell is killed by a trace", () => {
    assert.deepEqual(survivors(tableCMutants()), []);
  });

  it("every other promotion rule is killed by a trace", () => {
    assert.deepEqual(survivors(promotionMutants()), []);
  });

  // A trace that kills no listed mutant checks the fold outside the tables, which no mutant here
  // measures; it stays. A trace whose table kills other traces make is held, not deleted, until a
  // fold mutant shows its fold check is made elsewhere too: the 65th-commit traces alone pin the
  // fold's 64-waiting bound, which no table mutant changes.
  it("every trace kills a mutant no other trace kills, names its ruling, or is held", () => {
    const mutants = [
      ...tableAMutants(reached()),
      ...deadlineMutants(),
      ...tableBMutants(),
      ...tableCMutants(),
      ...promotionMutants(),
    ];

    const kills = traces.map(
      (trace) => new Set(mutants.flatMap((m, i) => (holds(trace, m.rules) ? [] : [i]))),
    );

    const kept = new Set(traces.keys());

    for (const i of [...traces.keys()].toReversed()) {
      const own = [...(kills[i] ?? [])];

      const others = [...kept].filter((j) => j !== i);

      const covered =
        own.length > 0 && own.every((k) => others.some((j) => kills[j]?.has(k) === true));

      if (covered && rulingOf(traces[i]!) === undefined) kept.delete(i);
    }

    assert.deepEqual(
      traces.filter((_, i) => !kept.has(i)).map((trace) => trace.name),
      HELD,
    );
  }, 240_000);

  it("every Invariant the lifecycle refuses under is claimed by exactly one lifecycle oracle", () => {
    // RETURN_TYPE: a recursive walk needs its own type.
    const named = (value: unknown): ReadonlyArray<string> =>
      Predicate.isObject(value)
        ? Object.entries(value).flatMap(([field, inner]) =>
            field === "invariant" && Predicate.isString(inner) ? [inner] : named(inner),
          )
        : [];

    const refused = new Set([...named(rules), ...traces.flatMap((trace) => trace.refusals.flat())]);

    const owners = (invariant: string) =>
      [laneQueue, deliveredOnce, disposal].filter((o) => o.guarantee.some((g) => g === invariant));

    const unclaimed = [...refused].filter(
      (invariant) => invariant !== "WriteLanes I6" && owners(invariant).length !== 1,
    );

    assert.deepEqual(unclaimed, []);
    assert.deepEqual(owners("WriteLanes I6"), []);
    assert.ok(attemptIdentity.guarantee.includes("WriteLanes I6"));
    assert.ok(refused.has("WriteLanes I6"));
  });
});

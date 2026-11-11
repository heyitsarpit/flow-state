import { isDeepStrictEqual } from "node:util";
import { Option } from "effect";
import { type Fixture, handlersFor, referenceFor, rowsFor } from "../fixtures/fixture.ts";
import { Cancel, Latest, Serialize } from "../fixtures/one-lane.ts";
import { Cells, Pay } from "../fixtures/pay.ts";
import { possible } from "../fixtures/handlers.ts";
import { type Row, type RowMember, unknownEvent } from "../fixtures/reference.ts";
import { type ActorRef, type Member, MemberTarget, Observation, type Turn } from "../port.ts";
import { anchorAt, judgedStep } from "../turn/selection.ts";
import { RequestPhase } from "../world/network.ts";
import { empty, type Model } from "./lifecycle-model.ts";
import type { Known } from "./lifecycle-owed.ts";
import type { step } from "./lifecycle-step.ts";
import { Fact } from "./oracle.ts";

type Step = typeof step;

const FIXTURES: ReadonlyArray<Fixture> = [Pay, Cells, Serialize, Latest, Cancel];

const KEY = { intentId: "pi1" };

const OTHER = { intentId: "elsewhere" };

const TARGETS = [
  MemberTarget.Only(),
  MemberTarget.Key({ key: KEY }),
  MemberTarget.Key({ key: OTHER }),
  MemberTarget.Every(),
  MemberTarget.Nothing(),
];

const OTHER_KINDS: ReadonlyArray<Member["kind"]> = ["commit", "retry", "cancel", "cancelAll"];

const INVARIANT: Readonly<Record<RowMember["kind"], Option.Option<string>>> = {
  commit: Option.some("WriteLanes I15"),
  cancel: Option.some("WriteLanes I12"),
  cancelAll: Option.some("WriteLanes I12"),
  retry: Option.none(),
};

const said = (observation: Observation) => Fact.Reported({ observation });

const keyedOf = (fixture: Fixture, operation: string) =>
  (fixture.operations[operation]?.reference.keyFields.length ?? 0) > 0;

const headOf = (operation: string) => `${operation}-1`;

const leafOf = (fixture: Fixture, row: Row) => {
  const from = row.from === "any" ? fixture.handlers.initial : row.from;

  return { from, to: row.to === "same" ? from : row.to };
};

const rootPartOf = (fixture: Fixture, row: Row) => {
  const { from, to } = leafOf(fixture, row);

  const chosen = possible(fixture.handlers, from, row.event, "current").alternatives.find(
    (a) => a.to === to,
  );

  if (chosen === undefined) return [];

  const target = chosen.enters ? chosen.to : "";

  return [{ part: [], definition: fixture.machine, at: chosen.at, node: "", target }];
};

const turnOf = (fixture: Fixture, actor: ActorRef, row: Row, members: ReadonlyArray<Member>) =>
  Observation.Turn({
    actor,
    event: row.event,
    ...leafOf(fixture, row),
    parts: rootPartOf(fixture, row),
    members,
  });

const correctTarget = (fixture: Fixture, operation: string) =>
  keyedOf(fixture, operation) ? MemberTarget.Key({ key: KEY }) : MemberTarget.Only();

const ended = (operation: string) =>
  said(
    Observation.Ended({
      operation,
      attempt: Option.some(headOf(operation)),
      channel: "unknown",
      reason: "Lost",
      actor: Option.none(),
      failure: Option.none(),
    }),
  );

const delivered = (actor: ActorRef, operation: string, event: string) =>
  said(
    Observation.Delivered({
      operation,
      attempt: Option.some(headOf(operation)),
      event,
      actor: Option.some(actor),
    }),
  );

const minted = (fixture: Fixture, actor: ActorRef, operation: string, attempt: string) =>
  said(
    Observation.Minted({
      operation,
      attempt,
      actor: Option.some(actor),
      key: keyedOf(fixture, operation) ? Option.some(KEY) : Option.none(),
    }),
  );

const unknownOf = (fixture: Fixture, operation: string) =>
  Option.flatMap(Option.fromUndefinedOr(fixture.operations[operation]), (o) =>
    unknownEvent(o.reference),
  );

const SENT_SEQ = 1000;

const sentFacts = (operation: string, attempt: string) => [
  said(Observation.Sent({ operation, attempt })),
  Fact.Requested({
    request: {
      seq: SENT_SEQ,
      operation,
      input: KEY,
      key: Option.some(attempt),
      phase: RequestPhase.Open(),
    },
  }),
];

const effectOf = (fixture: Fixture, actor: ActorRef, member: RowMember) => {
  const head = Option.some(headOf(member.operation));

  switch (member.kind) {
    case "commit":
      return [minted(fixture, actor, member.operation, `${member.operation}-new`)];
    case "retry":
      return sentFacts(member.operation, headOf(member.operation));
    case "cancel":
    case "cancelAll":
      return [
        said(
          Observation.Evidence({ kind: "Released", operation: member.operation, attempt: head }),
        ),
      ];
  }
};

const heldHead = (fixture: Fixture, actor: ActorRef, row: Row, operation: string) => {
  const commit = fixture.rows.find(
    (r) =>
      r.members.length === 1 &&
      r.members[0]?.kind === "commit" &&
      r.members[0].operation === operation,
  );

  const event = unknownOf(fixture, operation);

  if (commit === undefined || Option.isNone(event)) return [];

  const head = [
    said(
      turnOf(fixture, actor, commit, [
        { operation, kind: "commit", target: correctTarget(fixture, operation) },
      ]),
    ),
    minted(fixture, actor, operation, headOf(operation)),
    ...sentFacts(operation, headOf(operation)),
  ];

  if (event.value === row.event) return head;

  const heard = Observation.Turn({
    actor,
    event: event.value,
    from: "X0",
    to: "X1",
    parts: [],
    members: [],
  });

  return [...head, ended(operation), delivered(actor, operation, event.value), said(heard)];
};

const requestsOf = (row: Row) =>
  Option.match(row.guard, {
    onNone: () => [],
    onSome: (g) =>
      Array.from({ length: g.passes ? 1 : g.times + 1 }, (_, i) => ({
        seq: i + 1,
        operation: g.operation,
        input: KEY,
        key: Option.some(headOf(g.operation)),
        phase: RequestPhase.Open(),
      })),
  });

const referenceTurn = (fixture: Fixture, row: Row) => {
  const actor: ActorRef = { machine: fixture.machine, id: "a1" };

  const held = [...new Set(row.members.flatMap((m) => (m.kind === "commit" ? [] : [m.operation])))];

  const hearing = held
    .filter((operation) => Option.contains(unknownOf(fixture, operation), row.event))
    .flatMap((operation) => [ended(operation), delivered(actor, operation, row.event)]);

  const effects = row.members.flatMap((m) => effectOf(fixture, actor, m));

  return {
    setup: held.flatMap((operation) => heldHead(fixture, actor, row, operation)),
    requests: requestsOf(row),
    report: row.members.map((m) => ({
      operation: m.operation,
      kind: m.kind,
      target: correctTarget(fixture, m.operation),
    })),
    facts: (members: ReadonlyArray<Member>, acted: boolean, header: Header = same) => [
      ...hearing,
      said(header(turnOf(fixture, actor, row, members))),
      ...effects.filter(() => acted),
    ],
    hearing,
    actor,
  };
};

type Header = (turn: Turn) => Turn;

const same: Header = (turn) => turn;

const HEADERS: ReadonlyArray<{ readonly kind: string; readonly header: Header }> = [
  { kind: "header-to", header: (t) => Observation.Turn({ ...t, to: "Nowhere" }) },
  { kind: "header-from", header: (t) => Observation.Turn({ ...t, from: "Nowhere" }) },
];

/**
 * The row's reference turn with its header perturbed: each lie must leave what the turn owes, or
 * be a Turn I2 violation (the lifecycle reads the header as `selection` judges it).
 */
const judgeHeaders = (
  run: Step,
  known: Known,
  fixture: Fixture,
  row: Row,
  before: Model,
  label: string,
) => {
  const reference = referenceTurn(fixture, row);
  const machines = handlersFor(FIXTURES.filter((f) => f === fixture));
  const anchor = anchorAt(machines, reference.actor, leafOf(fixture, row).from, [row.event]);

  const judgedRun = (header: Header) => {
    const judged = judgedStep(anchor, reference.facts(reference.report, false, header));

    return {
      stepped: run(before, known, judged.facts, reference.requests),
      violations: judged.violations,
    };
  };

  const correct = judgedRun(same);

  const results = HEADERS.map(({ kind, header }) => {
    const lied = judgedRun(header);

    const kept =
      isDeepStrictEqual(lied.stepped.after, correct.stepped.after) &&
      isDeepStrictEqual(refusalsOf(lied.stepped), refusalsOf(correct.stepped));

    return {
      failures: [`${label} ${kind}: the obligation moved and Turn I2 said nothing`].filter(
        () => !kept && lied.violations.length === 0,
      ),
      caught: [kind].filter(() => kept || lied.violations.length > 0),
    };
  });

  return {
    failures: [
      ...correct.violations.map((v) => `${label}: the correct header is ${v.invariant}: ${v.text}`),
      ...results.flatMap((r) => r.failures),
    ],
    caught: results.flatMap((r) => r.caught),
  };
};

/**
 * The row's heard ending reported `Parked` instead of delivered while the suite holds a use of
 * its actor: a live actor's ending may not stay parked (WriteLanes I15).
 */
const judgeParked = (run: Step, known: Known, fixture: Fixture, row: Row, label: string) => {
  const reference = referenceTurn(fixture, row);

  if (reference.hearing.length === 0) return { failures: [], caught: [] };

  const held = Fact.Ensured({ actor: reference.actor, use: "story" });
  const setup = run(empty, known, [held, ...reference.setup], []);

  const parkedInstead = reference.hearing.map((fact) =>
    Fact.$is("Reported")(fact) && Observation.$is("Delivered")(fact.observation)
      ? said(
          Observation.Parked({
            operation: fact.observation.operation,
            attempt: fact.observation.attempt,
          }),
        )
      : fact,
  );

  const parked = run(setup.after, known, parkedInstead, reference.requests);
  const refused = refusalsOf(parked).some((r) => r.startsWith("WriteLanes I15:"));

  return {
    failures: [`${label} parked-while-held: no WriteLanes I15`].filter(() => !refused),
    caught: ["parked-while-held"].filter(() => refused),
  };
};

type Perturbation = {
  readonly kind:
    | "dropped"
    | "retargeted"
    | "duplicated"
    | "unknown"
    | "extra"
    | "release"
    | "reordered";
  readonly name: string;
  readonly report: ReadonlyArray<Member>;
};

const perturbations = (row: Row, report: ReadonlyArray<Member>, member: Member, index: number) => {
  const extra = Option.map(
    Option.fromUndefinedOr(
      OTHER_KINDS.find(
        (k) => !row.members.some((m) => m.operation === member.operation && m.kind === k),
      ),
    ),
    (kind) => ({
      kind: "extra" as const,
      name: `with an extra ${member.operation}.${kind}`,
      report: [...report, { ...member, kind }],
    }),
  );

  const retargeted = TARGETS.filter((t) => !isDeepStrictEqual(t, member.target)).map((target) => ({
    kind: "retargeted" as const,
    name: `retargeted to ${JSON.stringify(target)}`,
    report: report.map((m, i) => (i === index ? { ...m, target } : m)),
  }));

  const ghost = { operation: "ghost", kind: member.kind, target: MemberTarget.Only() };

  const release = {
    operation: member.operation,
    kind: "release" as const,
    target: MemberTarget.Every(),
  };

  return [
    { kind: "dropped", name: "dropped", report: report.filter((_, i) => i !== index) },
    ...retargeted,
    {
      kind: "duplicated",
      name: "reported twice, first with another key",
      report: [{ ...member, target: MemberTarget.Key({ key: OTHER }) }, ...report],
    },
    {
      kind: "unknown",
      name: "with an unknown operation's member first",
      report: [ghost, ...report],
    },
    ...Option.toArray(extra),
    {
      kind: "release",
      name: "with a release on a transition that releases nothing",
      report: [...report, release],
    },
    { kind: "reordered", name: "reordered", report: report.toReversed() },
  ] satisfies ReadonlyArray<Perturbation>;
};

const refusalsOf = (stepped: ReturnType<Step>) =>
  stepped.applied.flatMap((a) => a.refusals.map((r) => `${r.invariant}: ${r.text}`));

type ReferenceRun = {
  readonly report: ReadonlyArray<Member>;
  readonly run: (report: ReadonlyArray<Member>, acted: boolean) => ReturnType<Step>;
};

const judgeMember = (
  label: string,
  row: Row,
  member: RowMember,
  index: number,
  turn: ReferenceRun,
) => {
  const unacted = turn.run(turn.report, false);
  const invariant = INVARIANT[member.kind];
  const owed = turn.report[index];
  const named = `${label} ${member.operation}.${member.kind}`;

  const resending =
    unacted.after.attempts.find((a) => a.id === headOf(member.operation))?.phase._tag ===
    "Resending";

  const reference = [
    ...Option.toArray(
      Option.filter(invariant, (i) => !refusalsOf(unacted).some((r) => r.startsWith(`${i}:`))),
    ).map((i) => `${named}: unacted, not ${i}`),
    ...[`${named}: unacted, the head is not Resending`].filter(
      () => member.kind === "retry" && !resending,
    ),
  ];

  const all = owed === undefined ? [] : perturbations(row, turn.report, owed, index);

  const judged = all.map((p) => {
    const moved = turn.run(p.report, false);
    const name = `${named} ${p.name}`;

    const same =
      isDeepStrictEqual(moved.after, unacted.after) &&
      isDeepStrictEqual(refusalsOf(moved), refusalsOf(unacted));

    if (row.claimed && p.kind === "dropped")
      return {
        failures: [],
        limits: [`${name}: not owed (claimed)`].filter(() => !same),
        caught: [],
      };

    const keyMoved =
      member.kind === "commit" && ["dropped", "retargeted", "duplicated"].includes(p.kind);

    const tolerated = keyMoved ? [] : refusalsOf(turn.run(p.report, true));

    return {
      failures: [
        ...[`${name}: the obligation moved`].filter(() => !same),
        ...tolerated.map((r) => `${name}: acted, refused: ${r}`),
      ],
      limits: [],
      caught: [p.kind].filter(() => same && Option.isSome(invariant)),
    };
  });

  return {
    failures: [...reference, ...judged.flatMap((j) => j.failures)],
    limits: judged.flatMap((j) => j.limits),
    caught: judged.flatMap((j) => j.caught),
  };
};

const judgeRow = (run: Step, known: Known, fixture: Fixture, row: Row) => {
  const label = `${fixture.name} ${row.event} ${row.from}->${row.to}`;
  const reference = referenceTurn(fixture, row);
  const setup = run(empty, known, reference.setup, []);
  const before: Model = setup.after;

  const heads = row.members.flatMap((m) =>
    m.kind === "commit" || before.attempts.some((a) => a.id === headOf(m.operation))
      ? []
      : [`${label}: the setup minted no head for ${m.operation}`],
  );

  const turn: ReferenceRun = {
    report: reference.report,
    run: (report, acted) => run(before, known, reference.facts(report, acted), reference.requests),
  };

  const acted = refusalsOf(turn.run(reference.report, true));
  const members = row.members.map((m, i) => judgeMember(label, row, m, i, turn));
  const headers = judgeHeaders(run, known, fixture, row, before, label);
  const parked = judgeParked(run, known, fixture, row, label);

  return {
    failures: [
      ...refusalsOf(setup).map((r) => `${label}: the setup is refused: ${r}`),
      ...heads,
      ...acted.map((r) => `${label}: the correct report, acted, is refused: ${r}`),
      ...members.flatMap((m) => m.failures),
      ...headers.failures,
      ...parked.failures,
    ],
    limits: members.flatMap((m) => m.limits),
    caught: [...members.flatMap((m) => m.caught), ...headers.caught, ...parked.caught],
  };
};

/**
 * Every perturbation of every reference row's report, and how each came out.
 *
 * **When to use**
 *
 * The step's tests run it on `step` and on each step mutant: the perturbation test of the
 * member-resolution convergence (STATUS, Run 7).
 *
 * **Details**
 *
 * For each row of each fixture and each of its members, the row's reference turn (each member's
 * lane holding a Held head, the guard's log set so the row is chosen) runs with its correct
 * report and with each perturbation of it: the member dropped, retargeted to each other target,
 * an unknown operation's member added, an extra member of another kind added, a release on a
 * transition that releases nothing added, and the members reordered. It also runs the turn's
 * header through `selection` with `to` or `from` naming no state (each lie leaves the obligation
 * or is a Turn I2 violation), and a heard ending reported `Parked` while the suite holds its
 * actor (WriteLanes I15). `failures` lists:
 *
 * - a perturbation that, with nothing acted on, leaves another model or other refusals than the
 *   correct report (the obligation moved);
 * - a correct report that, with nothing acted on, is not refused under the member's Invariant
 *   (WriteLanes I15 for a commit's mint, I12 for a cancel's release), or leaves a retry's head
 *   other than `Resending`;
 * - a correct report, or a perturbation that names the same lanes, refused with the effects
 *   acted on (Conformance R4: a report-only mismatch is no violation).
 *
 * `caught` names each perturbation kind that left a member's obligation in place and refused
 * under its Invariant at least once.
 *
 * **Gotchas**
 *
 * - A claimed row's dropped member is not owed: the stated limit (v2 Risk 2), returned in
 *   `limits`.
 * - A commit's key is its report's, so a dropped or retargeted commit waits on another lane:
 *   its acted mint is WriteLanes I1, and only the unacted run is compared.
 * - An owed retry's re-send is judged by no Invariant (pending, the user): its obligation is
 *   the head's `Resending`, held by the model comparison.
 */
export const perturbationsOf = (run: Step) => {
  const known = { reference: referenceFor(FIXTURES), rows: rowsFor(FIXTURES) };

  const rows = FIXTURES.flatMap((fixture) =>
    fixture.rows.map((row) => judgeRow(run, known, fixture, row)),
  );

  return {
    failures: rows.flatMap((r) => r.failures),
    limits: rows.flatMap((r) => r.limits),
    caught: [...new Set(rows.flatMap((r) => r.caught))].toSorted(),
  };
};

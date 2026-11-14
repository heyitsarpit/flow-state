import type { TaskRef } from "./coverage.ts";

/**
 * One core mutant the production cases did not kill by a named oracle, triaged: equivalent (no
 * behaviour a core Spec rule observes changes), or owed (it breaks `rule`, and `owner` builds the
 * check that kills it).
 */
export type Triage =
  | {
      readonly kind: "equivalent";
      readonly at: string;
      readonly mutated: string;
      readonly why: string;
    }
  | {
      readonly kind: "owed";
      readonly at: string;
      readonly mutated: string;
      readonly owner: TaskRef;
      readonly rule: string;
      readonly why: string;
    };

// RETURN_TYPE: both builders give the Triage union, so the list holds one type.
const owed = (at: string, mutated: string, owner: TaskRef, rule: string, why: string): Triage => ({
  kind: "owed",
  at,
  mutated,
  owner,
  rule,
  why,
});

// RETURN_TYPE: both builders give the Triage union, so the list holds one type.
const equivalent = (at: string, mutated: string, why: string): Triage => ({
  kind: "equivalent",
  at,
  mutated,
  why,
});

/**
 * Every core mutant of the last recorded run (`core-mutants.tsv`) that no named oracle killed.
 */
export const coreTriage: ReadonlyArray<Triage> = [
  owed(
    "src/core/answers.ts:36",
    "if (incarnation !== undefined || incarnation.id !== read.incarnation) return;",
    "@task.V3.T54",
    "Reads I9",
    "a live incarnation's lookup ending is never delivered; PAY-03 fails by its state expectation only",
  ),
  owed(
    "src/core/answers.ts:36",
    "if (incarnation === undefined || incarnation.id === read.incarnation) return;",
    "@task.V3.T54",
    "Reads I9",
    "every lookup ending of a live incarnation is dropped; PAY-03 fails by its state expectation only",
  ),
  equivalent(
    "src/core/answers.ts:36",
    "if (incarnation === undefined && incarnation.id !== read.incarnation) return;",
    "every read is made by its live incarnation, and every end, dispose and Runtime disposal drops that incarnation's reads, so a settled read always finds its own live incarnation",
  ),
  owed(
    "src/core/answers.ts:46",
    'channel: c.channel !== "unknown" ? "failure" : c.channel,',
    "@task.V3.T54",
    "Reads R9",
    "a successful lookup is routed as a failure and its success event never runs; PAY-03 fails by its state expectation only",
  ),
  owed(
    "src/core/answers.ts:62",
    "if (read === undefined) {",
    "@task.V3.T54",
    "WriteLanes R10",
    "every commit settlement throws and a lookup's settlement is never applied; PAY-01 fails by a defect only",
  ),
  owed(
    "src/core/answers.ts:70",
    'if (live && CallResult.$is("Defect")(result) && route !== "queue")',
    "@task.V3.T54",
    "WriteLanes R2",
    "a commit that dies while its actor is open reports no Defect issue; PAY-12/defect fails by its issue expectation only",
  ),
  owed(
    "src/core/answers.ts:77",
    'disarmWhere((t) => Timer.$is("Silent")(t) && t.ticket !== ticket);',
    "@task.V3.T54",
    "WriteAhead R12",
    "a landed batch disarms the other batches' silence timers, so a second unanswered write is never named StorageSilent; no case has two batches out",
  ),
  owed(
    "src/core/answers.ts:77",
    'disarmWhere((t) => Timer.$is("Silent")(t) || t.ticket === ticket);',
    "@task.V3.T54",
    "WriteAhead R12",
    "a landed batch disarms every silence timer; no case has two batches out",
  ),
  owed(
    "src/core/disposal.ts:34",
    'disarmWhere((t) => Timer.$is("Schedule")(t) && Timer.$is("Grace")(t));',
    "@task.V3.T55",
    "Actors R22",
    "Runtime disposal leaves schedules armed; no case advances past a schedule's due time after disposal starts",
  ),
  owed(
    "src/core/evidence-of.ts:84",
    'h.phase._tag !== "Held"',
    "@task.V3.T18",
    "WriteLanes R8",
    "a retry on an in-flight head gives no InFlight evidence, and one on a Held head gives one; no case reads InFlight evidence",
  ),
  owed(
    "src/core/incarnations.ts:58",
    'disarmWhere((t) => Timer.$is("Schedule")(t) && t.incarnation !== incarnation.id);',
    "@task.V3.T18",
    "Turn R14",
    "one actor's exit disarms every other actor's schedules; PAY-21 fails by a defect only",
  ),
  owed(
    "src/core/incarnations.ts:58",
    'disarmWhere((t) => Timer.$is("Schedule")(t) || t.incarnation === incarnation.id);',
    "@task.V3.T55",
    "Actors R8",
    "an exit also disarms the actor's grace, so a free actor ends late; PAY-21 fails by a defect only",
  ),
  owed(
    "src/core/incarnations.ts:192",
    "if (!live || armed.dueAt <= tx.env.now)",
    "@task.V3.T18",
    "Turn I32",
    "a due schedule whose timer the host has not fired yet runs at an ensure, out of admission order; the suite's world fires due timers before any input, so only a host-driver case shows it",
  ),
  owed(
    "src/core/incarnations.ts:262",
    "reads: new Map([...tx.world().reads].filter(([, r]) => r.incarnation === incarnation.id)),",
    "@task.V3.T54",
    "Reads R6",
    "disposing one actor drops every other live actor's pending lookups; no case disposes an actor while another's lookup is out",
  ),
  owed(
    "src/core/incarnations.ts:298",
    "tx.world().mail.some((m) => actorKey(m.actor) !== actorKey(incarnation.actor));",
    "@task.V3.T9",
    "Actors R8",
    "with a backlog past the drain's slice, another actor's queued mail keeps a free incarnation busy and delays its grace; no case runs a turn storm",
  ),
  owed(
    "src/core/incarnations.ts:301",
    '(t) => Timer.$is("Grace")(t) && t.incarnation !== incarnation.id,',
    "@task.V3.T55",
    "Actors I10",
    "a re-used actor keeps its grace and ends while in use; ACT cases never re-ensure inside the grace; PAY-08 fails by a defect only",
  ),
  owed(
    "src/core/incarnations.ts:301",
    '(t) => Timer.$is("Grace")(t) || t.incarnation === incarnation.id,',
    "@task.V3.T55",
    "Actors R8",
    "a free actor with an armed schedule never gets its grace, so it ends late; no case releases an actor with a schedule armed",
  ),
  owed(
    "src/core/incarnations.ts:304",
    "if (busy || timing)",
    "@task.V3.T55",
    "Actors R8",
    "any step inside the grace disarms it and nothing re-arms it that step, so the free actor ends late or never; ACT-03 has no step inside its grace",
  ),
  owed(
    "src/core/incarnations.ts:305",
    'disarmWhere((t) => Timer.$is("Grace")(t) && t.incarnation !== incarnation.id);',
    "@task.V3.T55",
    "Actors I10",
    "a re-used actor keeps its own grace and ends while in use; PAY-08 fails by a defect only",
  ),
  owed(
    "src/core/incarnations.ts:305",
    'disarmWhere((t) => Timer.$is("Grace")(t) || t.incarnation === incarnation.id);',
    "@task.V3.T55",
    "Turn R14",
    "re-using a free actor disarms its own schedules; PAY-08 fails by a defect only",
  ),
  owed(
    "src/core/lane-moves.ts:77",
    "if (lane === undefined) return LaneState.Head({ head: lane.head });",
    "@task.V3.T54",
    "WriteLanes R7",
    "every commit on an Idle key throws; PAY-01 fails by a defect only",
  ),
  owed(
    "src/core/lane-moves.ts:85",
    "return lane !== undefined ? defect(`no lane ${at.id} for a head's move`) : lane;",
    "@task.V3.T54",
    "WriteLanes R8",
    "every minted head's invoke throws; PAY-01 fails by a defect only",
  ),
  owed(
    "src/core/lane-moves.ts:303",
    'Hold: () => hold(at, laneAt(at), Cue.$is("Ended")(cue) || cue.channel === "unknown"),',
    "@task.V3.T54",
    "WriteAhead T18",
    "the mutant is the Spec's side: unmutated, a StillUnknown hold leaves the saved head's inFlight true, so a boot wakes an identity whose head is Held; no case reloads after a StillUnknown",
  ),
  owed(
    "src/core/lane-moves.ts:359",
    "Withdrawing: (p) => p.ticket !== ticket,",
    "@task.V3.T18",
    "WriteLanes R14",
    "a cancel waiting for its acknowledgement never ends NotSent Cancelled when the store lands it; LANE-08 fails by its case expectation only",
  ),
  owed(
    "src/core/lanes.ts:58",
    "return lane !== undefined",
    "@task.V3.T18",
    "WriteLanes R14",
    "cancel or retry on an Idle key throws instead of doing nothing; PAY-15/cancel-idle fails by a defect only",
  ),
  owed(
    "src/core/lanes.ts:121",
    "if (Option.isNone(text) && !encodes) {",
    "@task.V3.T18",
    "WriteLanes R12",
    "a commit whose non-key input field cannot encode is minted and sent instead of declining Unencodable; LANE-14 fails only a key field",
  ),
  owed(
    "src/core/lanes.ts:127",
    "if (tx.machines.get(incarnation.actor.machine)?.persist !== true && !tx.world().persistence) {",
    "@task.V3.T18",
    "WriteLanes R12",
    "a persisted identity's commit in a Runtime without persistence does not decline NoPersistence; every suite Runtime has persistence",
  ),
  owed(
    "src/core/lanes.ts:170",
    "if (read.incarnation === incarnation.id || read.operation === operation.name) {",
    "@task.V3.T54",
    "WriteLanes R17",
    "cancelling one read interrupts another actor's shared lookup or the actor's other reads; no case cancels a read",
  ),
  owed(
    "src/core/lanes.ts:271",
    "lane !== undefined",
    "@task.V3.T54",
    "Actors R15",
    "keeping an ending whose lane is gone throws; DLV-04 fails by a defect only",
  ),
  owed(
    "src/core/persist.ts:107",
    "if (incarnation === undefined && !persisted(actor)) return;",
    "@task.V3.T54",
    "WriteAhead I3",
    "a local identity gets a record, so a send after its end restores it; no case sends to an ended local identity",
  ),
  owed(
    "src/core/record.ts:270",
    'key.startsWith("actor/") || !decoded.has(key) ? [key.slice(6)] : [],',
    "@task.V3.T54",
    "Restore I1",
    "every decoded record reads as undecodable, so a boot wakes no Owing identity; no case reads an owed identity at ready before touching it",
  ),
  owed(
    "src/core/serve.ts:112",
    'const owner = entered || accepted.part.node === "root" ? activation : ROOT_ACTIVATION;',
    "@task.V3.T18",
    "Turn I26",
    "a non-entering transition's commit is owned by the wrong Activation, so its late ending routes as current; no case commits from a non-entering leaf transition",
  ),
  owed(
    "src/core/serve.ts:277",
    "for (let served = 0; served < 10_000 || tx.world().mail.length > 0; served += 1) {",
    "@task.V3.T9",
    "WriteAhead R10",
    "the drain never returns while mail is queued, so a backlog is never served in a later step; no case runs a turn storm",
  ),
  equivalent(
    "src/core/serve.ts:277",
    "for (let served = 0; served <= 10_000 && tx.world().mail.length > 0; served += 1) {",
    "one more turn in the drain's slice moves a backlog's 10,001st turn one step earlier; slices decide when work runs, never what (Actors R13), and no rule fixes the slice",
  ),
  owed(
    "src/core/step.ts:76",
    "if (incarnationOf(actor) !== undefined && tx.world().records.has(actorKey(actor)))",
    "@task.V3.T9",
    "Actors R16",
    "a send to an ended identity with a record never restores it; ACT cases return actors by ensure only",
  ),
  equivalent(
    "src/core/step.ts:76",
    "if (incarnationOf(actor) === undefined || tx.world().records.has(actorKey(actor)))",
    "the extra calls ensure with no use and existing set: on a live incarnation it does nothing, and with no record it starts nothing",
  ),
  owed(
    "src/core/turn.ts:248",
    "Number.isFinite(value) && value > 0",
    "@task.V3.T17",
    "Turn T6",
    "the mutant refuses a 0 ms computed delay, which Turn T6 allows; no case schedules 0 ms",
  ),
  owed(
    "src/core/tx.ts:123",
    "machines.get(actor.machine)?.persist === true || world.persistence;",
    "@task.V3.T54",
    "WriteAhead R3",
    "a non-persisted machine's actors are persisted and their commits wait for the store; LANE-16 acknowledges before answering, which hides it",
  ),
];

/**
 * The faults of a core-mutant run against the triage: a mutant no named oracle killed with no
 * triage row, and a triage row whose mutant is now killed (stale: an owed check landed, or the
 * row was wrong).
 */
export const triageFaults = (
  rows: ReadonlyArray<{ readonly status: string; readonly at: string; readonly mutated: string }>,
  triage: ReadonlyArray<Triage>,
) =>
  rows.flatMap(({ status, at, mutated }) => {
    const row = triage.find((t) => t.at === at && t.mutated === mutated);

    if (status === "killed")
      return row === undefined ? [] : [`BAD  ${at}: killed, yet triaged ${row.kind}: drop the row`];

    return row === undefined ? [`BAD  ${at}: ${status} and not triaged: ${mutated}`] : [];
  });

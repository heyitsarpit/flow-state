import { Option } from "effect";
import { invariantsOf, type Owes, type TaskRef } from "./coverage.ts";
import type { InvariantId } from "./dsl/facts.ts";
import { featureOwes } from "./parts/feature-rows.ts";

const upTo = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

const whole = (task: TaskRef, why: string, invariants: ReadonlyArray<InvariantId>) =>
  invariants.map((subject) => ({ subject, clause: Option.none<string>(), task, why }));

const part = (subject: InvariantId, task: TaskRef, clause: string) => ({
  subject,
  clause: Option.some(clause),
  task,
  why: "the rest of a checked Invariant",
});

/**
 * What each Task owes the suite, in one list: a core Invariant owed whole (no check yet) or in
 * part (`clause`: the part of a checked Invariant no check judges yet), and each Plan feature not
 * built in full (`featureOwes`), by the Task that owns it and why.
 *
 * **Details**
 *
 * - The matrix gate judges the feature rows: one row per unbuilt or partly built feature, none
 *   for a built one, each naming an open Task; a feature's slice is its Task's.
 * - The coverage gate fails on an Invariant with no check and no row, on a whole row whose
 *   Invariant is now checked (stale), on a clause row on an unchecked Invariant, on two rows of
 *   one kind for one Invariant, and on a row whose Task is not open (a Task cannot close, or ask
 *   to, while a row names it).
 * - Where round-14 breaks an Invariant, that is a row of `limits.ts` once a check fails it there
 *   (Conformance R22: prose limits do not count).
 */
export const owes: ReadonlyArray<Owes> = [
  ...whole(
    "@task.V3.T24",
    "a domain write's store effects before its ending in the mailbox (WriteLanes I19): the Port reads the store only between steps (Runtime.entity), so the check needs the entity store (T24) to report store changes in order",
    invariantsOf("WriteLanes", [19]),
  ),
  ...whole(
    "@task.V3.T17",
    "a compound fixture's self transition and exit and entry order (I4, I6), its Published path (I1), placements by key (I24) and .each copies' per-key timers (I35 in part); T17 builds the fixtures and their checks",
    invariantsOf("Turn", [1, 4, 6, 24, 35]),
  ),
  ...whole(
    "@task.V3.T18",
    "check() (I18), onContext (I28), issues in snapshots (I31), multi-step Schedules (I33), restartOn (I34), equal deadlines in actor admission order (I32) and post-commit defects (I16); T18 builds them on production",
    invariantsOf("Turn", [16, 18, 28, 31, 32, 33, 34]),
  ),
  ...whole(
    "@task.V3.T21",
    "a value outcome of a placement (I25; Turn Spec T22)",
    invariantsOf("Turn", [25]),
  ),
  ...whole(
    "@task.V3.T18",
    "a seed per boot (WriteLanes I28): its wrong runtime is a production mutant that breaks the seed",
    invariantsOf("WriteLanes", [28]),
  ),
  ...whole(
    "@task.V3.T9",
    "the Actors area is not built beyond Runtime disposal and an actor's incarnation and end (I10, I14, I37); I24 is delivered-once's; T42 cut I11, I16 and I18 and added I37 (Free actors end), I38 (never-sent commits at disposal, CQ6) and I39 (identity versions)",
    invariantsOf(
      "Actors",
      upTo(39).filter((n) => ![10, 11, 14, 16, 18, 24, 29, 30, 31, 32, 35, 36, 37, 38].includes(n)),
    ),
  ),
  ...whole(
    "@task.V3.T19",
    "the WriteAhead area is not built; T42 cut I16 and I18 and added I19 (a Runtime refused scope ownership)",
    invariantsOf(
      "WriteAhead",
      upTo(19).filter((n) => ![16, 18].includes(n)),
    ),
  ),
  ...whole(
    "@task.V3.T20",
    "the Restore area is not built; I6's lower bound is delivered-once's (CQ11); T42 cut I3 and I4 and added I19 (a changed reset runs first after restore)",
    invariantsOf(
      "Restore",
      upTo(19).filter((n) => ![3, 4, 6].includes(n)),
    ),
  ),
  ...whole(
    "@task.V3.T21",
    "the Reads area is not built, the idle row (R14; cases compare with `laneGone`) included; T42 cut I7, I12 and I18 and added I20 (read endings)",
    invariantsOf("Reads", [1, 2, 3, 4, 5, 8, 9, 11, 15, 16, 17, 19, 20, 21]),
  ),
  ...whole(
    "@task.V3.T17",
    "every violation reported, not the first (I3), IdentityFieldOptional, write-scope checks and context wiring (I9, I12, I17); T17 builds the compiler and its static cases",
    invariantsOf("Compile", [3, 9, 12, 17]),
  ),
  ...whole(
    "@task.V3.T17",
    "the Diagnostic carrier, Schema, classification and renderer; T17 builds Diagnostics with the compiler, and their vectors",
    invariantsOf(
      "Diagnostics",
      upTo(10).filter((n) => n !== 4),
    ),
  ),
  ...whole(
    "@task.V3.T20",
    "the canonical byte codec (Codec Q2); T20 builds it with restore and key versions, and its vectors",
    invariantsOf("Codec", upTo(6)),
  ),
  ...whole(
    "@task.V3.T54",
    "the owed ledger and one delivery point: a lane holds Attempt state only, an ending is one ledger row (WriteLanes I29 to I41), Start delivers rows and a boot parks nothing (Actors I40, I41), three record kinds written from what a step touched (WriteAhead I20, I23, I24, Codec I7), Restore I20, a read's ending as a row (Reads I22) and reports derived from acts (Turn I36); T54 builds them with their checks",
    [
      ...invariantsOf(
        "WriteLanes",
        upTo(41).filter((n) => n >= 29),
      ),
      ...invariantsOf("Actors", [40, 41]),
      ...invariantsOf("WriteAhead", [20, 23, 24]),
      ...invariantsOf("Restore", [20]),
      ...invariantsOf("Reads", [22]),
      ...invariantsOf("Codec", [7]),
      ...invariantsOf("Turn", [36]),
    ],
  ),
  ...whole(
    "@task.V3.T52",
    "a row's fate in the step whose batch landed (WriteAhead I21, I22): the Spec model's Maybe life passes both a lost and a doubled delivery there, a bound rather than the exact fate per core step; T52 replaces it with the exact fate",
    invariantsOf("WriteAhead", [21, 22]),
  ),
  ...whole(
    "@task.V3.T55",
    "the Runtime's life: the admit table (Actors I42, I43) and disposal's final write holding every dirty record (Actors I44); T55 builds them with their checks",
    invariantsOf("Actors", [42, 43, 44]),
  ),
  ...whole(
    "@task.V3.T22",
    "arguments read before any fixture loads (I3), flow.config.ts discovery (I10) and an unchanged project tree (I11); T22 builds them and their static cases",
    invariantsOf("StaticCli", [3, 10, 11]),
  ),
  part(
    "Actors I38",
    "@task.V3.T9",
    "the next incarnation after a reload hearing each never-sent commit's NotSent { Disposed } once (round-14 never delivers it, ruling CQ6), and a commit queued behind a Held head ending at disposal (a round-14 limit: it is left queued)",
  ),
  part(
    "Actors I37",
    "@task.V3.T19",
    "a dirty end whose own record is not written while another actor's is, in the same step: a write names no record, so any write discharges every dirty end (T45 close review S2; reached by F1-two-ends in parts/f1.test.ts under a dropped-write edit)",
  ),
  part(
    "Turn I5",
    "@task.V3.T17",
    "every Activation at or above the Boundary kept (compound states; a3.r14-reenters-the-parent, 1b.r14-history-reentry-keeps-activation need the old suite's compound fixtures); only a re-entry's new Activation is judged, through its late ending",
  ),
  part(
    "Turn I12",
    "@task.V3.T17",
    "guards, payload mappers and updates reading PreTurn, and selects, keys and placement reads reading After; only a schedule function's After read is cased",
  ),
  part(
    "Turn I2",
    "@task.V3.T18",
    "an Unhandled or Denied that should have run and that the suite cannot attribute to one actor; part-level alternatives and compound states; the first turn after a disposal",
  ),
  part(
    "Turn I26",
    "@task.V3.T18",
    "the converse (a current ending routed late) beyond the leaf's own alternatives; reads' endings, which name no owner on the Port; owners per part",
  ),
  part(
    "Turn I29",
    "@task.V3.T18",
    "snapshot parts other than memory (context, issues, operations) and kid-bearing actors' views",
  ),
  part(
    "Turn I30",
    "@task.V3.T18",
    "parts other than memory; equal-value patches (round-14 gives a new object); memory that is not an object",
  ),
  part(
    "Turn I9",
    "@task.V3.T18",
    "at most one publication per turn (a Published names no turn), and an accepted turn that stays on its leaf (an update or self) publishing",
  ),
  part(
    "Turn I14",
    "@task.V3.T18",
    "the issue-only snapshot, context and store truth (not on the Port); a refused turn of a driven event or a firing",
  ),
  part(
    "Turn I15",
    "@task.V3.T18",
    "no revision change (no revision on the Port); an ending admitted in an Unhandled or Denied turn still applying its lane effects and counting as delivered",
  ),
  part(
    "Turn I20",
    "@task.V3.T17",
    "the arming id a firing carries (not on the Port), disarmOn (no catalog fixture declares one; round-14 has it, turn.ts), firings after a reload before a turn enters a state again, and part and keyed schedules",
  ),
  part(
    "Turn I21",
    "@task.V3.T18",
    "a delay a function of memory computes; armings in a step that also advances time are timed from its start",
  ),
  part(
    "Turn I22",
    "@task.V3.T17",
    "overdue on restore and on a frozen trait's return; only a returning use is cased",
  ),
  part(
    "Turn I23",
    "@task.V3.T18",
    "at most one waiting deadline per schedule (a re-arm while unused)",
  ),
  part(
    "Turn I27",
    "@task.V3.T17",
    "exits of compound ancestors and active subroutines; owners per part; calls minted before a reload, which the Activation bump drops from the pending set",
  ),
  part(
    "WriteLanes I4",
    "@task.V3.T17",
    "no author tag equals a Flow reason: a construction rule on the fixtures' failure tags",
  ),
  part(
    "WriteLanes I13",
    "@task.V3.T18",
    "idle passing over a busy lane (no fixture runs an idle guard over a Held or InFlight lane), idle(k) on a keyed operation, and a lane that holds a kept ending",
  ),
  part(
    "WriteLanes I5",
    "@task.V3.T18",
    "the lane leaving Held observed apart from the runtime's own Released report (only LANE-11's row read sees it)",
  ),
  part(
    "WriteLanes I27",
    "@task.V3.T18",
    "every admitted commit at every quiescent point waiting, Held or ended once (the lifecycle's phases hold it, but no check names I27 for a commit that is never invoked and never ends)",
  ),
  part(
    "WriteLanes I17",
    "@task.V3.T18",
    "no current member names the old-version lane, and a lane of an older identity version declines nothing (LANE-15 judges the decline only)",
  ),
  part(
    "WriteLanes I24",
    "@task.V3.T18",
    "a success write over data that landed after the commit started is marked stale, and an invalid one applies nothing and reports InvalidWrite (round-14 has no InvalidWrite)",
  ),
  part(
    "WriteLanes I23",
    "@task.V3.T18",
    "a late result after cleanup changes no data (entity records, read through the Port's entity) and none after cleanup by forget or an interrupt; late-results judges lanes and endings after a release only (T16 review, T7-M1)",
  ),
  part(
    "Compile I1",
    "@task.V3.T17",
    "spies on actors, timers, storage, loaders and evidence (T1); only a commit run is caught",
  ),
  part(
    "Compile I5",
    "@task.V3.T17",
    "Flow.input beside a default, and a field with no source; only Flow.initial beside a Schema default is judged",
  ),
  part(
    "Compile I15",
    "@task.V3.T17",
    "a bare function in an operation's or a handler's Slot place at Runtime creation; only the memory's creation Slot is tampered",
  ),
  part(
    "Compile I4",
    "@task.V3.T17",
    "fragment states, events and operations; only a root machine's tables are compared",
  ),
  part(
    "Compile I6",
    "@task.V3.T17",
    "a plain Schema default's evaluation: a surface source's plain default has no counter",
  ),
  part(
    "Compile I7",
    "@task.V3.T17",
    "no clock or randomness read at creation (needs spies on both)",
  ),
  part(
    "Compile I8",
    "@task.V3.T20",
    "adoption and hydration never invoke creation; only restore is judged",
  ),
  part(
    "Compile I11",
    "@task.V3.T17",
    "the Flow.ignore clause: a surface source cannot map unknown: to Flow.ignore",
  ),
  part(
    "Compile I13",
    "@task.V3.T17",
    "is, child, root and __proto__, at construction (round-14 refuses self at Runtime creation), path depth, length, control characters and code-unit equality",
  ),
  part(
    "Compile I14",
    "@task.V3.T17",
    "one machine under two keys and colliding operation, domain and entity ids",
  ),
  part(
    "Compile I10",
    "@task.V3.T17",
    "the construction-time refusal (Compile R9) and a fragment placed twice: round-14 only reports it from flow check",
  ),
  part(
    "StaticCli I1",
    "@task.V3.T22",
    "spies on the closures (T1); the cases read the CLI's own callbacksRun count",
  ),
  part(
    "StaticCli I2",
    "@task.V3.T22",
    "schedule-trigger edges, which no Compiled place names (graph's trigger: edges are left out); only pay is graphed",
  ),
  part(
    "StaticCli I4",
    "@task.V3.T22",
    "explain and graph in both forms, and R7's envelope (version, status, data); only check's counts are compared",
  ),
  part(
    "StaticCli I6",
    "@task.V3.T22",
    "exit codes 130 and 143 (R8, T6), exit 2 for loading, artifact and I/O failures (R8), a construction's FlowError reported as error findings with exit 1 (R11, C6), and info findings (only warnings are judged)",
  ),
  part(
    "StaticCli I7",
    "@task.V3.T22",
    "R9's failure in place of a complete claim: missing type facts give status failed (C18); only complete false on two hand projects is judged",
  ),
  part(
    "StaticCli I8",
    "@task.V3.T22",
    "R10's other rules, and reference apps chosen from the Spec rather than from fixtures with no error (desk and desk-listen report UnresolvedHold); 5 of R10's 11 rules are checked",
  ),
  part("StaticCli I12", "@task.V3.T22", "the --app operand (R3)"),
  part(
    "WriteLanes I25",
    "@task.V3.T18",
    "an unknown StillUnknown keeps the failure's tag: neither runtime reports `Ended.failure` yet, so ending-channels judges the tag only when a runtime reports it (2026-11-12)",
  ),
  ...featureOwes,
];

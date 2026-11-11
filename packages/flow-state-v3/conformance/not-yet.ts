import { invariantsOf, type NotYet } from "./coverage.ts";

const upTo = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

/**
 * Every core Invariant with no oracle and mutant yet, by the Task that owns it.
 *
 * **Details**
 *
 * The coverage gate fails on an Invariant in no row, and on a row that still lists one an oracle
 * now checks, so each row shrinks as its Task lands. T15's audit reads what is left. A row says
 * what its owner builds; where round-14 breaks an Invariant, that is a row of `limits.ts` once a
 * check fails it there (Conformance R22: prose limits do not count).
 */
export const notYet: ReadonlyArray<NotYet> = [
  {
    owner: "@task.V3.T24",
    why: "a domain write's store effects before its ending in the mailbox (WriteLanes I19): the Port reads the store only between steps (Runtime.entity), so the check needs the entity store (T24) to report store changes in order",
    invariants: invariantsOf("WriteLanes", [19]),
  },
  {
    owner: "@task.V3.T17",
    why: "a compound fixture's self transition and exit and entry order (I4, I6), its Published path (I1), placements by key (I24) and .each copies' per-key timers (I35 in part); T17 builds the fixtures and their checks",
    invariants: invariantsOf("Turn", [1, 4, 6, 24, 35]),
  },
  {
    owner: "@task.V3.T18",
    why: "check() (I18), onContext (I28), issues in snapshots (I31), multi-step Schedules (I33), restartOn (I34), equal deadlines in actor admission order (I32) and post-commit defects (I16); T18 builds them on production",
    invariants: invariantsOf("Turn", [16, 18, 28, 31, 32, 33, 34]),
  },
  {
    owner: "@task.V3.T21",
    why: "a value outcome of a placement (I25; Turn Spec T22)",
    invariants: invariantsOf("Turn", [25]),
  },
  {
    owner: "@task.V3.T18",
    why: "a seed per boot (WriteLanes I28): its wrong runtime is a production mutant that breaks the seed",
    invariants: invariantsOf("WriteLanes", [28]),
  },
  {
    owner: "@task.V3.T9",
    why: "the Actors area is not built beyond Runtime disposal and an actor's incarnation and end (I10, I14, I37); I24 is delivered-once's; T42 cut I11, I16 and I18 and added I37 (Free actors end), I38 (never-sent commits at disposal, CQ6) and I39 (identity versions)",
    invariants: invariantsOf(
      "Actors",
      upTo(39).filter((n) => ![10, 11, 14, 16, 18, 24, 29, 30, 31, 32, 35, 36, 37, 38].includes(n)),
    ),
  },
  {
    owner: "@task.V3.T19",
    why: "the WriteAhead area is not built; T42 cut I16 and I18 and added I19 (a Runtime refused scope ownership)",
    invariants: invariantsOf(
      "WriteAhead",
      upTo(19).filter((n) => ![16, 18].includes(n)),
    ),
  },
  {
    owner: "@task.V3.T20",
    why: "the Restore area is not built; I6's lower bound is delivered-once's (CQ11); T42 cut I3 and I4 and added I19 (a changed reset runs first after restore)",
    invariants: invariantsOf(
      "Restore",
      upTo(19).filter((n) => ![3, 4, 6].includes(n)),
    ),
  },
  {
    owner: "@task.V3.T21",
    why: "the Reads area is not built; T42 cut I7, I12 and I18 and added I20 (read endings)",
    invariants: invariantsOf("Reads", [1, 2, 3, 4, 5, 8, 9, 11, 15, 16, 17, 19, 20, 21]),
  },
  {
    owner: "@task.V3.T17",
    why: "every violation reported, not the first (I3), IdentityFieldOptional, write-scope checks and context wiring (I9, I12, I17); T17 builds the compiler and its static cases",
    invariants: invariantsOf("Compile", [3, 9, 12, 17]),
  },
  {
    owner: "@task.V3.T17",
    why: "the Diagnostic carrier, Schema, classification and renderer; T17 builds Diagnostics with the compiler, and their vectors",
    invariants: invariantsOf(
      "Diagnostics",
      upTo(10).filter((n) => n !== 4),
    ),
  },
  {
    owner: "@task.V3.T20",
    why: "the canonical byte codec (Codec Q2); T20 builds it with restore and key versions, and its vectors",
    invariants: invariantsOf("Codec", upTo(6)),
  },
  {
    owner: "@task.V3.T22",
    why: "arguments read before any fixture loads (I3), flow.config.ts discovery (I10) and an unchanged project tree (I11); T22 builds them and their static cases",
    invariants: invariantsOf("StaticCli", [3, 10, 11]),
  },
];

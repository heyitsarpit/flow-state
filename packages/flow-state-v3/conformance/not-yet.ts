import { invariantsOf, type NotYet } from "./coverage.ts";

const upTo = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

/**
 * Every core Invariant with no oracle and mutant yet, by the Task that owns it.
 *
 * **Details**
 *
 * The coverage gate fails on an Invariant in no row, and on a row that still lists one an oracle
 * now checks, so each row shrinks as its Task lands. T15's audit reads what is left.
 */
export const notYet: ReadonlyArray<NotYet> = [
  {
    owner: "@task.V3.T7",
    why: "not built yet (round-14 can show each): success writes and store order need a domain-write fixture (I2, I19, I24), old-version holds a Port change to boot another release (I17), an unencodable commit a fixture (I18), late results after cleanup (I23), key-less members (I14); (I9 is checked by a re-send carrying another Attempt)",
    invariants: invariantsOf("WriteLanes", [19]),
  },
  {
    owner: "@task.V3.T8",
    why: "showable on round-14, not built yet (the T8/T7 rows review's H1): compound states and re-entry (I4 to I6; turn.ts exit and entry sets, fixpass and R14-FIX cases), child refusal (I3; turn.ts:321, FRAG-17), pending resets and whenAbandoned (I10, I11; turn.ts:633-652, FRAG-02), determinism by replay (I17), placements by key (I24; P1-S), equal deadlines by arm order (I32; timers.ts, world/clock.ts) and .each copies' per-key timers (I35 in part); I1 is one leaf name on the Port",
    invariants: invariantsOf("Turn", [1, 4, 6, 17, 24, 32, 35]),
  },
  {
    owner: "@task.V3.T18",
    why: "round-14 cannot show these (searched round-14's turn.ts, step.ts, publish.ts and the old suite's scenarios): no check() (I18), no onContext (I28), no issues in snapshots (I31; publish.ts:31-36), no multi-step Schedule (I33), no restartOn (I34); post-commit defects come only from module-hook faults, which the Port refuses (I16)",
    invariants: invariantsOf("Turn", [16, 18, 28, 31, 33, 34]),
  },
  {
    owner: "@task.V3.T21",
    why: "a value outcome of a placement (I25): round-14 has placements but no value-outcome case (Turn Spec T22); searched turn.ts placements and the old suite's phase1s and frag scenarios",
    invariants: invariantsOf("Turn", [25]),
  },
  {
    owner: "@task.V3.T18",
    why: "a seed per boot (WriteLanes I28): round-14 asks its host for every id (adapter.ts host.id; README decision 8), so no round-14 mutant can break the seed; the case can run on round-14 (the adapter mints att-<sessionSeed>-n) but its wrong runtime is a production mutant",
    invariants: invariantsOf("WriteLanes", [28]),
  },
  {
    owner: "@task.V3.T9",
    why: "the Actors area is not built beyond Runtime disposal; I24 is delivered-once's; T42 cut I11, I16 and I18 and added I37 (Free actors end), I38 (never-sent commits at disposal, CQ6) and I39 (identity versions)",
    invariants: invariantsOf(
      "Actors",
      upTo(39).filter((n) => ![11, 16, 18, 24, 29, 30, 31, 32, 35, 36, 38].includes(n)),
    ),
  },
  {
    owner: "@task.V3.T10",
    why: "the WriteAhead area is not built; T42 cut I16 and I18 and added I19 (a Runtime refused scope ownership)",
    invariants: invariantsOf(
      "WriteAhead",
      upTo(19).filter((n) => ![16, 18].includes(n)),
    ),
  },
  {
    owner: "@task.V3.T11",
    why: "the Restore area is not built; I6's lower bound is delivered-once's (CQ11); T42 cut I3 and I4 and added I19 (a changed reset runs first after restore)",
    invariants: invariantsOf(
      "Restore",
      upTo(19).filter((n) => ![3, 4, 6].includes(n)),
    ),
  },
  {
    owner: "@task.V3.T12",
    why: "the Reads area is not built; T42 cut I7, I12 and I18 and added I20 (read endings)",
    invariants: invariantsOf("Reads", [1, 2, 3, 4, 5, 8, 9, 11, 15, 16, 17, 19, 20]),
  },
  {
    owner: "@task.V3.T17",
    why: "round-14 cannot make these results: it throws at the first violation (I3), and has no IdentityFieldOptional or write-scope check, or context wiring (I9, I12, I17; searched round-14's compile and cli/check.ts); T17 builds the compiler that does, and its static cases land before T17 closes",
    invariants: invariantsOf("Compile", [3, 9, 12, 17]),
  },
  {
    owner: "@task.V3.T17",
    why: "round-14 has no Diagnostic carrier, Diagnostic Schema, classification or renderer; T17 builds Diagnostics with the compiler (P4), and the vectors land before T17 closes",
    invariants: invariantsOf(
      "Diagnostics",
      upTo(10).filter((n) => n !== 4),
    ),
  },
  {
    owner: "@task.V3.T20",
    why: "round-14 has no canonical byte codec (Codec Q2); T20 builds the codec with restore and key versions, and the vectors land before T20 closes",
    invariants: invariantsOf("Codec", upTo(6)),
  },
  {
    owner: "@task.V3.T22",
    why: "round-14's CLI loads every fixture before it reads its arguments (I3), has no flow.config.ts discovery (I10) and no project tree to keep unchanged (I11); T22 builds them, and their static cases land before T22 closes",
    invariants: invariantsOf("StaticCli", [3, 10, 11]),
  },
];

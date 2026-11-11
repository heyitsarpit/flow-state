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
    invariants: invariantsOf("WriteLanes", [2, 17, 19, 23, 24]),
  },
  {
    owner: "@task.V3.T18",
    why: "round-14 and the catalog's flat fixtures cannot show these (T8, proposed for the user's read): no compound state (I1, I4 to I6), no Port view of a callback's reads (I12), post-commit defects only from module-hook faults (I16), no pure turn or check() to call (I17, I18), no onContext (I28), no issues in snapshots (I31), timer order left to the host (I32), no multi-step, restartOn or keyed schedules (I33 to I35); production's turn builds them with their cases",
    invariants: invariantsOf("Turn", [1, 4, 5, 6, 12, 16, 17, 18, 28, 31, 32, 33, 34, 35]),
  },
  {
    owner: "@task.V3.T18",
    why: "a seed per boot (WriteLanes I28): round-14 cannot take a seed and asks its host for every id (README decision 8); the seed cases and their wrong runtime are production builds",
    invariants: invariantsOf("WriteLanes", [28]),
  },
  {
    owner: "@task.V3.T21",
    why: "no catalog fixture has fragments or placements (T8, proposed for the user's read): a child part's refusal (I3), pending resets (I10), whenAbandoned (I11), placements and value outcomes (I24, I25); built with fragments and operations",
    invariants: invariantsOf("Turn", [3, 10, 11, 24, 25]),
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
    why: "round-14 cannot make these results: it throws at the first violation (I3), and has no IdentityFieldOptional, SharedContract or write-scope check, or context wiring (I9, I10, I12, I17); T17 builds the compiler that does, and its static cases land before T17 closes",
    invariants: invariantsOf("Compile", [3, 9, 10, 12, 17]),
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

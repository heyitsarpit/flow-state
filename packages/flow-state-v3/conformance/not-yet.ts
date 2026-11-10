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
    why: "WriteLanes rows not built yet: members, members-only, write-before-ending, old-version-holds, the front-end cases; I9 is claimed by lane-queue with no mutant of its own; I22 needs a releasing-lane fixture",
    invariants: invariantsOf("WriteLanes", [2, 4, 5, 7, 9, 10, 13, 14, 17, 18, 19, 22, 23]),
  },
  {
    owner: "@task.V3.T8",
    why: "the Turn area is not built",
    invariants: invariantsOf("Turn", upTo(31)),
  },
  {
    owner: "@task.V3.T9",
    why: "the Actors area is not built beyond Runtime disposal",
    invariants: invariantsOf(
      "Actors",
      upTo(36).filter((n) => ![29, 30, 31, 32, 35, 36].includes(n)),
    ),
  },
  {
    owner: "@task.V3.T10",
    why: "the WriteAhead area is not built",
    invariants: invariantsOf("WriteAhead", upTo(18)),
  },
  {
    owner: "@task.V3.T11",
    why: "the Restore area is not built",
    invariants: invariantsOf("Restore", upTo(18)),
  },
  {
    owner: "@task.V3.T12",
    why: "the Reads area is not built",
    invariants: invariantsOf("Reads", [1, 2, 3, 4, 5, 7, 8, 9, 11, 12, 15, 16, 17, 18, 19]),
  },
  {
    owner: "@task.V3.T13",
    why: "round-14 makes no such result: it throws at the first violation (I3), runs creation and restore only in a runtime (I7, I8), and has no IdentityFieldOptional, SharedContract, write-scope, name or app check, or context wiring (I9, I10, I12, I13, I14, I17); each case lands with the surface that makes it",
    invariants: invariantsOf("Compile", [3, 7, 8, 9, 10, 12, 13, 14, 17]),
  },
  {
    owner: "@task.V3.T13",
    why: "round-14 has no Diagnostic carrier, Diagnostic Schema, classification or renderer, and no canonical byte codec (Codec Q2); the vectors land with the production surface",
    invariants: [...invariantsOf("Diagnostics", upTo(10)), ...invariantsOf("Codec", upTo(6))],
  },
  {
    owner: "@task.V3.T13",
    why: "the StaticCli cases (check rules, exit codes, streams, the graph gate) are not built",
    invariants: invariantsOf("StaticCli", upTo(12)),
  },
];

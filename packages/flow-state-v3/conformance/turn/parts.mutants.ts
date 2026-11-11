import type { Mutant } from "../dsl/oracle.ts";

/**
 * Wrong runtimes the part cases' own expectations must catch.
 */
export const partsMutants: ReadonlyArray<Mutant> = [
  {
    name: "part.child-refusal-ignored",
    says: "a raise a child cannot react to is skipped, and the parent's turn commits",
    expects: "Turn I3",
    runtime: "prototype",
    cases: ["TURN-05/child-refusal"],
    edits: [
      {
        file: "turn.ts",
        find: '    if ("denied" in s) throw refused(alt.at, `${part} cannot react to ${r.event}`);',
        replace: '    if ("denied" in s) continue;',
      },
    ],
  },
  {
    name: "part.abandoned-skips-callbacks",
    says: "an incarnation a turn ends never runs its whenAbandoned",
    expects: "Turn I11",
    runtime: "prototype",
    cases: ["TURN-05/removed-copy-ends-once"],
    edits: [
      {
        file: "turn.ts",
        find: "    const wa = frag.whenAbandoned;",
        replace: "    const wa = undefined as typeof frag.whenAbandoned;",
      },
    ],
  },
  {
    name: "part.pending-reset-dropped",
    says: "a key a part writes never runs its pending reset as a turn of its own",
    expects: "Turn I10",
    runtime: "prototype",
    cases: ["TURN-05/a-part-writing-the-key-is-a-pending-reset"],
    edits: [
      {
        file: "turn.ts",
        find: '  const loops: Mail[] = [...(reset ? [{ k: "recheck" as const, actor: w.a.key }] : [])];',
        replace: "  const loops: Mail[] = [];",
      },
    ],
  },
];

import type { Mutant } from "../dsl/oracle.ts";

/**
 * Wrong runtimes the `evidence-kinds` oracle must catch.
 */
export const evidenceKindsMutants: ReadonlyArray<Mutant> = [
  {
    name: "lane.superseded-delivered",
    says: "under latest, a superseded queued commit's ending is also delivered, labelled NotSent { Overloaded }",
    expects: "WriteLanes I4",
    runtime: "prototype",
    cases: ["LANE-06"],
    edits: [
      {
        file: "lane.ts",
        find: '  if (policy === "latest") {\n    for (const x of l.w) supersede(tx, a.op, x);',
        replace:
          '  if (policy === "latest") {\n    for (const x of l.w) {\n      supersede(tx, a.op, x);\n      toMail(tx, l, x, declined("Overloaded"));\n    }',
      },
    ],
  },
];

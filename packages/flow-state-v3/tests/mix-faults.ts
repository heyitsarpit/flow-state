import type { Fault } from "./faults.ts";

/**
 * Wrong runtimes only several fixtures in one Runtime can show: a write batch that carries records
 * of two apps, told apart by their machines' namespaces, and is refused. Each fixture's machines
 * share one namespace, so no fixture alone can show it.
 */
export const mixFaults: ReadonlyArray<Fault> = [
  {
    name: "refusal-reaches-first-namespace-only",
    tests: ["tests/generated/mix.test.ts"],
    says: "a refused batch answers refused only the tickets of its first ticket's namespace (a machine id up to its first slash); another app's capture in it is answered landed and sent",
    rule: "WriteAhead I15",
    edits: [
      {
        file: "src/host/edge.ts",
        find: "        for (const t of tickets) options.answered(t.id, landed);\n",
        replace: [
          "        const machineOf = (t: (typeof tickets)[number]) =>",
          "          writes",
          '            .find((w) => w.key.startsWith("lane/") && t.purpose !== "flush" && Option.exists(w.record, (r) => r.includes(`\\"attempt\\":\\"${t.attempt}\\"`)))',
          '            ?.key.split("/")[1];',
          "        const first = tickets[0] === undefined ? undefined : machineOf(tickets[0]);",
          "        for (const t of tickets) {",
          "          const own = machineOf(t);",
          "          options.answered(t.id, landed || (own !== undefined && first !== undefined && own !== first));",
          "        }",
          "",
        ].join("\n"),
      },
    ],
  },
];

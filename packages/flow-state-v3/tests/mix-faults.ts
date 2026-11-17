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
        find: "          if (!landed) again = new Map([...marks, ...again]);\n          settle(carried, landed);\n",
        replace: [
          "          if (!landed) again = new Map([...marks, ...again]);",
          "        const machineOf = (t: (typeof carried)[number]) =>",
          "          writes",
          '            .find((w) => w.key.startsWith("lane/") && t.purpose !== "flush" && Option.exists(w.record, (r) => r.includes(`\\"attempt\\":\\"${t.attempt}\\"`)))',
          '            ?.key.split("/")[1];',
          "        const first = carried[0] === undefined ? undefined : machineOf(carried[0]);",
          "        const wrong = carried.filter((t) => {",
          "          const own = machineOf(t);",
          "          return !landed && own !== undefined && first !== undefined && own !== first;",
          "        });",
          "        for (const t of wrong) options.answered(t.id, true);",
          "        settle(carried.filter((t) => !wrong.includes(t)), landed);",
          "",
        ].join("\n"),
      },
    ],
  },
];

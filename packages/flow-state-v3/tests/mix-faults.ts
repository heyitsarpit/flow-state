import type { Fault } from "./faults.ts";

/**
 * Wrong runtimes only several fixtures in one Runtime can show: a write batch that carries two
 * machines' records and is refused.
 */
export const mixFaults: ReadonlyArray<Fault> = [
  {
    name: "refusal-reaches-first-machine-only",
    tests: ["tests/generated/mix.test.ts"],
    says: "a refused batch answers refused only its first machine's tickets; another machine's capture in it is answered landed and sent",
    rule: "WriteAhead I15",
    edits: [
      {
        file: "src/host/edge.ts",
        find: "        for (const t of tickets) options.answered(t.id, landed);\n",
        replace: [
          "        const machineOf = (t: (typeof tickets)[number]) =>",
          "          writes",
          '            .find((w) => w.key.startsWith("lane/") && t.purpose !== "flush" && Option.exists(w.record, (r) => r["attempt"] === t.attempt))',
          '            ?.key.split("|")[0]?.split("/").slice(1, -1).join("/");',
          "        const first = tickets[0] === undefined ? undefined : machineOf(tickets[0]);",
          "        for (const t of tickets) options.answered(t.id, landed || machineOf(t) !== first);",
          "",
        ].join("\n"),
      },
    ],
  },
];

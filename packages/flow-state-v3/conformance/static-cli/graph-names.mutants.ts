import type { Mutant } from "../dsl/oracle.ts";

/**
 * Wrong CLIs and runtimes the graph gate must catch: each names an alternative one way in
 * `flow graph` and another in the turn record.
 *
 * **Details**
 *
 * The first edits the graph the CLI prints (`prototypes/conformance/graph.ts`), the second the
 * turn record the runtime writes (`round-14/turn.ts`); either alone breaks the shared name.
 */
export const graphNamesMutants: ReadonlyArray<Mutant> = [
  {
    name: "cli.graph-renames-edge",
    says: "flow graph names each edge by its place with a trailing mark the turn record lacks",
    expects: "StaticCli I2",
    runtime: "prototype",
    cases: ["PAY-01", "PAY-02"],
    edits: [
      {
        file: "../conformance/graph.ts",
        find: "            at: a.at.path,",
        replace: "            at: `${a.at.path}#`,",
      },
    ],
  },
  {
    name: "turn.record-renames-alternative",
    says: "the turn record names the alternative that ran by an index of its own, not its place",
    expects: "StaticCli I2",
    runtime: "prototype",
    cases: ["PAY-01", "PAY-02"],
    edits: [
      {
        file: "turn.ts",
        find: "at: p.alt.at.path, node: p.node",
        replace: "at: `alt-${w.parts.indexOf(p)}`, node: p.node",
      },
    ],
  },
];

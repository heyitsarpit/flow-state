import type { Fault } from "./faults.ts";

const INDEX = "tests/compile/index.test.ts";

/**
 * Wrong typed-machine indexes: a node's chain that drops its ancestors, handled tags that drop the
 * root's, and an initial leaf taken from the first state instead of the authored default.
 */
export const typedMachineFaults: ReadonlyArray<Fault> = [
  {
    name: "index-chain-stale",
    tests: [INDEX],
    says: "a node's chain holds only its own path, so a state below the top level loses its ancestors",
    rule: "Types I10",
    edits: [
      {
        file: "src/compile-index.ts",
        find: "    chains.set(node.path, [...above, node.path]);",
        replace: "    chains.set(node.path, [node.path]);",
      },
    ],
  },
  {
    name: "handled-tags-root-dropped",
    tests: [INDEX],
    says: "the handled tags leave out the root's handlers, so an event only the root handles reads as unhandled",
    rule: "Types I10",
    edits: [
      {
        file: "src/compile-index.ts",
        find: "  const levels: ReadonlyArray<Level> = [walked.root, ...walked.nodes.map((n) => n.on)];",
        replace: "  const levels: ReadonlyArray<Level> = walked.nodes.map((n) => n.on);",
      },
    ],
  },
  {
    name: "initial-first-state",
    tests: [INDEX],
    says: "the initial leaf is the first state's, not the one the authored root default reaches",
    rule: "Types I10",
    edits: [
      {
        file: "src/compile-index.ts",
        find: "    initial: leaves.get(walked.initial) ?? walked.initial,",
        replace: "    initial: [...leaves.values()][0] ?? walked.initial,",
      },
    ],
  },
];

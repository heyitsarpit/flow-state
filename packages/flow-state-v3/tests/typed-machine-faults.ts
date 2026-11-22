import type { Fault } from "./faults.ts";

const INDEX = "tests/compile/index.test.ts";

const CROSSINGS = "tests/surface/derivation.test.ts";

/**
 * Wrong typed-machine shapes: a node's chain that drops its ancestors, handled tags that drop the
 * root's, and a cast outside the named crossings, written as a next-line or a block disable.
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
    name: "cast-outside-crossing",
    tests: [CROSSINGS],
    says: "a function casts an erased value back to its typed form outside door and slot",
    rule: "Types R13",
    edits: [
      {
        file: "src/send.ts",
        find: '  ): SendToken<M, P> => made("send", SENDS, {}, { to, event } satisfies SendInternals),',
        replace:
          '  ): SendToken<M, P> =>\n    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- planted\n    made("send", SENDS, {}, { to, event } satisfies SendInternals) as SendToken<M, P>,',
      },
    ],
  },
  {
    name: "cast-under-block-disable",
    tests: [CROSSINGS],
    says: "a cast hides under a block disable, which a count of next-line disables misses",
    rule: "Types T7",
    edits: [
      {
        file: "src/send.ts",
        find: '  ): SendToken<M, P> => made("send", SENDS, {}, { to, event } satisfies SendInternals),',
        replace:
          '  ): SendToken<M, P> =>\n    /* oxlint-disable typescript/no-unsafe-type-assertion */\n    made("send", SENDS, {}, { to, event } satisfies SendInternals) as SendToken<M, P>,',
      },
    ],
  },
];

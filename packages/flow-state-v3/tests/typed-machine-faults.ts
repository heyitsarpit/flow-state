import type { Fault } from "./faults.ts";

const INDEX = "tests/compile/index.test.ts";

const CROSSINGS = "tests/surface/derivation.test.ts";

const EXCESS = "tests/types/excess-keys.test-d.ts";

const DERIVED = "tests/types/derived.test-d.ts";

const TESTING = "tests/types/testing.test-d.ts";

/**
 * Wrong typed-machine shapes: a node's chain that drops its ancestors, handled tags that drop the
 * root's, a cast outside the named crossings, written as a next-line or a block disable, a body
 * whose misspelt keys the types no longer refuse, and declared fields renamed under the helpers
 * that read them, each of which must stop compiling.
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
  {
    name: "body-capture-dropped",
    tests: [EXCESS],
    says: "machine checks the body only against its slots, so a misspelt key beside a right one compiles",
    rule: "Types R2",
    edits: [
      {
        file: "src/machine.ts",
        find: "[MachineBody<D>] extends [B] ? B : B & Exact<B, MachineBody<D>>",
        replace: "B",
      },
    ],
  },
  {
    name: "sync-repo-renamed",
    tests: [DERIVED],
    says: "Sync's SyncRepo payload names its field repository, so a helper still reading repo is wrong",
    rule: "Types R1",
    edits: [
      {
        file: "fixtures/sync/machines/sync.ts",
        find: "    SyncRepo: { repo: Schema.String },",
        replace: "    SyncRepo: { repository: Schema.String },",
      },
    ],
  },
  {
    name: "account-renamed",
    tests: [TESTING, "tests/transfers/standing-order.test.ts"],
    says: "StandingOrder's memory names its account accountId, so a helper still reading account is wrong",
    rule: "Types R1",
    edits: [
      {
        file: "fixtures/transfers/machines/standing-order.ts",
        find: '    account: Flow.initial(Schema.String, ""),',
        replace: '    accountId: Flow.initial(Schema.String, ""),',
      },
    ],
  },
  {
    name: "receipt-renamed",
    tests: [TESTING, "tests/transfers/bank-app.test.ts"],
    says: "the bank answers a transfer with ref, so the ending mapper still reading receipt is wrong",
    rule: "Types R1",
    edits: [
      {
        file: "fixtures/transfers/services.ts",
        find: "export const Receipt = Schema.Struct({ receipt: Schema.String });",
        replace: "export const Receipt = Schema.Struct({ ref: Schema.String });",
      },
      {
        file: "fixtures/transfers/server/bank.ts",
        find: "if (known !== undefined) return { truth, exit: Exit.succeed({ receipt: known }) };",
        replace: "if (known !== undefined) return { truth, exit: Exit.succeed({ ref: known }) };",
      },
      {
        file: "fixtures/transfers/server/bank.ts",
        find: "          exit: Exit.succeed({ receipt }),",
        replace: "          exit: Exit.succeed({ ref: receipt }),",
      },
    ],
  },
];

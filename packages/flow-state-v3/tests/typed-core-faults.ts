import type { Fault } from "./faults.ts";

/**
 * Wrong core shapes: a chain id counted from the live chains, forget dropping a record it could not
 * read, Flow's restored marker read from a reason, every owner the root, and a bench worker that
 * takes any flag.
 */
export const typedCoreFaults: ReadonlyArray<Fault> = [
  {
    name: "chain-id-from-count",
    tests: ["src/core/serve.test.ts"],
    says: "a chain id is one past the live chains, so after a partial clear a new chain resets a live chain's count",
    rule: "Actors R13",
    edits: [
      {
        file: "src/core/tx.ts",
        find: "    world.chainCount += 1;",
        replace: "    world.chainCount = world.chains.size + 1;",
      },
    ],
  },
  {
    name: "forget-drops-unreadable",
    tests: ["src/core/ledger.test.ts"],
    says: "forget drops every quarantined lane record, a record it could not read included",
    rule: "Actors R21",
    edits: [
      {
        file: "src/core/incarnations.ts",
        find: "        Unreadable: () => [],",
        replace: '        Unreadable: () => [{ record, operation: "", lane: "" }],',
      },
    ],
  },
  {
    name: "restored-by-reason",
    tests: ["src/core/ledger.test.ts"],
    says: "Flow's restored marker is read from the reason, so a host's reason spelled Restored writes the owed record",
    rule: "WriteLanes I15",
    edits: [
      {
        file: "src/core/ledger.ts",
        find: "  SAVED_DELIVERY[row.delivery._tag] || SAVED_ORIGIN[row.origin._tag];",
        replace:
          '  SAVED_DELIVERY[row.delivery._tag] || SAVED_ORIGIN[row.origin._tag] || Reflect.get(row, "reason") === "Restored";',
      },
    ],
  },
  {
    name: "owner-always-root",
    tests: ["tests/write-lanes/payment-leave-and-reload.test.ts"],
    says: "the work a state starts is owned by the root, so an ending is never late and a late turn leaves its state",
    rule: "Turn R21",
    edits: [
      {
        file: "src/core/serve.ts",
        find: "            onSome: (activation) => OwnedBy.State({ activation }),",
        replace: "            onSome: () => OwnedBy.Root(),",
      },
    ],
  },
  {
    name: "worker-takes-any-flag",
    tests: ["tests/bench/worker-args.test.ts"],
    says: "the bench worker skips a flag it does not know, so a flag renamed by the run is dropped",
    rule: "Bench worker arguments",
    edits: [
      {
        file: "bench/worker-args.ts",
        find: "          strict: true,",
        replace: "          strict: false,",
      },
    ],
  },
];

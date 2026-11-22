import type { Fault } from "./faults.ts";

/**
 * Wrong runtimes around one owner of each fact: a start that does not adopt, a boot that unparks
 * its own rows, an owed row never queued, a lane's record kept on disk, a batch per identity, or a
 * second batch out; each planted alone like the runtime's other faults.
 */
export const consolidationFaults: ReadonlyArray<Fault> = [
  {
    name: "adopted-ending-late",
    tests: ["tests/actors/lane-keeping.test.ts"],
    says: "a start keeps an adopted head's dead owner, so its later ending is routed late",
    rule: "Turn I26",
    edits: [
      {
        file: "src/core/ledger.ts",
        find: "head: { ...lane.head, owner: OwnedBy.Root() } });",
        replace: "head: lane.head });",
      },
    ],
  },
  {
    name: "boot-unparks",
    tests: ["tests/actors/runtime-disposal.test.ts"],
    says: "a boot reports its decoded Waiting rows Unparked itself, before any start",
    rule: "Actors R10",
    edits: [
      {
        file: "src/core/ledger.ts",
        find: "    for (const { kept, ...row } of rows)\n",
        replace:
          "    for (const { kept, ...row } of rows)\n      if (!kept) tx.act(Act.RowQueued({ row }));\n    for (const { kept, ...row } of rows)\n",
      },
    ],
  },
  {
    name: "owed-row-never-queued",
    tests: ["tests/stories/fake.test.ts", "tests/write-lanes/payment-endings.test.ts"],
    says: "a live ending's row is Queued with no mail reference, so it sits unsaved past its step",
    rule: "WriteAhead I20",
    edits: [
      {
        file: "src/core/ledger.ts",
        find: "      tx.enqueue(Mail.Ending({ actor: row.actor, id: row.id }));",
        replace: "      void Mail;",
      },
    ],
  },
  {
    name: "dropped-lane-kept-on-disk",
    tests: ["tests/actors/runtime-disposal.test.ts"],
    says: "a lane that ends writes no record removal, so its old record outlives it on disk",
    rule: "WriteAhead I21",
    edits: [
      {
        file: "src/core/persist.ts",
        find: "    tx.dropLane(id);\n    saveLane(lane.actor, id);",
        replace: "    tx.dropLane(id);\n    void lane;",
      },
    ],
  },
  {
    name: "one-identity-per-batch",
    tests: ["tests/write-lanes/write-ahead-scope.test.ts"],
    says: "a capture's batch holds only the first marked identity's records",
    rule: "WriteAhead I23",
    edits: [
      {
        file: "src/core/persist.ts",
        find: "    const writes = went.flatMap((w) => w.writes);",
        replace: "    const writes = went.slice(0, 1).flatMap((w) => w.writes);",
      },
    ],
  },
  {
    name: "two-batches-out",
    tests: ["tests/write-lanes/write-ahead-scope.test.ts"],
    says: "the edge issues a batch while another is still out",
    rule: "WriteAhead I23",
    edits: [
      {
        file: "src/host/edge.ts",
        find: "  const pump = () => {\n    if (out) return;",
        replace: "  const pump = () => {",
      },
    ],
  },
];

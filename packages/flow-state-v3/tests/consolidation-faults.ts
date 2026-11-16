import type { Fault } from "./faults.ts";

/**
 * Wrong runtimes that give a fact a second owner: a second record writer, a second holder of owed
 * rows, a second builder of reports, a batch per identity, or a start that does not adopt; each
 * planted alone like the runtime's other faults.
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
        find: "head: { ...lane.head, owner: ROOT_ACTIVATION } });",
        replace: "head: lane.head });",
      },
    ],
  },
  {
    name: "boot-unparks",
    tests: ["tests/stories/storage.test.ts", "tests/write-lanes/payment-leave-and-reload.test.ts"],
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
    name: "rows-dropped-outside-ledger",
    tests: ["tests/write-lanes/one-builder.test.ts"],
    says: "a forget clears the identity's owed rows itself instead of closing them in the ledger",
    rule: "WriteLanes R10",
    edits: [
      {
        file: "src/core/incarnations.ts",
        find: "    ledger.suspend(actor, forgetting);",
        replace:
          "    if (forgetting) tx.set({ ...tx.world(), owed: tx.world().owed });\n    else ledger.suspend(actor, false);",
      },
    ],
  },
  {
    name: "second-record-writer",
    tests: ["tests/write-lanes/one-builder.test.ts"],
    says: "an incarnation's end writes its records itself, outside the step-end projection",
    rule: "WriteAhead I21",
    edits: [
      {
        file: "src/core/incarnations.ts",
        find: "    ledger.suspend(actor, false);",
        replace:
          "    tx.command(Command.Persist({ writes: [], due: Due.Now() }));\n    ledger.suspend(actor, false);",
      },
    ],
  },
  {
    name: "second-report-builder",
    tests: ["tests/write-lanes/one-builder.test.ts"],
    says: "the disposal builds its RuntimeDisposed report itself, not from an act",
    rule: "WriteLanes composition",
    edits: [
      {
        file: "src/core/disposal.ts",
        find: "    tx.act(Act.RuntimeEnded());",
        replace: "    tx.insertEvidence(Evidence.RuntimeDisposed());",
      },
    ],
  },
  {
    name: "one-identity-per-batch",
    tests: ["tests/write-lanes/write-ahead-scope.test.ts"],
    says: "a step's write list holds only the first touched identity's records",
    rule: "WriteAhead I23",
    edits: [
      {
        file: "src/core/persist.ts",
        find: "writes: all.flatMap(writesOf),",
        replace: "writes: all.slice(0, 1).flatMap(writesOf),",
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
        find: "    if (pending.out || pending.dirty.size === 0) return;",
        replace: "    if (pending.dirty.size === 0) return;",
      },
    ],
  },
];

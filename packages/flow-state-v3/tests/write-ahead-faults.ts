import type { Fault } from "./faults.ts";

/**
 * Wrong runtimes for write-ahead: a send or a batch that does not wait for the store, a record a
 * step changed and did not write, a capture that undercounts its re-send, a refusal or a landing
 * that strands dirty records, and a cancelled bootstrap that fails as its service did.
 */
export const writeAheadFaults: ReadonlyArray<Fault> = [
  {
    name: "acknowledged-before-landing",
    tests: ["tests/stories/storage.test.ts", "tests/write-lanes/write-ahead-records.test.ts"],
    says: "the edge answers a batch's tickets landed as it issues the batch",
    rule: "WriteAhead I15",
    edits: [
      {
        file: "src/host/edge.ts",
        find: '    fibers.fork(\n      "store",',
        replace:
          '    for (const t of tickets) options.answered(t.id, true);\n    fibers.fork(\n      "store",',
      },
    ],
  },
  {
    name: "batch-never-out",
    tests: ["tests/write-lanes/write-ahead-records.test.ts"],
    says: "an issued batch is not marked out, so the next one goes while it is held",
    rule: "WriteAhead I23",
    edits: [
      {
        file: "src/host/edge.ts",
        find: "    pending = { dirty: new Map(), tickets: [], out: true, due: Number.POSITIVE_INFINITY };",
        replace:
          "    pending = { dirty: new Map(), tickets: [], out: false, due: Number.POSITIVE_INFINITY };",
      },
    ],
  },
  {
    name: "refused-capture-left-in-flight",
    tests: ["tests/write-lanes/write-ahead-records.test.ts"],
    says: "a re-send whose capture is refused goes back to Held without a write",
    rule: "WriteAhead R5",
    edits: [
      {
        file: "src/core/lane-moves.ts",
        find: "        setLane(at.id, { ...lane, head: { ...lane.head, phase: Phase.Held() } });\n        // Owed",
        replace:
          "        sendLane(at.id, { ...lane, head: { ...lane.head, phase: Phase.Held() } });\n        // Owed",
      },
    ],
  },
  {
    name: "start-keeps-lanes-unwritten",
    tests: ["tests/transfers/trace.test.ts"],
    says: "a start adopts its lanes without a write, so a head restored Held stays in flight on disk",
    rule: "WriteAhead R5",
    edits: [
      {
        file: "src/core/ledger.ts",
        find: "      persistence.setLane(id, { ...lane, head: { ...lane.head, owner: ROOT_ACTIVATION } });",
        replace:
          "      persistence.sendLane(id, { ...lane, head: { ...lane.head, owner: ROOT_ACTIVATION } });",
      },
    ],
  },
  {
    name: "resend-capture-uncounted",
    tests: [
      "tests/write-lanes/write-ahead-records.test.ts",
      "tests/write-lanes/lane-anchors.test.ts",
    ],
    says: "the capture a re-send waits for carries the count before that re-send",
    rule: "WriteAhead R13",
    edits: [
      {
        file: "src/core/record.ts",
        find: '              retryCount: l.head.retryCount + (Phase.$is("Recapturing")(l.head.phase) ? 1 : 0),',
        replace: "              retryCount: l.head.retryCount,",
      },
    ],
  },
  {
    name: "refused-batch-waits",
    tests: ["tests/write-lanes/write-ahead-records.test.ts"],
    says: "a refused batch's records wait for the next accepted write, however long",
    rule: "WriteAhead I12",
    edits: [
      {
        file: "src/host/edge.ts",
        find: "        if (!landed) wakeAt(clock.currentTimeMillisUnsafe() + RETRY_MS);\n",
        replace: "",
      },
    ],
  },
  {
    name: "landing-discharges-every-dirty",
    tests: ["tests/write-lanes/write-ahead-records.test.ts"],
    says: "a landed batch clears every dirty record, the ones it did not carry included",
    rule: "WriteAhead I23",
    edits: [
      {
        file: "src/host/edge.ts",
        find: "        const dirty = new Map(pending.dirty);\n\n        if (!landed)",
        replace:
          "        const dirty = new Map(landed ? [] : pending.dirty);\n\n        if (!landed)",
      },
    ],
  },
  {
    name: "firing-unwritten",
    tests: ["tests/write-lanes/write-ahead-records.test.ts"],
    says: "a schedule's firing drops it from the incarnation with no record write",
    rule: "WriteAhead I21",
    edits: [
      {
        file: "src/core/serve.ts",
        find: "        setIncarnation(left);",
        replace:
          "        tx.set({ ...tx.world(), incarnations: new Map([...tx.world().incarnations, [actorKey(actor), left]]) });",
      },
    ],
  },
  {
    name: "queued-rows-unsaved",
    tests: ["src/core/persist.test.ts"],
    says: "a step that ends with rows still in the mailbox writes no owed record for them",
    rule: "WriteAhead I20",
    edits: [
      {
        file: "src/core/persist.ts",
        find: "      if (waiting !== undefined) saveOwed(waiting.actor);",
        replace: "      void waiting;",
      },
    ],
  },
  {
    name: "unencodable-identity-half-written",
    tests: ["src/core/persist.test.ts"],
    says: "an identity whose actor record cannot encode still writes its lanes and owed record",
    rule: "WriteAhead I11",
    edits: [
      {
        file: "src/core/persist.ts",
        find: "    return Result.all([...recordWrites(t), ...[...t.lanes].map(laneWrite), ...owed]);",
        replace:
          "    return Result.all([...recordWrites(t).filter(Result.isSuccess), ...[...t.lanes].map(laneWrite), ...owed]);",
      },
    ],
  },
  {
    name: "heard-mailbox-row-kept-on-disk",
    tests: ["src/core/persist.test.ts"],
    says: "a row saved while in the mailbox is heard later with no owed write, so a reload hears it again",
    rule: "WriteAhead I22",
    edits: [
      {
        file: "src/core/ledger.ts",
        find: "    if (isSaved(row) || isSaved({ ...row, delivery }) || onRecord(row))",
        replace: "    if (isSaved(row) || isSaved({ ...row, delivery }))",
      },
    ],
  },
  {
    name: "end-while-withheld",
    tests: ["src/core/persist.test.ts", "tests/restore/unencodable.test.ts"],
    says: "a free actor whose records are held back ends at its grace",
    rule: "Actors R8",
    edits: [
      {
        file: "src/core/incarnations.ts",
        find: "    if (incarnation === undefined || tx.world().withheld.has(actorKey(actor))) return;",
        replace: "    if (incarnation === undefined) return;",
      },
    ],
  },
  {
    name: "default-interval-zero",
    tests: ["tests/write-lanes/write-ahead-records.test.ts"],
    says: "a setup with no captureMs writes plain memory at once",
    rule: "WriteAhead I12",
    edits: [
      {
        file: "src/host/runtime.ts",
        find: "    captureMs: config.persistence?.captureMs ?? 5000,",
        replace: "    captureMs: config.persistence?.captureMs ?? 0,",
      },
    ],
  },
  {
    name: "interval-debounced",
    tests: ["tests/write-lanes/write-ahead-records.test.ts"],
    says: "each new dirty record pushes the plain batch back a whole interval",
    rule: "WriteAhead I12",
    edits: [
      {
        file: "src/host/edge.ts",
        find: "    if (at >= pending.due) return;",
        replace: "    if (pending.out) return;",
      },
    ],
  },
  {
    name: "cancelled-boot-fails-as-service",
    tests: ["src/host/life.test.ts"],
    says: "a bootstrap the disposal cancelled fails ready with its service's error",
    rule: "Actors T24",
    edits: [
      {
        file: "src/host/runtime.ts",
        find: "            Reject: ({ code }) => rejected(code),\n            Run: () => failed,",
        replace: "            Reject: () => failed,\n            Run: () => failed,",
      },
    ],
  },
];

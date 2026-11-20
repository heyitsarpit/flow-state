import type { Fault } from "./faults.ts";

/**
 * Wrong runtimes for write-ahead: a send or a batch that does not wait for the store, a record a
 * step changed and did not write, a capture that skips, forgets or answers what it should carry,
 * that undercounts its re-send or serves mail, a refusal that strands marked records, and a
 * cancelled bootstrap that fails as its service did.
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
        find: '      work.fork(\n        "store",',
        replace:
          '      for (const t of carried) options.answered(t.id, true);\n      work.fork(\n        "store",',
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
        find: "    out = true;\n    options.capture(carried, keys);",
        replace: "    out = false;\n    options.capture(carried, keys);",
      },
    ],
  },
  {
    name: "refused-capture-left-in-flight",
    tests: ["tests/write-lanes/write-ahead-records.test.ts"],
    says: "a re-send whose capture is refused stays Recapturing, its lane record in flight",
    rule: "WriteAhead R5",
    edits: [
      {
        file: "src/core/lane-moves.ts",
        find: "        setLane(at.id, { ...lane, head: { ...lane.head, phase: Phase.Held() } });\n        // Owed",
        replace: "        setLane(at.id, lane);\n        // Owed",
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
        find: "      persistence.setLane(id, { ...lane, head: { ...lane.head, owner: OwnedBy.Root() } });",
        replace:
          "      persistence.sendLane(id, { ...lane, head: { ...lane.head, owner: OwnedBy.Root() } });",
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
        find: '            retryCount: l.head.retryCount + (Phase.$is("Recapturing")(l.head.phase) ? 1 : 0),',
        replace: "            retryCount: l.head.retryCount,",
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
        find: "    if (!landed)\n      work.fork(RETRY,",
        replace: "    if (landed)\n      work.fork(RETRY,",
      },
    ],
  },
  {
    name: "capture-unmarks-withheld",
    tests: ["src/core/persist.test.ts", "tests/write-lanes/write-ahead-records.test.ts"],
    says: "a capture unmarks every key, a withheld identity's included, so its records are never written",
    rule: "WriteAhead I21",
    edits: [
      {
        file: "src/core/persist.ts",
        find: '      tx.replace("marked", new Map(held.flatMap((h) => h.keys)));',
        replace: '      tx.replace("marked", new Map());',
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
        find: "      Result.isSuccess(written) ? [{ keys, writes: written.success }] : [],",
        replace:
          "      Result.isSuccess(written)\n        ? [{ keys, writes: written.success }]\n        : [{ keys: [], writes: keys.flatMap(([, m]) => Option.toArray(Result.getSuccess(writeOf(m)))) }],",
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
    says: "a free actor whose actor record cannot encode ends at its grace",
    rule: "Actors R8",
    edits: [
      {
        file: "src/core/incarnations.ts",
        find: "    if (incarnation === undefined || !persistence.encodes(actor)) return;",
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
        find: "    captureMs: config.persistence?.captureMs ?? Duration.toMillis(RuntimeDefaults.captureInterval),",
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
        find: "    if (!earlier) return;\n    wake = Wake.At({ at });",
        replace: "    if (out) return;\n    wake = Wake.At({ at });",
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
        find: "              onSome: ({ code }) => Effect.fail(rejected(code)),",
        replace: "              onSome: () => Effect.fail(error),",
      },
    ],
  },
  {
    name: "capture-skips-marked-key",
    tests: ["src/core/persist.test.ts", "tests/write-lanes/write-ahead-records.test.ts"],
    says: "a capture leaves out the first marked key, so a record a step changed is never written",
    rule: "WriteAhead I21",
    edits: [
      {
        file: "src/core/persist.ts",
        find: "    for (const entry of new Map([...again, ...tx.world().marked])) {",
        replace:
          "    for (const entry of [...new Map([...again, ...tx.world().marked])].slice(1)) {",
      },
    ],
  },
  {
    name: "hide-does-nothing",
    tests: ["src/host/hidden.test.ts", "tests/transfers/visibility.test.ts"],
    says: "a hidden page's listener issues nothing, so marked records wait for the capture interval",
    rule: "WriteAhead T5",
    edits: [
      {
        file: "src/host/edge.ts",
        find: "      if (!out && (tickets.length > 0 || marked || again.size > 0)) issue();\n    }),",
        replace: "      if (out && tickets.length < 0) issue();\n    }),",
      },
    ],
  },
  {
    name: "hide-waits",
    tests: ["src/host/hidden.test.ts", "tests/transfers/visibility.test.ts"],
    says: "a hidden page's listener waits for the capture interval instead of issuing at once",
    rule: "WriteAhead T5",
    edits: [
      {
        file: "src/host/edge.ts",
        find: "      if (!out && (tickets.length > 0 || marked || again.size > 0)) issue();\n    }),",
        replace:
          "      if (!out && (tickets.length > 0 || marked || again.size > 0))\n        wakeAt(clock.currentTimeMillisUnsafe() + options.captureMs);\n    }),",
      },
    ],
  },
  {
    name: "idb-landed-on-complete",
    tests: ["src/host/platform/indexeddb.test.ts"],
    says: "the IndexedDB adapter answers a batch landed when its transaction completes, though a request failed",
    rule: "WriteAhead R12",
    edits: [
      {
        file: "src/host/platform/indexeddb.ts",
        find: '        Option.match(failed, {\n          onSome: Effect.fail,\n          onNone: () =>\n            succeeded === requests.length\n              ? value()\n              : Effect.fail(new StoreRefused({ reason: "aborted" })),\n        }),',
        replace: "        value(),",
      },
    ],
  },
  {
    name: "idb-load-without-commit",
    tests: ["src/host/platform/indexeddb.test.ts"],
    says: "the IndexedDB adapter's load leaves its transaction to autocommit",
    rule: "WriteAhead R12",
    edits: [
      {
        file: "src/host/platform/indexeddb.ts",
        find: "        return answerOf(tx, [keys, values], () =>",
        replace:
          "        return answerOf({ ...tx, commit: () => undefined }, [keys, values], () =>",
      },
    ],
  },
  {
    name: "fake-store-drops-last-write",
    tests: ["tests/restore/store-contract.test.ts"],
    says: "the fake Store Layer drops the last write of every batch",
    rule: "WriteAhead R12",
    edits: [
      {
        file: "src/host/testing/fake.ts",
        find: "                for (const w of batch)",
        replace: "                for (const w of batch.slice(0, -1))",
      },
    ],
  },
  {
    name: "hidden-refused-retried-at-once",
    tests: ["src/host/hidden.test.ts", "tests/transfers/visibility.test.ts"],
    says: "on a hidden page a refused batch's keys are captured again at once, in a loop",
    rule: "WriteAhead R10",
    edits: [
      {
        file: "src/host/edge.ts",
        find: "(again.size > 0 && due())",
        replace: "(again.size > 0 && (due() || host.hidden()))",
      },
    ],
  },
  {
    name: "hidden-held-marks-wait",
    tests: ["src/host/hidden.test.ts", "tests/transfers/visibility.test.ts"],
    says: "a hidden page's marks wait for the capture interval once a held batch answers",
    rule: "WriteAhead I12",
    edits: [
      {
        file: "src/host/edge.ts",
        find: "(marked && (due() || host.hidden()))",
        replace: "(marked && due())",
      },
    ],
  },
  {
    name: "refused-batch-forgotten",
    tests: ["tests/write-lanes/write-ahead-records.test.ts", "src/host/ledger.test.ts"],
    says: "a refused batch's keys are not captured again, so its records wait for their next change",
    rule: "WriteAhead I21",
    edits: [
      {
        file: "src/host/edge.ts",
        find: "        if (!landed) again = new Map([...marks, ...again]);\n",
        replace: "",
      },
    ],
  },
  {
    name: "ticket-answered-by-empty-batch",
    tests: ["tests/stories/storage.test.ts", "tests/write-lanes/write-ahead-records.test.ts"],
    says: "a capture carrying a ticket is answered landed without its batch being written",
    rule: "WriteAhead I15",
    edits: [
      {
        file: "src/host/edge.ts",
        find: "      if (writes.length === 0) {",
        replace: "      if (carried.length > 0 || writes.length === 0) {",
      },
    ],
  },
  {
    name: "withheld-ticket-sent-at-capture",
    tests: ["tests/restore/unencodable.test.ts", "src/core/persist.test.ts"],
    says: "a ticket whose identity is withheld at its capture is answered with the batch, so its send goes with no actor record on disk",
    rule: "WriteAhead R13",
    edits: [
      {
        file: "src/core/persist.ts",
        find: "      Option.exists(identityOf(t), (actor) => withheld.has(actorKey(actor))),",
        replace:
          "      Option.exists(identityOf(t), (actor) => withheld.size < 0 && withheld.has(actorKey(actor))),",
      },
    ],
  },
  {
    name: "capture-serves-mail",
    tests: ["src/core/persist.test.ts"],
    says: "a capture runs the step's drain, so issuing a batch serves mail and starts work",
    rule: "WriteAhead I8",
    edits: [
      {
        file: "src/core/step.ts",
        find: "    persistence.capture(input.tickets, input.again);\n\n    return tx.out();\n",
        replace: "    persistence.capture(input.tickets, input.again);\n",
      },
    ],
  },
];

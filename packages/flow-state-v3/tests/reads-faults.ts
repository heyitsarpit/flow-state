import type { Fault } from "./faults.ts";

/**
 * Faults of operation endings, read entries, placements and persisted resources, each caught by
 * its own target tests. Each edits the code that owns its rule; when that code moves, a fault keeps
 * its test and takes a new `find` there.
 */
export const readsFaults: ReadonlyArray<Fault> = [
  {
    name: "retryable-ignores-count",
    tests: ["tests/chat/endings.test.ts"],
    says: "a guard's lane view reads a Held head's resends as none, so `retryable` never declines",
    rule: "Operations R15",
    edits: [
      {
        file: "src/core/lanes.ts",
        find: "LaneView.Held({ retryCount: l.head.retryCount })",
        replace: "LaneView.Held({ retryCount: 0 })",
      },
    ],
  },
  {
    name: "issue-cleared-by-other-key",
    tests: ["tests/chat/endings.test.ts"],
    says: "a row heard clears the refusal of every row of its operation, so one key's clean ending erases another key's issue",
    rule: "Operations R6, I13",
    edits: [
      {
        file: "src/core/ledger.ts",
        find: "          Heard: () => close(row, Closed.Delivered()),",
        replace:
          "          Heard: () => {\n            for (const other of rowsOf(tx.world().owed, row.actor))\n              if (other.operation === row.operation && other.id !== row.id)\n                replace(other, Option.some({ ...other, refusal: Option.none() }));\n            close(row, Closed.Delivered());\n          },",
      },
    ],
  },
  {
    name: "refusal-kept-after-let-go",
    tests: ["tests/chat/endings.test.ts"],
    says: "letting a Kept row go leaves it waiting, so its issue outlives the let-go",
    rule: "Operations I13",
    edits: [
      {
        file: "src/core/ledger.ts",
        find: '        close(row, Closed.Recorded({ why: "letGo" }));\n  };',
        replace:
          "        replace(row, Option.some({ ...row, delivery: Delivery.Waiting() }));\n  };",
      },
    ],
  },
  {
    name: "second-unknown-row",
    tests: ["src/core/ledger.test.ts", "src/host/ledger.test.ts"],
    says: "a second unknown of one Attempt adds a row beside its unheard first",
    rule: "Operations I15; Records R16",
    edits: [
      {
        file: "src/core/ledger.ts",
        find: '      if (ending.channel === "unknown") return unheard.value.id;\n      close(unheard.value, Closed.Recorded({ why: "replaced" }));',
        replace: "      void unheard;",
      },
    ],
  },
  {
    name: "timeout-as-failure",
    tests: ["tests/write-lanes/timeout.test.ts"],
    says: "a write whose Effect times out ends as a failure tagged TimeoutError, not unknown",
    rule: "Operations R2, TimeoutIsUnknown",
    edits: [
      {
        file: "src/host/driver.ts",
        find: '      if (kind === "write" && Cause.isTimeoutError(error))',
        replace: '      if (kind === "write" && Cause.isTimeoutError(error) && Number.isNaN(0))',
      },
    ],
  },
  {
    name: "mapper-throw-not-refused",
    tests: ["tests/chat/endings.test.ts"],
    says: "a mapper that throws closes its row as evidence, so the ending is lost with no issue",
    rule: "Operations R11, I23",
    edits: [
      {
        file: "src/core/serve.ts",
        find: '    if (Result.isFailure(payload))\n      apply(\n        Option.some(incarnation),\n        refusalOf(trigger, { code: "InvalidTurn", slot: payload.failure }),\n      );',
        replace:
          "    if (Result.isFailure(payload)) ledger.afterTry(ending.id, ending.actor, Heard.Unmapped());",
      },
    ],
  },
  {
    name: "missing-service-booted",
    tests: ["tests/chat/endings.test.ts", "tests/search/typeahead.test.ts"],
    says: "a Runtime whose services lack one an operation lists boots anyway",
    rule: "Operations Rows (MissingService)",
    edits: [
      {
        file: "src/host/runtime.ts",
        find: "    for (const error of Option.toArray(missingServices([...machines.values()], services)))",
        replace: "    for (const error of Option.toArray(missingServices([], services)))",
      },
    ],
  },
  {
    name: "progress-dropped",
    tests: ["tests/transfers/reads.test.ts", "tests/chat/attachments.test.ts"],
    says: "a commit's progress report changes nothing, so its row never shows it",
    rule: "Plan Operations O6",
    edits: [
      {
        file: "src/core/lanes.ts",
        find: "          head: { ...lane.head, progress: Option.some(value) },",
        replace: "          head: { ...lane.head, progress: Option.none() },",
      },
    ],
  },
  {
    name: "idempotency-undeclared",
    tests: ["tests/chat/endings.test.ts", "tests/transfers/reads.test.ts"],
    says: "a transaction's declared idempotency is dropped, so it reads as keyed by the Attempt",
    rule: "Plan Operations O1",
    edits: [
      {
        file: "src/contract.ts",
        find: '        services: config.services,\n        idempotency: config.idempotency ?? "attempt",',
        replace: '        services: config.services,\n        idempotency: "attempt",',
      },
    ],
  },
  {
    name: "attempt-id-without-seed",
    tests: ["tests/chat/keys.test.ts"],
    says: "an Attempt id is minted from the count alone, so a boot mints ids an earlier boot used",
    rule: "Operations R1, I16",
    edits: [
      {
        file: "src/core/tx.ts",
        find: "`att-${env.seed}-${world.attempts}`",
        replace: "`att-${world.attempts}`",
      },
    ],
  },
];

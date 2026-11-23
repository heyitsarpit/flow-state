import type { Fault } from "./faults.ts";

/**
 * Faults of operation endings, read entries, placements and persisted resources, each caught by
 * its own target tests. Each edits the code that owns its rule; when that code moves, a fault keeps
 * its test and takes a new `find` there.
 */
export const readsFaults: ReadonlyArray<Fault> = [
  {
    name: "saved-entry-fresh",
    tests: ["tests/draft/saved-entries.test.ts"],
    says: "a saved entry installs as asked, so the first ask after a reload serves it as fresh",
    rule: "Operations R12, I24",
    edits: [
      {
        file: "src/core/entry-store.ts",
        find: "          data: Option.some({ value: data, at, asked: Option.none() }),",
        replace: "          data: Option.some({ value: data, at, asked: Option.some(0) }),",
      },
    ],
  },
  {
    name: "old-entry-installed",
    tests: ["tests/draft/saved-entries.test.ts"],
    says: "a saved entry at least gcTime old installs",
    rule: "Operations R12, I24 (install)",
    edits: [
      {
        file: "src/core/entry-store.ts",
        find: "            Option.filter(entryOfText(codec, text), ({ at }) => tx.env.now - at < op.gcTime),",
        replace: "            Option.filter(entryOfText(codec, text), ({ at }) => at === at),",
      },
    ],
  },
  {
    name: "undecodable-entry-kept",
    tests: ["tests/draft/saved-entries.test.ts"],
    says: "a saved entry the boot cannot install keeps its bytes",
    rule: "Records R18",
    edits: [
      {
        file: "src/core/entry-store.ts",
        find: "      onNone: () => persistence.saveEntry(stored, Option.none()),",
        replace: "      onNone: () => undefined,",
      },
    ],
  },
  {
    name: "persist-without-output-accepted",
    tests: ["tests/draft/saved-entries.test.ts"],
    says: "a persisted resource with no output constructs",
    rule: "Plan Operations O1",
    edits: [
      {
        file: "src/contract.ts",
        find: "    if (config.persist === true && !Predicate.isNotUndefined(config.output))",
        replace: '    if (config.persist === true && config.id === "")',
      },
    ],
  },
  {
    name: "cleared-entry-saved",
    tests: ["tests/draft/saved-entries.test.ts"],
    says: "a cleared read keeps its saved copy, so a reload brings back data the app removed",
    rule: "Operations Entry store (Clear)",
    edits: [
      {
        file: "src/core/entry-store.ts",
        find: "    if (Option.exists(before, (b) => b.data === after.data)) return;",
        replace:
          "    if (Option.exists(before, (b) => b.data === after.data) || Option.isNone(after.data)) return;",
      },
    ],
  },
  {
    name: "overdue-early",
    tests: ["tests/chat/reads.test.ts"],
    says: "a released call shows ReleaseOverdue from its release, before the disposal bound passes",
    rule: "Operations R8, I11",
    edits: [
      {
        file: "src/core/issues-of.ts",
        find: "      .filter(([call]) => !world.alarms.has(alarmKey(Alarm.Release({ call }))))",
        replace: "      .filter(([call]) => call !== alarmKey(Alarm.Release({ call })))",
      },
    ],
  },
  {
    name: "overdue-kept-after-end",
    tests: ["tests/chat/reads.test.ts"],
    says: "a released call that ends stays releasing, so its holders keep ReleaseOverdue",
    rule: "Operations R8, I11",
    edits: [
      {
        file: "src/core/entry-releases.ts",
        find: '    tx.drop("releasing", call);\n',
        replace: "",
      },
    ],
  },
  {
    name: "release-alarm-not-cleared",
    tests: ["tests/chat/reads.test.ts"],
    says: "a released call that ends keeps its Release alarm, which owns no fact",
    rule: "Operations I22",
    edits: [
      {
        file: "src/core/entry-releases.ts",
        find: "    tx.clearAlarm(Alarm.Release({ call }));\n",
        replace: "",
      },
    ],
  },
  {
    name: "release-without-interrupt",
    tests: ["tests/search/results.test.ts"],
    says: "a released call is never told to stop, so it runs on and its answer is delivered",
    rule: "Operations R8, Releases",
    edits: [
      {
        file: "src/core/entry-releases.ts",
        find: "        tx.command(Command.Interrupt({ call }));\n",
        replace: "",
      },
    ],
  },
  {
    name: "placement-kept-after-exit",
    tests: ["tests/search/results.test.ts"],
    says: "a state's exit leaves its placement holding its entry, so its read runs on",
    rule: "Operations, placements (unplace at exit)",
    edits: [
      {
        file: "src/core/placements.ts",
        find: "      if (!active.has(operation)) entries.unplace(incarnation, operation);",
        replace:
          "      if (active.has(operation) && !active.has(operation)) entries.unplace(incarnation, operation);",
      },
    ],
  },
  {
    name: "placeholder-unmarked",
    tests: ["tests/transfers/reads.test.ts"],
    says: "a placement's placeholder reaches its mapper as landed data",
    rule: "Plan Operations O6",
    edits: [
      {
        file: "src/core/serve.ts",
        find: "          placeholder: ending.reason === PLACEHOLDER,",
        replace: "          placeholder: ending.reason !== ending.reason + PLACEHOLDER,",
      },
    ],
  },
  {
    name: "select-failure-quiet",
    tests: ["tests/transfers/reads.test.ts"],
    says: "a placement whose select named no key shows no issue",
    rule: "Operations R11, I23",
    edits: [
      {
        file: "src/core/issues-of.ts",
        find: "          Unkeyed: ({ failed }) => Option.some(failed),",
        replace: "          Unkeyed: () => Option.none<string>(),",
      },
    ],
  },
  {
    name: "failure-kept-as-unknown",
    tests: ["tests/shop/mini-cart.test.ts"],
    says: "a commit's plain failure keeps its optimistic value and reads again, as an unknown does",
    rule: "Plan Operations O5",
    edits: [
      {
        file: "src/core/entry-view.ts",
        find: '  failure: "removed",',
        replace: '  failure: "unknown",',
      },
    ],
  },
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
    name: "two-calls-one-entry",
    tests: ["tests/chat/reads.test.ts", "tests/search/typeahead.test.ts"],
    says: "an ask of a Running entry starts a second request instead of waiting on the first",
    rule: "Operations R3, I6",
    edits: [
      {
        file: "src/core/entries.ts",
        find: "    Current: (_key, _entry, { asker }) => wait(asker),",
        replace:
          "    Current: (key, entry, { asker }) => {\n      put(key, start(key, entry));\n      wait(asker);\n    },",
      },
    ],
  },
  {
    name: "fresh-entry-asks-again",
    tests: ["tests/chat/reads.test.ts", "tests/search/typeahead.test.ts"],
    says: "a lookup of fresh data starts a request instead of serving what was read",
    rule: "Operations R4",
    edits: [
      {
        file: "src/core/entries.ts",
        find: "      if (!refetch && fresh(entry)) return serve(asker, entry);",
        replace:
          "      if (!refetch && fresh(entry) && Number.isNaN(0)) return serve(asker, entry);",
      },
    ],
  },
  {
    name: "no-release-at-last-hold",
    tests: ["tests/chat/reads.test.ts", "tests/search/typeahead.test.ts"],
    says: "a Running entry that lost its last hold keeps its request on the wire",
    rule: "Operations R5, StepBoundary",
    edits: [
      {
        file: "src/core/entries.ts",
        find: "    Current: (key, entry) => unheld(key, release(key, entry)),\n    Behind: (key, entry) => unheld(key, release(key, entry)),",
        replace: "    Current: unheld,\n    Behind: unheld,",
      },
    ],
  },
  {
    name: "collect-without-gctime",
    tests: ["tests/search/typeahead.test.ts"],
    says: "an unheld entry's Collect is due at once, so it is removed before its gcTime",
    rule: "Operations R5, I12",
    edits: [
      {
        file: "src/core/entries.ts",
        find: "    tx.setAlarm(Alarm.Collect({ entry: key }), now() + gcTime);",
        replace: "    tx.setAlarm(Alarm.Collect({ entry: key }), now());",
      },
    ],
  },
  {
    name: "gc-zero-keeps-entry",
    tests: ["tests/wizard/slots.test.ts"],
    says: "an entry with gcTime 0 is kept with a Collect alarm a moment on instead of removed in the step",
    rule: "Operations R5, I12",
    edits: [
      {
        file: "src/core/entries.ts",
        find: "    if (gcTime <= 0) return collected(key, entry);",
        replace: "    if (gcTime < 0) return collected(key, entry);",
      },
      {
        file: "src/core/entries.ts",
        find: "    tx.setAlarm(Alarm.Collect({ entry: key }), now() + gcTime);",
        replace: "    tx.setAlarm(Alarm.Collect({ entry: key }), now() + Math.max(gcTime, 1));",
      },
    ],
  },
  {
    name: "lookup-input-unchecked",
    tests: ["tests/search/typeahead.test.ts", "tests/wizard/slots.test.ts"],
    says: "a lookup's input is sent without its Schema's check",
    rule: "Operations, Slot cells (intake)",
    edits: [
      {
        file: "src/core/entries.ts",
        find: "      Option.liftPredicate(input, (i) => Result.isSuccess(operation.walk.input.text(i))),\n      (i) => operation.walk.keyText(pick(i, operation.keyFields)),",
        replace:
          "      Option.liftPredicate(input, (i) => i === input),\n      (i) => Option.some(JSON.stringify(pick(i, operation.keyFields))),",
      },
    ],
  },
  {
    name: "optimistic-not-applied",
    tests: ["tests/chat/reads.test.ts"],
    says: "a reader sees confirmed data alone, with no live optimistic update applied",
    rule: "Plan Operations O5",
    edits: [
      {
        file: "src/core/entry-view.ts",
        find: "    Result.try(() => update(value)),",
        replace: "    Result.try(() => (Number.isNaN(0) ? update(value) : value)),",
      },
    ],
  },
  {
    name: "behind-result-lands",
    tests: ["tests/chat/reads.test.ts"],
    says: "an answer asked before an invalidation lands and is owed as if it were current",
    rule: "Operations R4, I7, entry table (Settled, Running behind)",
    edits: [
      {
        file: "src/core/entries.ts",
        find: "      Settled: (c) => settled[phase](key, entry, c),",
        replace:
          '      Settled: (c) => settled[phase === "Behind" ? "Current" : phase](key, entry, c),',
      },
    ],
  },
  {
    name: "join-when-behind",
    tests: ["tests/chat/reads.test.ts", "tests/generated/entries.test.ts"],
    says: "an ask of a request gone behind waits on it with no trailing request, so it never hears",
    rule: "Operations R5, I2, entry table (Ask, Running behind)",
    edits: [
      {
        file: "src/core/entries.ts",
        find: "      put(key, withAgain(entry, true));\n      wait(asker);",
        replace: "      wait(asker);",
      },
    ],
  },
  {
    name: "read-defect-hidden",
    tests: ["tests/chat/reads.test.ts"],
    says: "a read whose last ending is a Defect raises no issue for its readers",
    rule: "Operations, Issue view (Entry)",
    edits: [
      {
        file: "src/core/issues-of.ts",
        find: '          Option.filter(entry.last, (last) => last.reason === "Defect"),',
        replace:
          '          Option.filter(entry.last, (last) => last.reason === "Defect" && Number.isNaN(0)),',
      },
    ],
  },
  {
    name: "written-not-applied",
    tests: ["tests/chat/reads.test.ts"],
    says: "a success write only marks its entry stale, so a reader waiting on a held read hears nothing",
    rule: "Plan Operations O3; Operations R4, I9 (Written)",
    edits: [
      {
        file: "src/core/entry-writes.ts",
        find: "          onSome: (d) => Cue.Written({ value: applied(w.update, d.value) }),",
        replace: "          onSome: () => Cue.Invalidate(),",
      },
    ],
  },
  {
    name: "invalid-write-applied",
    tests: ["tests/chat/reads.test.ts"],
    says: "a success write with no valid key goes unreported",
    rule: "Plan Operations O3 (InvalidUpdate)",
    edits: [
      {
        file: "src/core/entry-writes.ts",
        find: "          if (Option.isNone(w.keyText)) invalid();\n          else written(w, head.started);",
        replace: "          written(w, head.started);",
      },
    ],
  },
  {
    name: "cancelled-echo-kept",
    tests: ["tests/chat/reads.test.ts"],
    says: "a commit a cancel interrupted ends unknown, so its optimistic value is kept as if it may have happened",
    rule: "Plan Operations O5",
    edits: [
      {
        file: "src/core/entry-view.ts",
        find: 'const GONE = new Set(["Cancelled", "Superseded", "Disposed"]);',
        replace: 'const GONE = new Set(["Superseded", "Disposed"]);',
      },
      {
        file: "src/core/lanes.ts",
        find: '    } else if (Move.$is("Interrupt")(move) || tx.world().lanes.get(at.id)?.head.id !== before)',
        replace: "    } else if (tx.world().lanes.get(at.id)?.head.id !== before)",
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

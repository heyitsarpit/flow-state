import type { Fault } from "./faults.ts";

/**
 * Wrong test tooling the tests must reject: each breaks one rule of the Stories Spec in
 * `src/host/testing/` or the bench, or of the command line in `src/host/cli/`, planted alone like
 * the runtime's faults.
 */
export const toolingFaults: ReadonlyArray<Fault> = [
  {
    name: "abort-fails-the-waiter",
    tests: ["tests/stories/storage.test.ts"],
    says: "a reload's abort of the dying tab's held write fails its waiter, so the dead tab runs again",
    rule: "Stories R13",
    edits: [
      {
        file: "src/host/testing/fake.ts",
        find: '      ))\n        mark(out, "aborted");',
        replace:
          '      )) {\n        mark(out, "aborted");\n        Deferred.doneUnsafe(out.answer, Exit.fail(new StoreRefused({})));\n      }',
      },
    ],
  },
  {
    name: "abort-keeps-held",
    tests: ["tests/stories/storage.test.ts"],
    says: "a reload leaves the dying tab's held writes held, so a later release takes one meant for the live tab",
    rule: "Stories R13",
    edits: [
      {
        file: "src/host/testing/fake.ts",
        find: '      ))\n        mark(out, "aborted");',
        replace: "      ))\n        void out;",
      },
    ],
  },
  {
    name: "dead-tab-answered",
    tests: ["tests/stories/reload.test.ts"],
    says: "the test tooling's release of a dead tab's held call completes its waiter, so the dead tab runs again",
    rule: "Stories R13",
    edits: [
      {
        file: "src/host/testing/fake.ts",
        find: "    if (Option.isSome(exit) && alive(entry.open) && !gone.has(entry.answer)) {",
        replace: "    if (Option.isSome(exit) && !gone.has(entry.answer)) {",
      },
    ],
  },
  {
    name: "deadline-passed-answered",
    tests: ["tests/stories/wire.test.ts"],
    says: "a held call released after its commit's deadline reads as answered, though no waiter heard it",
    rule: "Stories R9",
    edits: [
      {
        file: "src/host/testing/fake.ts",
        find: "    if (Option.isSome(exit) && alive(entry.open) && !gone.has(entry.answer)) {",
        replace: "    if (Option.isSome(exit) && alive(entry.open)) {",
      },
    ],
  },
  {
    name: "step-left-unsettled",
    tests: ["tests/stories/storage.test.ts"],
    says: "the test tooling ends a step without running its tab's queued tasks",
    rule: "Stories R5",
    edits: [
      {
        file: "src/host/testing/run.ts",
        find: "      tab.settle();\n\n      return !tab.queued() && !built.driver.pending();",
        replace: "      return true;",
      },
    ],
  },
  {
    name: "drop-at-request-handled",
    tests: ["tests/stories/wire.test.ts"],
    says: "a call dropped at request still reaches the server and changes its truth",
    rule: "Stories I8",
    edits: [
      {
        file: "src/host/testing/fake.ts",
        find: '        } else mark(index, "dropped at request");',
        replace:
          '        } else {\n          handled(server, endpoint, input);\n          mark(index, "dropped at request");\n        }',
      },
    ],
  },
  {
    name: "control-ignored",
    tests: ["tests/stories/fake.test.ts"],
    says: "a fake control leaves the server's truth as it was",
    rule: "Stories R8",
    edits: [
      {
        file: "src/host/testing/fake.ts",
        find: "            onSuccess: (truth) => void truths.set(server, truth),",
        replace: "            onSuccess: () => undefined,",
      },
    ],
  },
  {
    name: "cut-shares-the-store",
    tests: ["tests/stories/steps.test.ts"],
    says: "a checkpoint holds the live store, so later steps change an earlier cut",
    rule: "Stories I15",
    edits: [
      {
        file: "src/host/testing/fake.ts",
        find: "    data: () => new Map(data),",
        replace: "    data: () => data,",
      },
    ],
  },
  {
    name: "reload-forgets-uses",
    tests: ["tests/cells/cells.test.ts"],
    says: "a reload boots the tab's next open without ensuring the actors the Story still uses",
    rule: "Stories R13",
    edits: [
      {
        file: "src/host/testing/run.ts",
        find: "    for (const { actor, context, count } of uses.values())\n      for (let k = 0; k < count; k++) attach(opened, actor, context);",
        replace: "    uses.clear();",
      },
    ],
  },
  {
    name: "setup-services-built",
    tests: ["tests/stories/storage.test.ts"],
    says: "a Story's tab builds the setup's own services in place of its fixtures",
    rule: "Stories R7",
    edits: [
      {
        file: "src/host/testing/run.ts",
        find: "    const opened = openTab({ ...subject.config, services }, host, now, limits);",
        replace: "    const opened = openTab({ services, ...subject.config }, host, now, limits);",
      },
    ],
  },
  {
    name: "trace-own-path",
    tests: ["tests/cli/cli.test.ts"],
    says: "flow trace prints its own copy of the trace, short of the run's last event",
    rule: "CommandLine O2",
    edits: [
      {
        file: "src/host/cli/main.ts",
        find: '    yield* document(render(ran.trace, "text"));',
        replace:
          '    yield* document(render({ ...ran.trace, events: ran.trace.events.slice(0, -1) }, "text"));',
      },
    ],
  },
  {
    name: "checkpoint-without-state",
    tests: ["tests/cli/cli.test.ts"],
    says: "flow story run prints each checkpoint but not its actors' states",
    rule: "CommandLine O2",
    edits: [
      {
        file: "src/host/cli/main.ts",
        find: "          ...(run.checkpoints[record.step.name]?.inspection.actors ?? []).map(",
        replace: "          ...[].map(",
      },
    ],
  },
  {
    name: "list-first-app-only",
    tests: ["tests/cli/cli.test.ts"],
    says: "flow story list names the Stories of the config's first app alone",
    rule: "CommandLine O1",
    edits: [
      {
        file: "src/host/cli/discover.ts",
        find: "    ...config.apps.map(({ app, stories }) => ({ app: Option.some(app.id), stories })),",
        replace:
          "    ...config.apps.slice(0, 1).map(({ app, stories }) => ({ app: Option.some(app.id), stories })),",
      },
    ],
  },
  {
    name: "failure-succeeds",
    tests: ["tests/cli/cli.test.ts"],
    says: "a config that does not load, an unknown Story or a rejected run exits 0",
    rule: "CommandLine O3",
    edits: [
      {
        file: "src/host/cli/main.ts",
        find: "      Effect.as(Console.error(`flow: ${error.message}`), 2),",
        replace: "      Effect.as(Console.error(`flow: ${error.message}`), 0),",
      },
    ],
  },
  {
    name: "dispose-forgets-uses",
    tests: ["tests/stories/steps.test.ts"],
    says: "the test tooling's disposeRuntime forgets the Story's uses, so the next reload ensures nothing",
    rule: "Stories R13",
    edits: [
      {
        file: "src/host/testing/run.ts",
        find: "      disposeRuntime: ({ forget }) => {\n",
        replace: "      disposeRuntime: ({ forget }) => {\n        uses.clear();\n",
      },
    ],
  },
  {
    name: "trace-omits-requests",
    tests: ["tests/transfers/trace.test.ts"],
    says: "the trace leaves out the calls the fake servers received",
    rule: "Stories I20",
    edits: [
      {
        file: "src/host/testing/run.ts",
        find: '    (index) => note({ kind: "call", index }),\n',
        replace: "    () => undefined,\n",
      },
    ],
  },
  {
    name: "bench-drops-a-round",
    tests: ["tests/bench/run.test.ts"],
    says: "the bench times a Story with its last round of steps cut, so it does less work than the tested run",
    rule: "Stories I18",
    edits: [
      {
        file: "bench/time.ts",
        find: "const run = await story.run();",
        replace: "const run = await story.run({ steps: story.steps.slice(0, -10) });",
      },
    ],
  },
  {
    name: "offline-reaches-server",
    tests: ["tests/stories/wire.test.ts"],
    says: "the test tooling ignores the network going offline, so calls still reach their servers",
    rule: "Stories R17",
    edits: [
      {
        file: "src/host/testing/fake.ts",
        find: '          offline = kind === "offline";',
        replace: "          void kind;",
      },
    ],
  },
  {
    name: "landed-write-lost",
    tests: ["tests/stories/storage.test.ts"],
    says: "a reload asked to land the held writes marks them landed but writes nothing to the store",
    rule: "Stories R13",
    edits: [
      {
        file: "src/host/testing/fake.ts",
        find: '        apply(out.writes);\n        mark(out, "landed");\n      }\n    },',
        replace: '        mark(out, "landed");\n      }\n    },',
      },
    ],
  },
  {
    name: "turn-bound-after-the-chain",
    tests: ["tests/stories/story.test.ts"],
    says: "the run judges the turn bound only between tasks, so a chain of commits that answer at once runs past 10,000 turns",
    rule: "Stories I7",
    edits: [
      {
        file: "src/host/testing/run.ts",
        find: '.length > TURN_LIMIT)\n        limits.fail("Turns");',
        replace: '.length > Number.POSITIVE_INFINITY)\n        limits.fail("Turns");',
      },
    ],
  },
  {
    name: "refuse-held-lands",
    tests: ["tests/write-lanes/write-ahead-records.test.ts"],
    says: "Fake.storage.refuseHeld() lands the held write instead of refusing it",
    rule: "Stories R11",
    edits: [
      {
        file: "src/host/testing/fake.ts",
        find: '        mark(out, "refused");\n        Deferred.doneUnsafe(out.answer, Exit.fail(new StoreRefused({})));',
        replace:
          '        apply(out.writes);\n        mark(out, "landed");\n        Deferred.doneUnsafe(out.answer, Exit.void);',
      },
    ],
  },
  {
    name: "fork-store-empty",
    tests: ["tests/stories/fork.test.ts"],
    says: "a forked reload starts the store empty instead of from the saved records, batches and words",
    rule: "Stories R18",
    edits: [
      { file: "src/host/testing/run.ts", find: "    saved.store,\n", replace: "    noStore,\n" },
    ],
  },
  {
    name: "fork-servers-fresh",
    tests: ["tests/stories/fork.test.ts"],
    says: "a forked reload starts every fake server fresh instead of from the saved truth, calls and words",
    rule: "Stories R18",
    edits: [
      {
        file: "src/host/testing/run.ts",
        find: "    saved.servers,\n",
        replace: "    noServers,\n",
      },
    ],
  },
  {
    name: "fork-actors-dropped",
    tests: ["tests/stories/fork.test.ts"],
    says: "a forked reload forgets the actors the Story holds, so it ensures none of them again",
    rule: "Stories R18",
    edits: [
      {
        file: "src/host/testing/run.ts",
        find: "  const uses = new Map(saved.uses);",
        replace: "  const uses = new Map<string, Use>();",
      },
    ],
  },
  {
    name: "fork-clock-zero",
    tests: ["tests/stories/fork.test.ts"],
    says: "a forked reload boots its open at time 0 instead of the saved time",
    rule: "Stories R18",
    edits: [
      {
        file: "src/host/testing/run.ts",
        find: "        const opened = reopen(saved.now, reload);",
        replace: "        const opened = reopen(0, reload);",
      },
    ],
  },
];

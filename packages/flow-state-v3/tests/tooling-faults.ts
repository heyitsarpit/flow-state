import type { Fault } from "./faults.ts";

/**
 * Wrong test tooling the tests must reject: each breaks one rule of the Stories Spec in
 * `src/host/testing/`, or of the command line in `src/host/cli/`, planted alone like the runtime's
 * faults.
 */
export const toolingFaults: ReadonlyArray<Fault> = [
  {
    name: "abort-fails-the-waiter",
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
    says: "a reload boots the tab's next open without ensuring the actors the Story still uses",
    rule: "Stories R13",
    edits: [
      {
        file: "src/host/testing/run.ts",
        find: "        for (const { actor, count } of uses.values()) for (let k = 0; k < count; k++) attach(actor);",
        replace: "        uses.clear();",
      },
    ],
  },
  {
    name: "setup-services-built",
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
];

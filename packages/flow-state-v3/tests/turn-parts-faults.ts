import type { Fault } from "./faults.ts";

/**
 * Faults of the turn's parts (the walk, the applier, alarms and mail), each caught by its own
 * target tests. Each edits today's turn code: when the build replaces that code, a fault keeps its
 * test and takes a new `find` in the code that now owns its rule.
 */
export const turnPartsFaults: ReadonlyArray<Fault> = [
  {
    name: "actor-send-resendable",
    tests: ["tests/home/trips.test.ts"],
    says: "an actor's send is taken as one its sender can send again, so its bad arm refuses the turn",
    rule: "Schedules R11",
    edits: [
      {
        file: "src/core/incarnations.ts",
        find: "resendable: Option.isNone(sender) })",
        replace: "resendable: true })",
      },
    ],
  },
  {
    name: "turn-unpublished-without-sends",
    tests: ["tests/turn/sequence.test.ts"],
    says: "an accepted turn that sends nothing publishes nothing",
    rule: "Changes I5",
    edits: [
      {
        file: "src/core/serve.ts",
        find: "        publish(settled);",
        replace: "        if (sends.length > 0) publish(settled);",
      },
    ],
  },
  {
    name: "row-queued-for-absent",
    tests: ["tests/turn/sequence.test.ts"],
    says: "an ending owed to an identity with no live actor is queued in its mailbox, not left waiting",
    rule: "Changes I9",
    edits: [
      {
        file: "src/core/ledger.ts",
        find: "    if (live(row)) {",
        replace: '    if (live(row) || row.to._tag === "Identity") {',
      },
    ],
  },
  {
    name: "consumers-unindexed",
    tests: ["tests/turn/sequence.test.ts"],
    says: "a consumer that binds a provider is left out of that provider's consumers index",
    rule: "Changes I13",
    edits: [
      {
        file: "src/core/tx.ts",
        find: '      addTo("consumersOf", actorKey(provider), key);',
        replace: "      void provider;",
      },
    ],
  },
  {
    name: "refusal-writes-memory",
    tests: ["tests/turn/sequence.test.ts"],
    says: "a refused turn writes memory as it raises its issue",
    rule: "Changes I15",
    edits: [
      {
        file: "src/core/serve.ts",
        find: "    const next = withIssue(incarnation, issue);",
        replace:
          '    const next = { ...withIssue(incarnation, issue), memory: { ...incarnation.memory, [Object.keys(incarnation.memory)[0] ?? ""]: null } };',
      },
    ],
  },
  {
    name: "context-update-writes-memory",
    tests: ["tests/turn/sequence.test.ts"],
    says: "a context update writes the consumer's memory, with no turn",
    rule: "Changes I16",
    edits: [
      {
        file: "src/core/context.ts",
        find: "    const after = { ...next, baselines };",
        replace:
          '    const after = { ...next, baselines, memory: { ...next.memory, [Object.keys(next.memory)[0] ?? ""]: null } };',
      },
    ],
  },
  {
    name: "providers-finish-first",
    tests: ["tests/turn/sequence.test.ts"],
    says: "a Runtime's disposal ends providers before the consumers bound to them",
    rule: "Changes I17",
    edits: [
      {
        file: "src/core/disposal.ts",
        find: "    for (const actor of consumersFirst(tx.world())) tx.act(Act.Finished({ actor }));",
        replace:
          "    for (const actor of consumersFirst(tx.world()).toReversed()) tx.act(Act.Finished({ actor }));",
      },
    ],
  },
];

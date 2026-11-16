import type { Fault } from "./faults.ts";

/**
 * Wrong runtimes of actor identity and lifetime: an identity that is not the input, a creation
 * that ignores the ref's input or its Schemas, a local actor that persists or ends at the grace,
 * and another Runtime's handle taken as this one's; each planted alone like the runtime's other
 * faults.
 */
export const actorFaults: ReadonlyArray<Fault> = [
  {
    name: "identity-is-the-raw-value",
    tests: ["tests/actors/identity.test.ts"],
    says: "a value ref is named by the whole value as given, so a reorder or an extra field names another actor",
    rule: "Actors R5",
    edits: [
      {
        file: "src/core/identity.ts",
        find: "  return Result.mapError(Schema.encodeUnknownResult(nameCodec(compiled))(input), () => compiled.id);",
        replace: "  return Result.succeed(JSON.stringify(value));",
      },
    ],
  },
  {
    name: "creation-ignores-ref-input",
    tests: ["tests/actors/identity.test.ts"],
    says: "an ensure creates a value-named actor from no input, so it never starts",
    rule: "Actors R6",
    edits: [
      {
        file: "src/core/incarnations.ts",
        find: "start(actor, record, compiled === undefined ? {} : inputOfName(compiled, actor.name));",
        replace: "start(actor, record, {});",
      },
    ],
  },
  {
    name: "ref-input-unchecked",
    tests: ["tests/actors/identity.test.ts"],
    says: "a value ref's input is not checked by its Schemas before the ensure",
    rule: "Actors I9",
    edits: [
      {
        file: "src/core/identity.ts",
        find: "    if (!field.is(given)) return Result.fail(field.name);",
        replace: "",
      },
    ],
  },
  {
    name: "local-actor-persists",
    tests: ["src/host/identity.test.ts"],
    says: "a local actor of a persisted machine is written to the store",
    rule: "Actors R6",
    edits: [
      {
        file: "src/core/tx.ts",
        find: "    world.persistence &&\n    !actor.name.startsWith(LOCAL_PREFIX);",
        replace: "    world.persistence;",
      },
    ],
  },
  {
    name: "local-actor-ends-at-grace",
    tests: ["tests/actors/identity.test.ts"],
    says: "a local actor is ended by the grace like a free shared one",
    rule: "Actors R6",
    edits: [
      {
        file: "src/core/incarnations.ts",
        find: '        uses: withEntry(tx.world().uses, actorKey(actor), ["host"]),',
        replace: "        uses: tx.world().uses,",
      },
    ],
  },
  {
    name: "issue-cleared-by-any-source",
    tests: ["tests/actors/snapshot.test.ts"],
    says: "any accepted turn clears every open issue, not only its own source's",
    rule: "Turn R25",
    edits: [
      {
        file: "src/core/serve.ts",
        find: "          { ...base, issues: base.issues.filter((i) => i.source !== route.source) },",
        replace: "          { ...base, issues: [] },",
      },
    ],
  },
  {
    name: "refused-turn-raises-no-issue",
    tests: ["tests/actors/snapshot.test.ts"],
    says: "a refused turn reports its issue as evidence but the snapshot shows none",
    rule: "Turn R23",
    edits: [
      {
        file: "src/core/serve.ts",
        find: "        publish(raised(incarnation, { source: route.source, code, slot: Option.some(slot) }));",
        replace: "        publish(incarnation);",
      },
    ],
  },
  {
    name: "disposed-identity-reads-nothing",
    tests: ["tests/actors/snapshot.test.ts"],
    says: "after disposeActor a snapshot reads nothing instead of the terminal snapshot",
    rule: "Runtime O3",
    edits: [
      {
        file: "src/core/incarnations.ts",
        find: "        ended: withEntry(tx.world().ended, key, terminal(incarnation)),",
        replace: "        ended: tx.world().ended,",
      },
    ],
  },
  {
    name: "creation-issue-drops-schedule",
    tests: ["tests/actors/snapshot.test.ts"],
    says: "an issue a schedule's delay raises at creation does not name the schedule",
    rule: "Diagnostics R5",
    edits: [
      {
        file: "src/core/incarnations.ts",
        find: '          return { source: CREATION, code: "InvalidTurn" as const, slot: Option.some(slot) };',
        replace:
          '          return { source: CREATION, code: "InvalidTurn" as const, slot: Option.none() };',
      },
    ],
  },
  {
    name: "snapshot-hides-schedules",
    tests: ["tests/actors/snapshot.test.ts"],
    says: "a live actor's snapshot lists no armed schedule",
    rule: "Turn R23",
    edits: [
      {
        file: "src/host/runtime.ts",
        find: "        [...live.schedules].map(([name, armed]) => ({ key: name, dueAt: armed.dueAt })),",
        replace: "        [],",
      },
    ],
  },
  {
    name: "rotation-does-not-rotate",
    tests: ["tests/actors/mailbox.test.ts"],
    says: "an actor keeps the head of the rotation until its mailbox is empty",
    rule: "Actors I21",
    edits: [
      {
        file: "src/core/serve.ts",
        find: "      tx.set({ ...tx.world(), mail: rest.length === 0 ? others : withEntry(others, key, rest) });",
        replace:
          "      tx.set({ ...tx.world(), mail: rest.length === 0 ? others : new Map([[key, rest], ...others]) });",
      },
    ],
  },
  {
    name: "mailbox-not-fifo",
    tests: ["src/host/ledger.test.ts"],
    says: "an actor's mailbox serves its newest mail first",
    rule: "Actors I19",
    edits: [
      {
        file: "src/core/tx.ts",
        find: "    world = { ...world, mail: withEntry(world.mail, key, [...(world.mail.get(key) ?? []), mail]) };",
        replace:
          "    world = { ...world, mail: withEntry(world.mail, key, [mail, ...(world.mail.get(key) ?? [])]) };",
      },
    ],
  },
  {
    name: "drain-backlog-waits-for-input",
    tests: ["src/host/ledger.test.ts"],
    says: "mail a step's drain left waits for the next input instead of a later step",
    rule: "WriteAhead R10",
    edits: [
      {
        file: "src/host/driver.ts",
        find: "      if (owesServe(world))",
        replace: "      if (owesServe(world) && out.commands.length < 0)",
      },
    ],
  },
  {
    name: "foreign-handle-accepted",
    tests: ["tests/actors/identity.test.ts"],
    says: "another Runtime's handle is taken as naming this Runtime's actor",
    rule: "Actors R24",
    edits: [
      {
        file: "src/host/runtime.ts",
        find: "    if (target[HandleId].runtime === driver) return target[HandleId].actor;",
        replace: "    return target[HandleId].actor;",
      },
    ],
  },
];

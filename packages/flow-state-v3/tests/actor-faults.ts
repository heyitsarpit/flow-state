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
        find: "          compiled === undefined ? {} : inputOfName(compiled, actor.name),",
        replace: "          {},",
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
        file: "src/host/snapshot.ts",
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
    name: "absent-send-silent",
    tests: ["tests/actors/send.test.ts"],
    says: "a send to an identity with no actor and no record is dropped with nothing told",
    rule: "Actors R16",
    edits: [
      {
        file: "src/core/step.ts",
        find: '        tx.act(Act.SendTargetAbsent({ actor, event: tag, reason: "NoRecord" }));',
        replace: "        tx.evidenceCount();",
      },
    ],
  },
  {
    name: "send-creates-actor",
    tests: ["tests/actors/send.test.ts"],
    says: "a send to an identity with no actor and no record creates one",
    rule: "Actors I25",
    edits: [
      {
        file: "src/core/step.ts",
        find: "      if (incarnationOf(actor) === undefined && tx.world().records.has(actorKey(actor)))\n        incarnations.ensure(actor, Option.none(), true);",
        replace:
          "      if (incarnationOf(actor) === undefined) incarnations.ensure(actor, Option.none(), false);",
      },
    ],
  },
  {
    name: "admission-unbounded",
    tests: ["tests/actors/send.test.ts"],
    says: "an external send past the 1,024 pending events is admitted",
    rule: "Actors I22",
    edits: [
      { file: "src/core/step.ts", find: "  ADMISSION_BOUND;", replace: "  ADMISSION_BOUND * 2;" },
    ],
  },
  {
    name: "spread-escapes-computed-guard",
    tests: ["tests/turn/creation.test.ts"],
    says: "a computed start that spreads its fields reads a computed field unguarded",
    rule: "Compile R5",
    edits: [
      {
        file: "src/core/tree.ts",
        find: "        .map((f) => [f.name, { get: computedRead(f.name), enumerable: true }]),",
        replace: "        .map((f) => [f.name, { get: computedRead(f.name) }]),",
      },
    ],
  },
  {
    name: "late-exit-ignores-queue",
    tests: ["src/core/serve.test.ts"],
    says: "a late turn may exit an activation that owns only queued commits",
    rule: "Turn I27",
    edits: [
      {
        file: "src/core/serve.ts",
        find: "      for (const queued of lane.queue) owners.add(queued.owner);",
        replace: "",
      },
    ],
  },
  {
    name: "state-move-copies-memory",
    tests: ["tests/stories/steps.test.ts"],
    says: "a turn that runs no update copies the memory object, so an unchanged memory loses its identity",
    rule: "Turn I30",
    edits: [
      {
        file: "src/core/turn.ts",
        find: "    onNone: () => Result.succeed(input.memory),",
        replace: "    onNone: () => Result.succeed({ ...input.memory }),",
      },
    ],
  },
  {
    name: "context-update-skips-mailbox",
    tests: ["tests/actors/context.test.ts"],
    says: "a provider's change updates each consumer at once, mid-wave, so a diamond's consumer mixes a new value with a stale one",
    rule: "Actors I27",
    edits: [
      {
        file: "src/core/context.ts",
        find: "        if (!waiting) tx.enqueue(Mail.Context({ actor: consumer.actor }));",
        replace: "        if (!waiting) update(consumer.actor);",
      },
    ],
  },
  {
    name: "equal-context-not-silent",
    tests: ["tests/actors/context.test.ts"],
    says: "a wave whose selections are equal still runs the reactions and enqueues their events",
    rule: "Turn R22",
    edits: [
      {
        file: "src/core/context.ts",
        find: "    if (!changed) {",
        replace: "    if (changed && !changed) {",
      },
      {
        file: "src/core/context.ts",
        find: "      if (Equal.equals(previous, current.success)) continue;",
        replace: "",
      },
    ],
  },
  {
    name: "consumer-not-a-use",
    tests: ["tests/actors/context.test.ts"],
    says: "a bound consumer holds no use of its provider, so the provider ends under it",
    rule: "Actors R18",
    edits: [
      {
        file: "src/core/context.ts",
        find: '        needs.ensure(provider, Option.some("context"));',
        replace: "        needs.ensure(provider, Option.none());",
      },
    ],
  },
  {
    name: "throwing-selector-drops-value",
    tests: ["tests/actors/context.test.ts"],
    says: "a selector that throws loses its slot's last valid value",
    rule: "Actors R19",
    edits: [
      {
        file: "src/core/context.ts",
        find: "      else values.set(slot, value.success);",
        replace: "      values.set(slot, Result.getOrUndefined(value));",
      },
    ],
  },
  {
    name: "context-cycle-admitted",
    tests: ["tests/actors/context.test.ts"],
    says: "a provider graph that reaches an actor again is admitted",
    rule: "Actors I28",
    edits: [
      {
        file: "src/host/wiring.ts",
        find: "      if (path.includes(key))",
        replace: "      if (path.length < 0)",
      },
    ],
  },
  {
    name: "provider-disposed-under-consumers",
    tests: ["tests/actors/context.test.ts"],
    says: "a provider with bound consumers is disposed",
    rule: "Actors R20",
    edits: [
      {
        file: "src/host/runtime.ts",
        find: "        dependents.length > 0 &&",
        replace: "        dependents.length < 0 &&",
      },
    ],
  },
  {
    name: "conflicting-ref-admitted",
    tests: ["tests/actors/context.test.ts"],
    says: "a ref with other context than its live identity's is admitted",
    rule: "Actors R5",
    edits: [
      {
        file: "src/host/runtime.ts",
        find: "      if (conflicting)",
        replace: "      if (conflicting && !conflicting)",
      },
    ],
  },
  {
    name: "follow-ups-uncapped",
    tests: ["tests/actors/follow-ups.test.ts"],
    says: "an admitted event's follow-ups run without bound",
    rule: "Actors I20",
    edits: [
      {
        file: "src/core/serve.ts",
        find: "        if (count >= FOLLOW_UPS && capped(followUp)) {",
        replace: "        if (count < 0 && capped(followUp)) {",
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

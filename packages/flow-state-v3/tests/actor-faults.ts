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
        find: "    const others = rotated || rest.length === 0 ? without(tx.world().mail, key) : tx.world().mail;",
        replace:
          "    const others = rest.length === 0 ? without(tx.world().mail, key) : tx.world().mail;",
      },
    ],
  },
  {
    name: "mailbox-not-fifo",
    tests: ["tests/generated/mix.test.ts"],
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
        find: "      if (incarnationOf(actor) === undefined && tx.world().records.has(actorKey(actor)))\n        incarnations.ensure(actor, Option.none(), true, Option.none());",
        replace:
          "      if (incarnationOf(actor) === undefined) incarnations.ensure(actor, Option.none(), false, Option.none());",
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
        find: '    if (started <= FOLLOW_UPS || !capped(mail) || (Mail.$is("Context")(mail) && !waits))',
        replace: '    if (started >= 0 || !capped(mail) || (Mail.$is("Context")(mail) && !waits))',
      },
    ],
  },
  {
    name: "wave-reads-unsettled-providers",
    tests: ["tests/actors/context.test.ts"],
    says: "a context update reads its providers while one of them still has mail of the same wave",
    rule: "Actors R19",
    edits: [
      {
        file: "src/core/serve.ts",
        find: '    if (!Mail.$is("Context")(mail) || !incarnations.context.settling(mail.actor)) return false;',
        replace: "    if (mail.actor.name.length >= 0) return false;",
      },
    ],
  },
  {
    name: "return-without-wave",
    tests: ["tests/actors/context.test.ts"],
    says: "a persisted consumer returning after its provider changed gets no onContext wave",
    rule: "Actors R9",
    edits: [
      {
        file: "src/core/incarnations.ts",
        find: "    if (context.differs(fresh, bound)) enqueue(Mail.Context({ actor }));",
        replace:
          '    if (context.differs(fresh, bound) && actor.name === "") enqueue(Mail.Context({ actor }));',
      },
    ],
  },
  {
    name: "record-forgets-seen-context",
    tests: ["tests/actors/context.test.ts"],
    says: "an actor record saves no last-seen context, so a return after a reload compares against nothing it saw",
    rule: "Actors R18",
    edits: [
      {
        file: "src/core/record.ts",
        find: "      seen: Object.fromEntries(incarnation.context),",
        replace: "      seen: {},",
      },
    ],
  },
  {
    name: "wave-events-behind-mail",
    tests: ["tests/actors/context.test.ts"],
    says: "a context update's reaction events go behind the mail already queued, after the event that returned the actor",
    rule: "Actors R9",
    edits: [
      {
        file: "src/core/context.ts",
        find: "    tx.enqueueFirst(events.map((event) => Mail.Event({ actor, ...event })));",
        replace: "    for (const event of events) tx.enqueue(Mail.Event({ actor, ...event }));",
      },
    ],
  },
  {
    name: "context-update-dropped-at-cap",
    tests: ["tests/actors/follow-ups.test.ts"],
    says: "a context update whose turn would start the 65th follow-up is refused and dropped",
    rule: "Actors R14",
    edits: [
      {
        file: "src/core/serve.ts",
        find: "    if (waits) tx.enqueueFirst([mail]);",
        replace: "    if (waits) refuseFollowUp(mail);",
      },
    ],
  },
  {
    name: "rollback-keeps-touched",
    tests: ["src/core/persist.test.ts"],
    says: "a turn undone by the follow-up cap leaves what it touched to be written",
    rule: "Actors R13",
    edits: [
      { file: "src/core/persist.ts", find: "  tx.remember(() => {", replace: "  void (() => {" },
    ],
  },
  {
    name: "foreign-context-ref-accepted",
    tests: ["tests/actors/context.test.ts"],
    says: "a context ref of a machine this Runtime's app does not run binds",
    rule: "Actors R24",
    edits: [
      {
        file: "src/host/wiring.ts",
        find: "      if (machines.get(ref.machine.compiled.id) !== ref.machine)",
        replace: "      if (machines.get(ref.machine.compiled.id) === undefined)",
      },
    ],
  },
  {
    name: "foreign-ref-accepted",
    tests: ["tests/actors/identity.test.ts"],
    says: "a ref of a machine this Runtime's app does not run is taken as one of its identities",
    rule: "Actors R24",
    edits: [
      {
        file: "src/host/runtime.ts",
        find: "    if (machines.get(ref.machine.compiled.id) === ref.machine) return actorIdOf(ref);",
        replace: "    if (ref.machine !== undefined) return actorIdOf(ref);",
      },
    ],
  },
  {
    name: "story-ensure-drops-ref-context",
    tests: ["tests/actors/context.test.ts"],
    says: "a Story's ensure binds its entry's default providers, dropping the ref's context",
    rule: "Actors R18",
    edits: [
      {
        file: "src/host/testing/run.ts",
        find: "      context.size === 0 ? Option.none() : Option.some(context),",
        replace: "      Option.none(),",
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

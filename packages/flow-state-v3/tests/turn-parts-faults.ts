import type { Fault } from "./faults.ts";

/**
 * Faults of the turn's parts (the walk, the applier, alarms and mail), each caught by its own
 * target tests. Each edits the code that owns its rule; when that code moves, a fault keeps its
 * test and takes a new `find` there.
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
        file: "src/core/apply.ts",
        find: "          tx.act(Act.Published({ actor: incarnation.actor, incarnation, why }));",
        replace:
          '          if (!Change.$is("Turn")(change) || sendsOf(change.turn).length > 0)\n          tx.act(Act.Published({ actor: incarnation.actor, incarnation, why }));',
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
        file: "src/core/apply.ts",
        find: "              issues: [...incarnation.issues.filter((i) => !Equal.equals(i.source, source)), issue],",
        replace:
          '              issues: [...incarnation.issues.filter((i) => !Equal.equals(i.source, source)), issue],\n              memory: { ...incarnation.memory, [Object.keys(incarnation.memory)[0] ?? ""]: null },',
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
        file: "src/core/apply.ts",
        find: "              context: read.context,",
        replace:
          '              context: read.context,\n              memory: { ...incarnation.memory, [Object.keys(incarnation.memory)[0] ?? ""]: null },',
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
        find: "    for (const actor of endOrder(tx.world()))",
        replace: "    for (const actor of endOrder(tx.world()).toReversed())",
      },
    ],
  },
  {
    name: "front-mail-yields",
    tests: ["src/core/turn-parts.test.ts", "tests/session/workspace.test.ts"],
    says: "a context update's reaction events wait in its mailbox, so the drain may yield between the update and the turns that repair it",
    rule: "Changes R21, I7",
    edits: [
      {
        file: "src/core/serve.ts",
        find: "      for (const event of front) serveOne(event);",
        replace: "      for (const event of front) tx.enqueue(event);",
      },
    ],
  },
  {
    name: "second-applier",
    tests: ["tests/surface/turn-parts.test.ts"],
    says: "the grace view writes an incarnation itself, a second applier beside apply",
    rule: "Changes R11, I4",
    edits: [
      {
        file: "src/core/incarnations.ts",
        find: "      if (busy) clearAlarm(grace);",
        replace: "      tx.putIncarnation(incarnation);\n\n      if (busy) clearAlarm(grace);",
      },
    ],
  },
  {
    name: "alarm-kept-asleep",
    tests: ["tests/turn/sequence.test.ts", "tests/home/schedules.test.ts"],
    says: "releasing an actor's last use leaves its schedule alarms set, so it keeps firing while unused",
    rule: "Changes I12",
    edits: [
      {
        file: "src/core/incarnations.ts",
        find: "    if (!used(actor) && Option.isSome(live(actor)))",
        replace: '    if (!used(actor) && Option.isSome(live(actor)) && actor.name === "")',
      },
    ],
  },
  {
    name: "index-stale:lanesOfActor",
    tests: ["tests/turn/sequence.test.ts"],
    says: "a new lane is left out of its identity's lanes index",
    rule: "Changes I13",
    edits: [
      {
        file: "src/core/tx.ts",
        find: '    if (before === undefined) addTo("lanesOfActor", key, id);',
        replace: "    if (before === undefined) void key;",
      },
    ],
  },
  {
    name: "index-stale:laneOfWait",
    tests: ["tests/turn/sequence.test.ts"],
    says: "a lane whose head waits on a call or ticket is left out of the wait index",
    rule: "Changes I13",
    edits: [
      {
        file: "src/core/tx.ts",
        find: '    for (const wait of Option.toArray(waitOf(lane))) draft("laneOfWait").set(wait, id);',
        replace: "    void waitOf;",
      },
    ],
  },
  {
    name: "reads-built-twice",
    tests: ["src/core/turn-parts.test.ts"],
    says: "a guard's input is built beside readsOf, without the context it reads",
    rule: "Changes R22, T15",
    edits: [
      {
        file: "src/core/walk.ts",
        find: '  const read = readsOf(input, "Guard", { event: input.payload });',
        replace:
          "  const read = { state: input.state, memory: input.memory, context: {}, event: input.payload };",
      },
    ],
  },
  {
    name: "why-misassigned",
    tests: ["tests/turn/sequence.test.ts"],
    says: "a start's publication says Turn, so its why is no function of its change's tag",
    rule: "Changes C6, I5",
    edits: [
      {
        file: "src/core/change.ts",
        find: '    Begin: () => Option.some<Why>("Begin"),',
        replace: '    Begin: () => Option.some<Why>("Turn"),',
      },
    ],
  },
  {
    name: "wake-per-alarm",
    tests: ["src/core/turn-parts.test.ts"],
    says: "each alarm set returns its own wake, one host timer per alarm",
    rule: "Changes T14, realization",
    edits: [
      {
        file: "src/core/tx.ts",
        find: '    draft("alarms").set(key, { alarm, at });',
        replace:
          '    draft("alarms").set(key, { alarm, at });\n    commands.push(Command.Wake({ at }));',
      },
    ],
  },
  {
    name: "wake-not-moved",
    tests: ["tests/home/schedules.test.ts"],
    says: "the host's wake is set only when no alarm was due, so an earlier alarm set later waits for the old wake",
    rule: "Changes T14, realization",
    edits: [
      {
        file: "src/core/tx.ts",
        find: "        if (Option.isSome(after) && !Equal.equals(before, after))",
        replace: "        if (Option.isSome(after) && Option.isNone(before))",
      },
    ],
  },
  {
    name: "tick-takes-early",
    tests: ["src/core/turn-parts.test.ts"],
    says: "a tick takes the alarms due within a second of now, so an early wake fires an alarm before its deadline",
    rule: "Changes T14",
    edits: [
      {
        file: "src/core/tx.ts",
        find: "    const due = [...world.alarms.values()].filter((a) => a.at <= env.now);",
        replace:
          "    const due = [...world.alarms.values()].filter((a) => a.at <= env.now + 1000);",
      },
    ],
  },
  {
    name: "alarm-kinds-reordered",
    tests: ["src/core/turn-parts.test.ts"],
    says: "a schedule's firing is taken before a grace due at the same instant",
    rule: "Changes Q9",
    edits: [
      {
        file: "src/core/alarms.ts",
        find: "  Grace: 4,\n  Schedule: 5,",
        replace: "  Grace: 5,\n  Schedule: 4,",
      },
    ],
  },
  {
    name: "disposed-mail-unseen",
    tests: ["src/core/turn-parts.test.ts"],
    says: "an event queued for an actor disposed in the same step is dropped with no evidence",
    rule: "Changes R24",
    edits: [
      {
        file: "src/core/apply.ts",
        find: "                tx.act(Act.Unhandled({ actor: mail.actor, event: mail.tag }));",
        replace: "                void mail;",
      },
    ],
  },
  {
    name: "wave-skipped-on-change",
    tests: ["tests/actors/context.test.ts"],
    says: "a turn that changes its memory but not its state sends no context wave",
    rule: "Changes Q9, R2",
    edits: [
      {
        file: "src/core/apply.ts",
        find: "              (b) => b.state !== incarnation.state || b.memory !== incarnation.memory,",
        replace: "              (b) => b.state !== incarnation.state,",
      },
    ],
  },
];

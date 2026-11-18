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
        find: "  return Result.mapError(\n    Result.flatMap(compiled.identity.encode(input), (encoded) =>",
        replace:
          "  return Result.succeed(JSON.stringify(value));\n  return Result.mapError(\n    Result.flatMap(compiled.identity.encode(input), (encoded) =>",
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
        find: "    if (!field.is(given)) return Result.fail(Option.some(field.name));",
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
        find: "world.persistence && !isLocalName(actor.name);",
        replace: "world.persistence;",
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
        find: '    if (incarnationOf(actor) !== undefined) tx.putUses(actor, ["host"]);',
        replace: "    void tx.putUses;",
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
        find: "armSchedules(withoutIssue(base, route.source), accepted.arm);",
        replace: "armSchedules({ ...base, issues: [] }, accepted.arm);",
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
        find: "        publish(\n          raised(\n            incarnation,\n            tx.refuse(\n              incarnation.actor,\n              { source: route.source, code, slot: Option.some(slot) },\n              route.ending,\n            ),\n          ),\n        );",
        replace:
          "        tx.refuse(incarnation.actor, { source: route.source, code, slot: Option.some(slot) }, route.ending);\n        publish(incarnation);",
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
        find: '    tx.put("ended", actorKey(incarnation.actor), terminal(incarnation));',
        replace: "    void terminal;",
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
        find: '          tx.refuse(actor, { source: CREATION, code: "InvalidTurn", slot: Option.some(slot) }),',
        replace:
          '          tx.refuse(actor, { source: CREATION, code: "InvalidTurn", slot: Option.none() }),',
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
        file: "src/core/tx.ts",
        find: '    else if (place === "rotate") {\n      draft("mail").delete(key);',
        replace:
          '    else if (place === "rotate" && mailbox.length < 0) {\n      draft("mail").delete(key);',
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
        find: "    box(key).push(mail);",
        replace: "    box(key).unshift(mail);",
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
        find: '      if (incarnationOf(actor) === undefined && tx.world().records.has(actorKey(actor)))\n        incarnations.ensure(actor, Option.none(), "wake", Option.none());',
        replace:
          '      if (incarnationOf(actor) === undefined) incarnations.ensure(actor, Option.none(), "create", Option.none());',
      },
    ],
  },
  {
    name: "mailbox-capped",
    tests: ["tests/actors/send.test.ts"],
    says: "an external send is refused while 1,024 sends wait to be stepped",
    rule: "Actors R14, I22",
    edits: [
      {
        file: "src/host/driver.ts",
        find: "      input(Input.Send({ actor, tag, payload: decoded.value }));",
        replace:
          '      if (inbox.length >= 1024) throw new Error("mailbox full");\n      input(Input.Send({ actor, tag, payload: decoded.value }));',
      },
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
        find: "    for (const queued of lane.queue) owners.add(queued.owner);",
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
    name: "foreign-handle-accepted",
    tests: ["tests/actors/identity.test.ts"],
    says: "another Runtime's handle is taken as naming this Runtime's actor",
    rule: "Actors R24",
    edits: [
      {
        file: "src/host/runtime.ts",
        find: "    if (link.runtime === driver) return link.actor;",
        replace: "    return link.actor;",
      },
    ],
  },
  {
    name: "unencodable-name-blames-machine",
    tests: ["tests/actors/identity.test.ts"],
    says: "an input with no encoded form is reported as a missing field named after the machine",
    rule: "Actors R6",
    edits: [
      {
        file: "src/host/refs.ts",
        find: "              path: [compiled.id],\n",
        replace: "              path: [compiled.id, compiled.id],\n",
      },
    ],
  },
];

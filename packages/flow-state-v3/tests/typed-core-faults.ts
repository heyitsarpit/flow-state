import type { Fault } from "./faults.ts";

/**
 * Wrong core shapes: a chain id counted from the live chains, forget dropping a record it could not
 * read, Flow's restored marker read from a reason, every owner the root, and a bench worker that
 * takes any flag.
 */
export const typedCoreFaults: ReadonlyArray<Fault> = [
  {
    name: "patch-writes-input",
    tests: ["tests/actors/memory-writes.test.ts"],
    says: "a turn's memory write may name an input field, so an identity field is rewritten",
    rule: "Compile R7",
    edits: [
      {
        file: "src/core/turn.ts",
        find: '    if (field.name === name) return field.source._tag !== "Input";',
        replace: "    if (field.name === name) return true;",
      },
    ],
  },
  {
    name: "patch-writes-undeclared",
    tests: ["tests/actors/memory-writes.test.ts"],
    says: "a turn's memory write may name a field the machine never declared",
    rule: "Compile R14",
    edits: [
      {
        file: "src/core/turn.ts",
        find: '    if (field.name === name) return field.source._tag !== "Input";\n\n  return false;',
        replace:
          '    if (field.name === name) return field.source._tag !== "Input";\n\n  return true;',
      },
    ],
  },
  {
    name: "capture-ms-negative",
    tests: ["tests/surface/surface.test.ts"],
    says: "a negative captureMs passes the setup's Schema and acts as 0",
    rule: "Diagnostics R5",
    edits: [
      {
        file: "src/config.ts",
        find: "Schema.Number.check(Schema.isFinite().abort(), Schema.isGreaterThanOrEqualTo(0))",
        replace: "Schema.Number.check(Schema.isFinite().abort())",
      },
    ],
  },
  {
    name: "chain-id-from-count",
    tests: ["src/core/serve.test.ts"],
    says: "a chain id is one past the live chains, so after a partial clear a new chain resets a live chain's count",
    rule: "Actors R13",
    edits: [
      {
        file: "src/core/tx.ts",
        find: "    world.chainCount += 1;",
        replace: "    world.chainCount = world.chains.size + 1;",
      },
    ],
  },
  {
    name: "forget-drops-unreadable",
    tests: ["src/core/ledger.test.ts"],
    says: "forget drops every quarantined lane record, a record it could not read included",
    rule: "Actors R21",
    edits: [
      {
        file: "src/core/incarnations.ts",
        find: "        Unreadable: () => [],",
        replace:
          '        Unreadable: () => [{ _tag: "Retired" as const, actor, record, operation: "", lane: "" as never }],',
      },
    ],
  },
  {
    name: "restored-by-reason",
    tests: ["src/core/ledger.test.ts"],
    says: "Flow's restored marker is read from the reason, so a host's reason spelled Restored writes the owed record",
    rule: "WriteLanes I15",
    edits: [
      {
        file: "src/core/ledger.ts",
        find: "  SAVED_DELIVERY[row.delivery._tag] || SAVED_ORIGIN[row.origin._tag];",
        replace:
          '  SAVED_DELIVERY[row.delivery._tag] || SAVED_ORIGIN[row.origin._tag] || Reflect.get(row, "reason") === "Restored";',
      },
    ],
  },
  {
    name: "owner-always-root",
    tests: ["tests/write-lanes/payment-leave-and-reload.test.ts"],
    says: "the work a state starts is owned by the root, so an ending is never late and a late turn leaves its state",
    rule: "Turn R21",
    edits: [
      {
        file: "src/core/lanes.ts",
        find: "        { onNone: () => OwnedBy.Root(), onSome: (activation) => OwnedBy.State({ activation }) },",
        replace: "        { onNone: () => OwnedBy.Root(), onSome: () => OwnedBy.Root() },",
      },
    ],
  },
  {
    name: "worker-takes-any-flag",
    tests: ["tests/bench/worker-args.test.ts"],
    says: "the bench worker skips a flag it does not know, so a flag renamed by the run is dropped",
    rule: "Bench worker arguments",
    edits: [
      {
        file: "bench/worker-args.ts",
        find: "          strict: true,",
        replace: "          strict: false,",
      },
      {
        file: "bench/worker-args.ts",
        find: "    const text = (flag: string) => Option.fromUndefinedOr(values[flag]);",
        replace:
          '    const text = (flag: string) =>\n      Option.filter(Option.fromUndefinedOr(values[flag]), (v): v is string => typeof v === "string");',
      },
    ],
  },
  {
    name: "start-order-reversed",
    tests: ["tests/shop/store.test.ts"],
    says: "identities handled together go newest first, so BlockedByDependents names the checkout flow before the badge",
    rule: "Actors R28",
    edits: [
      {
        file: "src/core/world.ts",
        find: "export const byStart = (a: Incarnation, b: Incarnation) => a.started - b.started;",
        replace:
          "export const byStart = (a: Incarnation, b: Incarnation) => b.started - a.started;",
      },
    ],
  },
  {
    name: "dependents-newest-first",
    tests: ["tests/shop/store.test.ts"],
    says: "a provider's dependents go newest first, so BlockedByDependents names the checkout flow before the badge",
    rule: "Actors R28",
    edits: [
      {
        file: "src/core/step.ts",
        find: ".toSorted(byStart)",
        replace: ".toSorted((a, b) => byStart(b, a))",
      },
    ],
  },
  {
    name: "wave-consumers-newest-first",
    tests: ["tests/shop/store.test.ts"],
    says: "a context wave reaches its consumers newest first, so the checkout flow's turn runs before the badge's",
    rule: "Actors R28",
    edits: [
      {
        file: "src/core/tx.ts",
        find: ".toSorted(byStart);",
        replace: ".toSorted((a, b) => byStart(b, a));",
      },
    ],
  },
  {
    name: "graces-newest-first",
    tests: ["tests/shop/store.test.ts"],
    says: "the graces one step judges are armed newest first, so the Pay's grace ends before the cart's",
    rule: "Actors R28",
    edits: [
      {
        file: "src/core/incarnations.ts",
        find: ".toSorted(byStart);",
        replace: ".toSorted((a, b) => byStart(b, a));",
      },
    ],
  },
  {
    name: "disposal-ready-in-queue-order",
    tests: ["tests/shop/store.test.ts"],
    says: "the Runtime's disposal takes ready identities in the order they became ready, so the Pay ends before the older shopper",
    rule: "Actors R28",
    edits: [
      {
        file: "src/core/disposal.ts",
        find: "ready.splice(ready.findLastIndex((i) => byStart(i, provider) > 0) + 1, 0, provider);",
        replace: "ready.unshift(provider);",
      },
    ],
  },
  {
    name: "restore-arms-inactive-schedule",
    tests: ["tests/sign-in/trusted-device.test.ts"],
    says: "a restore arms every saved schedule, a state's the record no longer holds included",
    rule: "Turn R14",
    edits: [
      {
        file: "src/core/schedules.ts",
        find: "    const declared = declaredOn(tx.machines, incarnation);",
        replace:
          "    const declared = [...(tx.machines.get(incarnation.actor.machine)?.states.values() ?? [])].flatMap((n) => n.schedules);",
      },
    ],
  },
  {
    name: "update-patch-unchecked",
    tests: ["tests/actors/memory-writes.test.ts"],
    says: "an update's return is merged without checking it is a record, so null escapes the turn",
    rule: "Turn R10",
    edits: [
      {
        file: "src/core/walk.ts",
        find: "          const written = recordFrom(",
        replace:
          "          const written = ((slot: typeof update, read: Parameters<typeof update.run>[0]) => Result.try({ try: () => slot.run(read), catch: () => ({ slot: slot.slot }) }))(",
      },
    ],
  },
  {
    name: "untaken-ending-unpublished",
    tests: ["tests/write-lanes/payment-leave-and-reload.test.ts"],
    says: "an ending the turn denies settles its lane but publishes nothing, so the row a screen shows stays pending",
    rule: "Turn R19, I15",
    edits: [
      {
        file: "src/core/change.ts",
        find: '    Unturned: () => Option.some<Why>("Other"),',
        replace: "    Unturned: () => Option.none<Why>(),",
      },
    ],
  },
];

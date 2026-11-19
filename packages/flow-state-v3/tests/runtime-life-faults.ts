import type { Fault } from "./faults.ts";

const fault = (
  name: string,
  rule: string,
  tests: ReadonlyArray<string>,
  says: string,
  file: string,
  find: string,
  replace: string,
) => ({ name, rule, tests, says, edits: [{ file, find, replace }] });

/**
 * Wrong runtimes of the Runtime's life and its end: a write list that hides unbound lanes, a
 * cleanup failure dropped, services released before calls, terminal evidence providers first, a
 * forget that keeps a retired hold, a boot that hides an unbound lane, and a disposeActor that
 * keeps its record's quarantine or its mail; each planted alone like the runtime's other faults.
 */
export const runtimeLifeFaults: ReadonlyArray<Fault> = [
  fault(
    "unsettled-skips-unbound",
    "Actors R26",
    ["tests/actors/runtime-life.test.ts"],
    "unsettledWrites lists only bound identities, so a host warns of nothing for a disposed hold",
    "src/host/close.ts",
    "    .flatMap(([key, lanes]) =>",
    "    .filter(([key]) => world.incarnations.has(key) || world.records.has(key))\n    .flatMap(([key, lanes]) =>",
  ),
  fault(
    "cleanup-failure-dropped",
    "Actors R23",
    ["src/host/runtime.test.ts", "tests/actors/runtime-life.test.ts"],
    "a services finalizer that fails at disposal is dropped, so dispose succeeds",
    "src/host/close.ts",
    "      onFailure: (cause) => [...driver.cleanups(), cause],",
    "      onFailure: () => driver.cleanups(),",
  ),
  fault(
    "interrupt-cleanup-dropped",
    "Actors R23",
    ["tests/actors/runtime-life.test.ts"],
    "a call's interrupt cleanup that fails once the disposal interrupts it is dropped with its late result",
    "src/host/driver.ts",
    "        cleanups.push(exit.cause);",
    "        cleanups.slice();",
  ),
  fault(
    "services-released-before-calls",
    "Actors R22",
    ["tests/actors/runtime-life.test.ts"],
    "the Scope releases the services before every call is interrupted and awaited, so a slow cleanup runs on a closed service",
    "src/host/close.ts",
    "    yield* fibers.clear;\n    const released = yield* Effect.exit(Scope.close(scope, Exit.void));",
    "    const released = yield* Effect.exit(Scope.close(scope, Exit.void));\n    yield* fibers.clear;",
  ),
  fault(
    "providers-finished-first",
    "Inspection O3",
    ["tests/actors/runtime-life.test.ts"],
    "the Runtime's disposal gives providers' terminal evidence before their consumers'",
    "src/core/disposal.ts",
    "  return order;",
    "  return order.toReversed();",
  ),
  fault(
    "forget-keeps-gone-hold",
    "Actors R21",
    ["tests/actors/runtime-life.test.ts"],
    "forget keeps a hold whose operation is gone, so every boot reports it and the store keeps it",
    "src/core/incarnations.ts",
    "    if (forgetting) forgetRetired(actor);",
    "    if (forgetting && false) forgetRetired(actor);",
  ),
  fault(
    "unbound-lane-unreported",
    "Actors R20",
    ["tests/actors/runtime-life.test.ts"],
    "a boot lists an unbound lane but never reports it",
    "src/core/incarnations.ts",
    "    reportUnbound(restored.lanes);",
    "    reportUnbound([]);",
  ),
  fault(
    "dispose-keeps-quarantine",
    "Actors R20",
    ["tests/shop/renewals.test.ts"],
    "disposeActor keeps the boot's quarantine of the record it removed, so a send drops RecordUndecodable while a batch is out",
    "src/core/incarnations.ts",
    '    if (tx.world().quarantined.has(actorRecordKey(key)))\n      tx.drop("quarantined", actorRecordKey(key));',
    "",
  ),
  fault(
    "dispose-keeps-mail",
    "Actors R10",
    ["src/host/runtime.test.ts"],
    "disposeActor keeps the identity's queued mail, so a new incarnation hears the old one's events",
    "src/core/incarnations.ts",
    "    tx.dropMail(actor);",
    "",
  ),
];

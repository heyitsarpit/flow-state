import { Context, Effect, Result, Stream } from "effect";

import { app, module } from "../../src/app/app.js";
import { definition } from "../../src/definition/definition.js";
import { Implementation } from "../../src/implementation/implementation.js";
import { machine } from "../../src/machine/machine.js";
import { resource } from "../../src/operation/resource.js";
import { stream } from "../../src/operation/stream.js";
import { transaction } from "../../src/operation/transaction.js";

// TYPE-P02 / TYPE-P03 / TYPE-P04 / PROOF-001.
// Production owners: definition, machine, operation, app, and implementation feature modules.
// Rationale: these compile-only cases prove the currently available owners reject invalid static shapes.
// Blocked lanes: packed public declaration negatives and later actor/runtime/persistence/host owners.

const definitionSuccess = <Value>(result: Result.Result<Value, unknown>): Value => {
  if (Result.isFailure(result)) throw result.failure;
  return result.success;
};

class NegativeRepo extends Context.Service<
  NegativeRepo,
  { readonly read: () => Effect.Effect<string> }
>()("StaticHarness/NegativeRepo") {}

const ValidDefinition = definitionSuccess(
  definition({
    id: "static-negative/valid",
    states: ["ready"],
    events: { opened: (id: string) => ({ id }) },
  }),
);

const OtherDefinition = definitionSuccess(
  definition({
    id: "static-negative/other",
    states: ["ready"],
    events: { opened: (id: string) => ({ id }) },
  }),
);

const validMachine = machine(ValidDefinition, ({ S }) => ({
  default: S.ready,
  states: { ready: {} },
}));

const validResource = resource({
  id: "static-negative/resource",
  key: (id: string) => [id] as const,
  lookup: (id: string): Effect.Effect<string, "missing", NegativeRepo> => Effect.succeed(id),
});

const validTransaction = transaction({
  id: "static-negative/transaction",
  key: (id: string) => [id] as const,
  commit: (id: string): Effect.Effect<string, "rejected", NegativeRepo> => Effect.succeed(id),
});

const validStream = stream({
  id: "static-negative/stream",
  key: (id: string) => [id] as const,
  subscribe: (id: string): Stream.Stream<string, "offline", NegativeRepo> => Stream.make(id),
});

const invalidEventMarker = null;

const invalidOwnerCompilations = (): void => {
  definition({
    id: "static-negative/bad-memory",
    states: ["ready"],
    events: {},
    // @ts-expect-error TYPE-P02: definition memory initializers return object memory.
    memory: () => "not-memory",
  });

  definition({
    id: "static-negative/invalid-event-marker",
    states: ["ready"],
    // @ts-expect-error TYPE-P02: zero-argument events require the exact "bare" marker.
    events: { closed: invalidEventMarker },
  });

  definition({
    id: "static-negative/unknown-event-marker",
    states: ["ready"],
    // @ts-expect-error TYPE-P02: arbitrary strings are not event declarations.
    events: { closed: "empty" },
  });

  machine(ValidDefinition, ({ S }) => ({
    default: S.ready,
    states: {
      ready: {},
      unknown: {},
    },
  }));

  machine(ValidDefinition, () => ({
    // @ts-expect-error TYPE-P02: a machine default retains its originating definition.
    default: OtherDefinition.S.ready,
    states: { ready: {} },
  }));

  machine(ValidDefinition, ({ E }) => {
    // @ts-expect-error TYPE-P02: event constructors retain their authored argument tuple.
    E.opened(1);
    return { default: ValidDefinition.S.ready, states: { ready: {} } };
  });

  resource({
    id: "static-negative/bad-key",
    // @ts-expect-error TYPE-P02: resource keys are bounded canonical tuples.
    key: (id: string) => id,
    lookup: (id: string) => Effect.succeed(id),
  });

  transaction({
    id: "static-negative/bad-transaction-key",
    // @ts-expect-error TYPE-P02: transaction keys are bounded canonical tuples.
    key: (id: string) => id,
    commit: (id: string) => Effect.succeed(id),
  });

  stream({
    id: "static-negative/bad-stream-key",
    // @ts-expect-error TYPE-P02: stream keys are bounded canonical tuples.
    key: (id: string) => id,
    subscribe: (id: string) => Stream.make(id),
  });

  resource({
    id: "static-negative/bad-value",
    key: (id: string) => [id] as const,
    // @ts-expect-error TYPE-P02: resource success values cannot be undefined.
    lookup: () => Effect.succeed(undefined),
  });

  const invalidMachineRecord = module({
    id: "static-negative/bad-module",
    // @ts-expect-error TYPE-P02: modules admit constructed machines, not definitions.
    machines: { root: ValidDefinition },
  });
  void invalidMachineRecord;

  const invalidAppRecord = app({
    id: "static-negative/bad-app",
    persistenceVersion: "1",
    // @ts-expect-error TYPE-P02: app modules must be constructed module records.
    modules: [{ id: "not-a-module", machines: {} }],
  });
  void invalidAppRecord;

  const invalidImplementation = Implementation.effect(
    NegativeRepo,
    // @ts-expect-error TYPE-P04: implementation effects preserve the service value type.
    Effect.succeed(42),
  );
  void invalidImplementation;

  // @ts-expect-error TYPE-P02: stream descriptors do not expose actor cancellation.
  validStream.cancel(validStream.key("id"));
  // @ts-expect-error TYPE-P02: transaction params retain their own authored shape.
  validTransaction.commit({ id: "wrong-shape" });
  void validResource;
  void validMachine;
};

void invalidOwnerCompilations;

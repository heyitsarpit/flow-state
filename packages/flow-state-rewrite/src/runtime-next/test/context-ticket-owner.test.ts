import { assert, describe, it } from "@effect/vitest";
import { Result } from "effect";

import { definition } from "../../definition/definition.js";
import { Failure } from "../../diagnostic/diagnostic.js";
import { machine } from "../../machine/machine.js";
import { makeActorDirectory } from "../actor/actor-directory.js";
import { makeContextOffer, makeContextTicket } from "../context/context-ticket.js";
import type { ContextWaveResult } from "../context/context-wave.js";
import { copyStructural } from "../structural-copy.js";

const DefinitionResult = definition({
  id: "runtime-next/context-ticket-owner",
  states: ["idle"],
  events: {},
});

const Definition = Result.getOrThrow(DefinitionResult);

const Consumer = Result.getOrThrow(
  definition({
    id: "runtime-next/context-ticket-consumer",
    states: ["idle"],
    events: {},
    context: { value: Definition.select(() => ({ nested: { value: Number(1) } })) },
  }),
);

const Machine = Result.getOrThrow(
  machine(DefinitionResult, ({ S }) => ({ default: S.idle, states: { idle: {} } })),
);

const identity = (name: string) => {
  const directory = makeActorDirectory<string>({ machines: [Machine] });

  const reserved = Result.getOrThrow(
    directory.reserve({
      kind: "stable",
      ref: { machine: Machine, id: name, persist: false },
    }),
  );

  assert.strictEqual(reserved._tag, "create");

  if (reserved._tag !== "create") throw Error("Expected a fresh actor identity");

  return reserved.reservation.identity;
};

describe("runtime-next context ticket owner", () => {
  it("rejects cloned receivers, replay, stale consumers, and cancellation", () => {
    const consumer = identity("consumer");
    const foreign = identity("foreign");
    const offer = { entries: [], issueOnly: false, selectorDefects: [] };

    const mint = () =>
      makeContextTicket({
        offer,
        identity: consumer,
        expectedRevision: 4,
        validateCurrent: () => Result.succeed(undefined),
      });

    const authentic = mint();
    const clone = new Proxy(authentic.ticket, {});
    assert.ok(Result.isFailure(clone.consume(consumer, 4)));
    assert.ok(Result.isSuccess(authentic.ticket.consume(consumer, 4)));
    assert.ok(Result.isFailure(authentic.ticket.consume(consumer, 4)));

    const staleIdentity = mint();
    assert.ok(Result.isFailure(staleIdentity.ticket.consume(foreign, 4)));
    assert.ok(Result.isFailure(staleIdentity.ticket.consume(consumer, 4)));

    const staleRevision = mint();
    assert.ok(Result.isFailure(staleRevision.ticket.consume(consumer, 3)));

    const cancelled = mint();
    cancelled.cancel();
    assert.ok(Result.isFailure(cancelled.ticket.consume(consumer, 4)));

    const invalidated = makeContextTicket({
      offer,
      identity: consumer,
      expectedRevision: 4,
      validateCurrent: () =>
        Result.fail(
          Failure({
            code: "MissingContextProvider",
            path: ["context"],
            details: {},
            summary: "Provider was retired",
            help: "Register a current provider.",
          }),
        ),
    });

    assert.ok(Result.isFailure(invalidated.ticket.consume(consumer, 4)));
  });

  it("publishes one owned complete offer across caller mutation", () => {
    const provider = identity("provider");
    const consumer = identity("consumer");
    const source = { nested: { value: 1 } };
    const selected = Result.getOrThrow(copyStructural(source, "context"));
    const cut = { identity: provider, revision: 2 };
    const slot = "value" as const;
    const values = new Map([[slot, selected]]);
    const providers = new Map([[slot, cut]]);

    const result: ContextWaveResult<typeof Consumer> = {
      projection: { values, providers, has: (requested: string) => requested === slot },
      ledger: new Map(),
      changedSlots: new Set([slot]),
      selectorDefects: [],
      publication: "changed" as const,
    };

    const offer = Result.getOrThrow(makeContextOffer<typeof Consumer>(result));

    const issued = makeContextTicket<typeof Consumer>({
      offer,
      identity: consumer,
      expectedRevision: 1,
      validateCurrent: () => Result.succeed(undefined),
    });

    source.nested.value = 9;
    const accepted = Result.getOrThrow(issued.ticket.consume(consumer, 1));
    assert.strictEqual(accepted.entries[0]?.value.nested.value, 1);
    assert.strictEqual(accepted.entries[0]?.provider.identity, provider);
    assert.ok(Object.isFrozen(accepted.entries));
    assert.ok(Object.isFrozen(accepted.entries[0]));
    assert.strictEqual(Object.isFrozen(source), false);
  });
});

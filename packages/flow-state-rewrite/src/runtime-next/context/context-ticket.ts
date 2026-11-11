import { Predicate, Result } from "effect";

import type { ContextOf } from "../../definition/domain.js";
import { Failure, type PublicDiagnostic } from "../../diagnostic/diagnostic.js";
import type { MachineDefinition } from "../../machine/grammar.js";
import type { ActorIdentity } from "../actor/actor-directory.js";
import { copyStructural } from "../structural-copy.js";
import type { ContextCut } from "./lineage.js";
import type { ContextSlot, ContextWaveResult } from "./context-wave.js";

const ticketBrand = Symbol("ContextTicket");

const rejected = (reason: string) =>
  Failure({
    code: "MissingContextProvider",
    path: ["context", "ticket"],
    details: { reason },
    summary: "This context ticket cannot publish a cut.",
    help: "Use one current coordinator-issued ticket once.",
  });

// oxlint-disable-next-line anti-slop/no-readonly -- A ticket offer is copied once and published as an immutable projection envelope.
export type ContextOffer<D extends MachineDefinition> = Readonly<{
  // oxlint-disable-next-line anti-slop/no-readonly -- A ticket offer is copied once and published as an immutable projection envelope.
  entries: readonly Readonly<{
    slot: ContextSlot<D>;
    value: ContextOf<D>[ContextSlot<D>];
    provider: ContextCut;
  }>[];
  issueOnly: boolean;
  selectorDefects: ContextWaveResult<D>["selectorDefects"];
}>;

/** The private symbol prevents callers from constructing this capability in TypeScript. */
// oxlint-disable-next-line anti-slop/no-readonly -- The coordinator-issued one-shot ticket cannot have its brand or consume capability replaced.
export type ContextTicket<D extends MachineDefinition> = Readonly<{
  [ticketBrand]: true;
  consume(
    identity: ActorIdentity,
    revision: number,
  ): Result.Result<ContextOffer<D>, PublicDiagnostic>;
}>;

// oxlint-disable-next-line anti-slop/no-readonly -- The issued ticket and its coordinator-held cancel capability remain one fixed pair.
export type IssuedContextTicket<D extends MachineDefinition> = Readonly<{
  ticket: ContextTicket<D>;
  cancel(): void;
}>;

/** Own the offer envelope while preserving already-owned selected values. */
// RETURN_TYPE: The offer owns a complete machine-specific projection or fails.
export const makeContextOffer = <D extends MachineDefinition>(
  result: ContextWaveResult<D>,
): Result.Result<ContextOffer<D>, PublicDiagnostic> => {
  const entries: Array<ContextOffer<D>["entries"][number]> = [];
  const opaque: Exclude<WeakKey, symbol>[] = [];

  for (const [slot, value] of result.projection.values) {
    const provider = result.projection.providers.get(slot);

    if (provider === undefined) return Result.fail(rejected("incomplete-projection"));

    if (Predicate.isObject(value)) opaque.push(value);
    opaque.push(provider.identity);
    entries.push({ slot, value, provider });
  }

  const offer: ContextOffer<D> = {
    entries,
    issueOnly: result.publication === "issue-only",
    selectorDefects: [...result.selectorDefects],
  };

  return copyStructural(offer, "context", opaque);
};

/** Mint one ticket; the coordinator retains cancel and supplies the live validator. */
// RETURN_TYPE: Ticket creation preserves its machine-specific one-shot capability.
export const makeContextTicket = <D extends MachineDefinition>(options: {
  offer: ContextOffer<D>;
  identity: ActorIdentity;
  expectedRevision: number;
  validateCurrent(): Result.Result<void, PublicDiagnostic>;
}): IssuedContextTicket<D> => {
  let used = false;
  let cancelled = false;

  const ticket: ContextTicket<D> = {
    [ticketBrand]: true as const,
    consume(this: ContextTicket<D>, identity: ActorIdentity, revision: number) {
      if (this !== ticket) return Result.fail(rejected("forged-receiver"));

      if (used || cancelled) return Result.fail(rejected("replayed-or-cancelled"));
      used = true;

      if (!Object.is(identity, options.identity) || revision !== options.expectedRevision)
        return Result.fail(rejected("stale-consumer"));

      const current = options.validateCurrent();

      return Result.isFailure(current)
        ? Result.fail(current.failure)
        : Result.succeed(options.offer);
    },
  };

  return {
    ticket,
    cancel() {
      cancelled = true;
    },
  };
};

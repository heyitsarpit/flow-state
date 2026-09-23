import { Effect, Exit, Option, Result, Scope } from "effect";

import type { MachineDefinition } from "../../machine/grammar.js";
import type { PublicDiagnostic } from "../../diagnostic/diagnostic.js";
import type { ActorSnapshot } from "../runtime.js";
import type { ActorIdentity } from "../actor/actor-directory.js";
import { copyStructural } from "../structural-copy.js";
import { buildContextGraph, planContextWave, type ContextGraph } from "./context-wave.js";
import {
  makeContextTicket,
  type ContextOffer,
  type IssuedContextTicket,
} from "./context-ticket.js";

import {
  prepareContextParticipant,
  contextDiagnostic,
  type RegisteredContextNode,
  captureContextParticipant,
  validateContextProviderCut,
  validateCapturedContextCuts,
  prepareContextWaveNode,
  type ContextCapturedProvider,
  type ContextNode,
  type ContextProjectionTicket,
  type PlannedContextNode,
} from "./context-participant.js";
import { makeContextRootQueue, type ContextRootWork } from "./context-root-queue.js";
import { makeContextWaveChanges } from "./context-debt.js";

export type {
  ContextCapturedProvider,
  ContextNode,
  ContextParticipant,
  ContextProjectionTicket,
  ContextTicketOutcome,
} from "./context-participant.js";

const notificationBrand = Symbol("ContextNotification");

/** Successor checks are shared by every coordinator-owned generation. */
export const checkedContextGeneration = (current: number) =>
  Number.isSafeInteger(current) && current >= 0 && current < Number.MAX_SAFE_INTEGER
    ? Result.succeed(current + 1)
    : Result.fail(contextDiagnostic("generation-overflow"));

const sameIdentity = (left: ActorIdentity, right: ActorIdentity) => Object.is(left, right);

export type ContextRegistration = Readonly<{
  enable(): void;
  unregister(): void;
}>;

export type ContextRoot<D extends MachineDefinition> = Readonly<{
  identity: ActorIdentity;
  snapshot: ActorSnapshot<D>;
}>;

export type ContextNotification = Readonly<{
  [notificationBrand]: true;
}>;

export interface ContextCoordinator {
  register<D extends MachineDefinition>(
    node: ContextNode<D>,
  ): Result.Result<ContextRegistration, PublicDiagnostic>;
  prepareNotification<D extends MachineDefinition>(
    root: ContextRoot<D>,
  ): Result.Result<ContextNotification, PublicDiagnostic>;
  publish(notification: ContextNotification): "accepted" | "coalesced";
  cancel(notification: ContextNotification): void;
  quiesce(): Effect.Effect<void, PublicDiagnostic>;
  drain(): Effect.Effect<void, PublicDiagnostic>;
  close(): Effect.Effect<void, PublicDiagnostic>;
}

type PreparedNotification = {
  identity: ActorIdentity;
  snapshot: ActorSnapshot<MachineDefinition>;
  generation: number;
  status: "prepared" | "published" | "cancelled";
};

/** Owns participant registration, root scheduling, tickets, and shutdown. */
// RETURN_TYPE: The owner service exposes its scoped Effect and diagnostic lane.
export const makeContextCoordinator = (
  ownerScope: Scope.Scope,
  options: { maxNodes: number; maxFanout: number } = { maxNodes: 2_048, maxFanout: 16 },
): Effect.Effect<ContextCoordinator, PublicDiagnostic> =>
  Effect.gen(function* () {
    const maxNodes = options.maxNodes;
    const maxFanout = options.maxFanout;

    if (
      !Number.isSafeInteger(maxNodes) ||
      maxNodes < 1 ||
      !Number.isSafeInteger(maxFanout) ||
      maxFanout < 1
    )
      return yield* Effect.fail(contextDiagnostic("invalid-capacity"));

    const nodes = new Map<string, RegisteredContextNode>();

    const graphNodes = () =>
      [...nodes.values()].flatMap(({ registered, identity, providers }) =>
        registered ? [{ identity, providers }] : [],
      );

    const notifications = new WeakMap<ContextNotification, PreparedNotification>();
    const activeTickets = new Set<ContextProjectionTicket<MachineDefinition>>();
    const activeTicketCancels = new Set<() => void>();
    let graph: ContextGraph = Result.getOrThrow(buildContextGraph([]));
    let graphGeneration = 0;
    let waveGeneration = 0;
    let notificationGeneration = 0;
    let phase: "open" | "quiescing" | "closed" = "open";

    const capture = (key: string, root?: ContextRootWork) => {
      const state = nodes.get(key);

      if (state === undefined || !state.registered || !state.enabled)
        return Result.fail(contextDiagnostic("unavailable-participant", key));

      if (root !== undefined && key === root.identity.key)
        return Result.succeed({ identity: root.identity, snapshot: root.snapshot });

      return captureContextParticipant(state);
    };

    const invalidateTickets = () => {
      for (const cancelTicket of activeTicketCancels) cancelTicket();

      for (const ticket of activeTickets) ticket.cancel();
    };

    const runWave = (root: ContextRootWork) =>
      Effect.gen(function* () {
        const nextWave = checkedContextGeneration(waveGeneration);

        if (Result.isFailure(nextWave)) return yield* Effect.fail(nextWave.failure);
        waveGeneration = nextWave.success;
        const capturedGraph = graph;
        const capturedGeneration = graphGeneration;
        const plan = planContextWave(capturedGraph, root.identity);

        if (Result.isFailure(plan)) return yield* Effect.fail(plan.failure);

        const captured = new Map<string, ContextCapturedProvider>();

        for (const identity of plan.success.order) {
          const observed = capture(identity.key, root);

          if (Result.isFailure(observed)) return yield* Effect.fail(observed.failure);
          captured.set(identity.key, observed.success);
        }

        const changes = makeContextWaveChanges(root.identity, root.snapshot.revision);

        if (Result.isFailure(changes)) return yield* Effect.fail(changes.failure);

        const outcomes = new Map<
          string,
          "published" | "no-op" | "stale" | "rejected" | "blocked" | "defect"
        >();

        const failures: PublicDiagnostic[] = [];
        outcomes.set(root.identity.key, "published");

        const current = () =>
          phase !== "closed" && graphGeneration === capturedGeneration && graph === capturedGraph;

        const settleProjection = (planned: PlannedContextNode, state: RegisteredContextNode) =>
          Effect.gen(function* () {
            const offered = planned.offer;

            if (Option.isNone(offered) || Result.isFailure(offered.value)) {
              planned.cancelTicket();

              return {
                kind: "rejected" as const,
                diagnostic: contextDiagnostic("participant-rejected", state.identity.key),
              };
            }

            activeTickets.add(offered.value.success);
            const finished = yield* Effect.exit(offered.value.success.wait);
            activeTickets.delete(offered.value.success);
            planned.cancelTicket();

            if (Exit.isFailure(finished) || finished.value.status === "stale" || !current())
              return {
                kind: "stale" as const,
                diagnostic: contextDiagnostic("ticket-stale-or-failed", state.identity.key),
              };

            const owned = copyStructural(
              finished.value.snapshot,
              "context",
              state.opaqueIdentities,
            );

            if (Result.isFailure(owned))
              return { kind: "rejected" as const, diagnostic: owned.failure };

            return {
              kind: "accepted" as const,
              snapshot: owned.success,
              status: planned.issueOnly ? ("defect" as const) : finished.value.status,
            };
          });

        const processNode = (identity: ActorIdentity) =>
          Effect.gen(function* () {
            const state = nodes.get(identity.key);
            const inherited = changes.success.inherit(identity, state, captured);

            if (Result.isFailure(inherited)) return yield* Effect.fail(inherited.failure);

            const ready = prepareContextWaveNode(
              identity,
              state,
              current,
              outcomes,
              changes.success.cuts,
              captured,
              (key) => nodes.get(key),
              changes.success.debt,
            );

            if (Result.isFailure(ready)) {
              if (state !== undefined && Option.isSome(ready.failure.debt))
                state.debt = ready.failure.debt.value;
              outcomes.set(identity.key, ready.failure.outcome);
              failures.push(ready.failure.diagnostic);

              return;
            }

            if (state === undefined) return;
            const { providers, lineage, debt } = ready.success;

            // RETURN_TYPE: Ticket issuance preserves the offer machine type across the port.
            const issueTicket = <D extends MachineDefinition>(
              offer: ContextOffer<D>,
              expectedRevision: number,
            ): IssuedContextTicket<D> => {
              const required = providers.map(({ cut }) => cut);

              const issued = makeContextTicket({
                offer,
                identity,
                expectedRevision,
                validateCurrent() {
                  if (!current() || !state.registered || !state.enabled)
                    return Result.fail(contextDiagnostic("stale-ticket", identity.key));

                  for (const cut of required) {
                    const valid = validateContextProviderCut(cut, captured, (key) =>
                      nodes.get(key),
                    );

                    if (Result.isFailure(valid)) return Result.fail(valid.failure);
                  }

                  return Result.succeed(undefined);
                },
              });

              const cancel = () => {
                issued.cancel();
                activeTicketCancels.delete(cancel);
              };

              activeTicketCancels.add(cancel);

              return { ticket: issued.ticket, cancel };
            };

            const planned = state.plan(captured, issueTicket);

            if (Result.isFailure(planned)) {
              outcomes.set(identity.key, "rejected");
              failures.push(planned.failure);

              return;
            }

            if (planned.success.publication === "unchanged") {
              planned.success.commit();
              state.lineage = lineage;
              state.debt = debt;
              outcomes.set(identity.key, "no-op");

              return;
            }

            const settled = yield* settleProjection(planned.success, state);

            if (settled.kind !== "accepted") {
              outcomes.set(identity.key, settled.kind);
              failures.push(settled.diagnostic);

              return;
            }

            const revised = changes.success.published(
              identity,
              captured.get(identity.key)?.snapshot.revision,
              settled.snapshot.revision,
            );

            if (Result.isFailure(revised)) return yield* Effect.fail(revised.failure);

            planned.success.commit();
            state.lineage = lineage;
            state.debt = debt;
            captured.set(identity.key, { identity, snapshot: settled.snapshot });
            outcomes.set(identity.key, settled.status);
          });

        for (const layer of plan.success.layers)
          yield* Effect.forEach(layer, processNode, { concurrency: maxFanout });

        const firstFailure = failures[0];

        if (firstFailure !== undefined) return yield* Effect.fail(firstFailure);
      });

    const rootQueue = yield* makeContextRootQueue(ownerScope, maxNodes, maxFanout, runWave);

    // RETURN_TYPE: Registration exposes a synchronous typed admission Result.
    const register = <D extends MachineDefinition>(
      node: ContextNode<D>,
    ): Result.Result<ContextRegistration, PublicDiagnostic> => {
      const key = node.identity.key;

      if (phase !== "open") return Result.fail(contextDiagnostic("closed", key));

      if (nodes.has(key)) return Result.fail(contextDiagnostic("duplicate-participant", key));

      if (nodes.size >= maxNodes)
        return Result.fail(contextDiagnostic("participant-capacity", key));
      const generation = checkedContextGeneration(graphGeneration);

      if (Result.isFailure(generation)) return Result.fail(generation.failure);

      const nextGraph = buildContextGraph([
        ...graphNodes(),
        { identity: node.identity, providers: node.providers },
      ]);

      if (Result.isFailure(nextGraph)) return Result.fail(nextGraph.failure);
      const initialCaptured = new Map<string, ContextCapturedProvider>();

      for (const edge of node.providers) {
        const provider = capture(edge.provider.key);

        if (Result.isFailure(provider)) return Result.fail(provider.failure);
        initialCaptured.set(edge.provider.key, provider.success);
      }

      const prepared = prepareContextParticipant(node, initialCaptured, () =>
        phase === "closed" ||
        !sameIdentity(nodes.get(key)?.identity ?? node.identity, node.identity)
          ? Result.fail(contextDiagnostic("stale-initial-ticket", key))
          : validateCapturedContextCuts(initialCaptured, (key) => nodes.get(key)),
      );

      if (Result.isFailure(prepared)) return Result.fail(prepared.failure);
      const initial = prepared.success.initial;

      if (Option.isSome(initial)) {
        const queued = rootQueue.enqueueInitial(key, initial.value);

        if (Result.isFailure(queued)) {
          initial.value.cancelTicket();
          initial.value.projection.cancel();

          return Result.fail(queued.failure);
        }
      }

      const state: RegisteredContextNode = {
        identity: node.identity,
        providers: [...node.providers],
        enabled: false,
        registered: true,
        opaqueIdentities: [...node.opaqueIdentities],
        snapshot: () => prepared.success.snapshot(),
        lineage: new Map(),
        debt: new Map(),
        plan: (captured, issueTicket) => prepared.success.plan(captured, issueTicket),
      };

      nodes.set(key, state);
      graph = nextGraph.success;
      graphGeneration = generation.success;
      invalidateTickets();

      let live = true;

      return Result.succeed({
        enable() {
          if (!live || phase === "closed") return;
          state.enabled = true;
        },
        unregister() {
          if (!live) return;
          live = false;
          state.registered = false;
          state.enabled = false;
          const descendants = planContextWave(graph, state.identity);

          if (Result.isSuccess(descendants))
            for (const dependent of descendants.success.order)
              if (dependent.key !== key) rootQueue.cancelInitial(dependent.key);

          nodes.delete(key);
          invalidateTickets();
          rootQueue.cancelIdentity(key);

          const rebuilt = buildContextGraph(graphNodes());

          if (Result.isSuccess(rebuilt)) graph = rebuilt.success;
        },
      });
    };

    const prepareNotification: ContextCoordinator["prepareNotification"] = (root) => {
      const state = nodes.get(root.identity.key);

      if (
        phase !== "open" ||
        state === undefined ||
        !state.registered ||
        !state.enabled ||
        !sameIdentity(state.identity, root.identity)
      )
        return Result.fail(contextDiagnostic("stale-or-closed-root", root.identity.key));

      const generation = checkedContextGeneration(notificationGeneration);

      if (Result.isFailure(generation)) return Result.fail(generation.failure);
      const copied = copyStructural(root.snapshot, "context", state.opaqueIdentities);

      if (Result.isFailure(copied)) return Result.fail(copied.failure);
      const notification = { [notificationBrand]: true as const };
      notifications.set(notification, {
        identity: root.identity,
        snapshot: copied.success,
        generation: generation.success,
        status: "prepared",
      });
      notificationGeneration = generation.success;

      return Result.succeed(notification);
    };

    const publish: ContextCoordinator["publish"] = (notification) => {
      const prepared = notifications.get(notification);

      if (prepared === undefined || prepared.status !== "prepared") return "coalesced";
      prepared.status = "published";
      const key = prepared.identity.key;
      const state = nodes.get(key);

      if (
        phase === "closed" ||
        state === undefined ||
        !state.registered ||
        !sameIdentity(state.identity, prepared.identity)
      )
        return "coalesced";

      return rootQueue.offer(prepared.identity, prepared.snapshot, prepared.generation);
    };

    const cancel: ContextCoordinator["cancel"] = (notification) => {
      const prepared = notifications.get(notification);

      if (prepared !== undefined && prepared.status === "prepared") prepared.status = "cancelled";
    };

    const quiesce: ContextCoordinator["quiesce"] = () =>
      Effect.sync(() => {
        if (phase === "open") phase = "quiescing";
      });

    const drain: ContextCoordinator["drain"] = () => rootQueue.drain();

    const close: ContextCoordinator["close"] = () =>
      Effect.suspend(() => {
        phase = "closed";
        invalidateTickets();

        return rootQueue.close();
      }).pipe(Effect.uninterruptible);

    return { register, prepareNotification, publish, cancel, quiesce, drain, close };
  });

import { Data, Deferred, Effect, Option, Result } from "effect";

import { Failure, type PublicDiagnostic } from "../../diagnostic/diagnostic.js";
import type { MachineRecordValue } from "../../machine/machine.js";
import {
  checkedAllocation,
  checkedLocalAllocation,
  stableActorKey,
  type AllocationCursor,
  type StableActorRef,
} from "./actor-admission.js";

const identityBrand = Symbol("ActorDirectory identity");

const reservationBrand = Symbol("ActorDirectory reservation");

const localRefBrand = Symbol("ActorDirectory local ref");

export type LocalActorRef = Readonly<{
  machine: MachineRecordValue;
  id: string;
  persist: false;
  [localRefBrand]: true;
}>;

type IdentityFields = Readonly<{
  key: string;
  incarnation: number;
  [identityBrand]: true;
}>;

export type ActorIdentity =
  | (IdentityFields & Readonly<{ kind: "stable"; ref: StableActorRef }>)
  | (IdentityFields & Readonly<{ kind: "local"; ref: LocalActorRef }>);

export type ActorReservation = Readonly<{
  identity: ActorIdentity;
  [reservationBrand]: true;
}>;

export type ActorRegistration<Actor> = Readonly<{
  identity: ActorIdentity;
  actor: Actor;
}>;

export type ActorAdmissionPosition<Actor> = Data.TaggedEnum<{
  create: { reservation: ActorReservation };
  join: { join: Effect.Effect<ActorRegistration<Actor>, PublicDiagnostic> };
  active: { registration: ActorRegistration<Actor> };
}>;

interface ActorAdmissionPositionDef extends Data.TaggedEnum.WithGenerics<1> {
  readonly taggedEnum: ActorAdmissionPosition<this["A"]>;
}

const actorAdmissionPosition = Data.taggedEnum<ActorAdmissionPositionDef>();

export type ActorReservationRequest =
  | Readonly<{ kind: "stable"; ref: StableActorRef }>
  | Readonly<{ kind: "local"; machine: MachineRecordValue }>;

type StableSlot<Actor> = Data.TaggedEnum<{
  pending: {
    reservation: ActorReservation;
    joiners: Deferred.Deferred<ActorRegistration<Actor>, PublicDiagnostic>;
  };
  installed: {
    reservation: ActorReservation;
    registration: ActorRegistration<Actor>;
    joiners: Deferred.Deferred<ActorRegistration<Actor>, PublicDiagnostic>;
  };
  active: { registration: ActorRegistration<Actor> };
  tombstoned: { identity: ActorIdentity; disposedAtSequence: number };
}>;

interface StableSlotDef extends Data.TaggedEnum.WithGenerics<1> {
  readonly taggedEnum: StableSlot<this["A"]>;
}

const stableSlotData = Data.taggedEnum<StableSlotDef>();

type LocalSlot<Actor> = Data.TaggedEnum<{
  reserved: { reservation: ActorReservation; ordinal: number };
  installed: {
    reservation: ActorReservation;
    ordinal: number;
    registration: ActorRegistration<Actor>;
  };
  active: { ordinal: number; registration: ActorRegistration<Actor> };
}>;

interface LocalSlotDef extends Data.TaggedEnum.WithGenerics<1> {
  readonly taggedEnum: LocalSlot<this["A"]>;
}

const localSlot = Data.taggedEnum<LocalSlotDef>();

export interface ActorDirectory<Actor> {
  reserve(
    request: ActorReservationRequest,
  ): Result.Result<ActorAdmissionPosition<Actor>, PublicDiagnostic>;
  install(reservation: ActorReservation, actor: Actor): Result.Result<void, PublicDiagnostic>;
  activate(reservation: ActorReservation): Effect.Effect<ActorRegistration<Actor>>;
  find(
    ref: StableActorRef,
  ): Result.Result<Option.Option<ActorRegistration<Actor>>, PublicDiagnostic>;
  rollback(reservation: ActorReservation, failure: PublicDiagnostic): Effect.Effect<void>;
  retire(
    identity: ActorIdentity,
    disposedAtSequence: number,
  ): Result.Result<void, PublicDiagnostic>;
}

const invalidRef = (summary: string) =>
  Failure({
    code: "SchemaValidation",
    path: ["ref"],
    details: {},
    summary,
    help: "Use an actor ref admitted by this runtime and machine.",
  });

const disposedRef = () =>
  Failure({
    code: "DisposedActorRef",
    path: ["ref"],
    details: {},
    summary: "Actor ref was disposed in this runtime",
    help: "Construct a new runtime for a new actor incarnation.",
  });

const exhausted = () =>
  Failure({
    code: "SchemaValidation",
    path: ["actor"],
    details: {},
    summary: "Actor identity allocation is exhausted",
    help: "Construct a new runtime.",
  });

const stale = () => invalidRef("Actor identity or reservation is stale");

type StableReservationState<Actor> = {
  runtimeId: string;
  stable: Map<MachineRecordValue, Map<string, StableSlot<Actor>>>;
  incarnation: AllocationCursor;
};

type LocalReservationState<Actor> = {
  runtimeId: string;
  local: Map<LocalActorRef, LocalSlot<Actor>>;
  recycledLocalOrdinals: number[];
  incarnation: AllocationCursor;
  localOrdinal: AllocationCursor;
};

/** The directory's stable reserve transition, exposed only for exact owner boundary proofs. */
export const reserveStablePosition = <Actor>(
  state: StableReservationState<Actor>,
  ref: StableActorRef,
) => {
  const next = checkedAllocation(state.incarnation.next, state.incarnation.exhausted);

  if (next === undefined) return Result.fail(exhausted());

  // oxlint-disable-next-line anti-slop/no-object-freeze -- STD-11: issued stable fence cannot change incarnation; P055-ACTOR-STABLE.
  const identity: ActorIdentity = Object.freeze({
    kind: "stable",
    ref,
    key: stableActorKey(state.runtimeId, ref),
    incarnation: next.value,
    [identityBrand]: true as const,
  });

  // oxlint-disable-next-line anti-slop/no-object-freeze -- STD-11: issued stable reservation cannot swap its fence; P055-ACTOR-STABLE.
  const reservation: ActorReservation = Object.freeze({ identity, [reservationBrand]: true });
  let byId = state.stable.get(ref.machine);

  if (byId === undefined) {
    byId = new Map();
    state.stable.set(ref.machine, byId);
  }

  byId.set(
    ref.id,
    stableSlotData.pending({
      reservation,
      joiners: Deferred.makeUnsafe<ActorRegistration<Actor>, PublicDiagnostic>(),
    }),
  );
  state.incarnation.next = next.next;
  state.incarnation.exhausted = next.exhausted;

  return Result.succeed(actorAdmissionPosition.create({ reservation }));
};

/** The directory's local reserve transition checks both counters before publishing a ref. */
export const reserveLocalPosition = <Actor>(
  state: LocalReservationState<Actor>,
  machine: MachineRecordValue,
) => {
  const reusedOrdinal = state.recycledLocalOrdinals.at(-1);

  const pair =
    reusedOrdinal === undefined
      ? checkedLocalAllocation(state.incarnation, state.localOrdinal)
      : undefined;

  const nextIncarnation =
    pair?.incarnation ?? checkedAllocation(state.incarnation.next, state.incarnation.exhausted);

  const nextOrdinal =
    pair?.ordinal ??
    (reusedOrdinal === undefined
      ? undefined
      : {
          value: reusedOrdinal,
          next: state.localOrdinal.next,
          exhausted: state.localOrdinal.exhausted,
        });

  if (nextIncarnation === undefined || nextOrdinal === undefined) return Result.fail(exhausted());

  // oxlint-disable-next-line anti-slop/no-object-freeze -- STD-11: issued local ref cannot change its lookup key; P055-ACTOR-LOCAL.
  const ref: LocalActorRef = Object.freeze({
    machine,
    id: `local-${state.runtimeId}-${nextOrdinal.value}`,
    persist: false,
    [localRefBrand]: true as const,
  });

  // oxlint-disable-next-line anti-slop/no-object-freeze -- STD-11: issued local fence cannot change incarnation; P055-ACTOR-LOCAL.
  const identity: ActorIdentity = Object.freeze({
    kind: "local",
    ref,
    key: `${state.runtimeId}/local/${nextOrdinal.value}`,
    incarnation: nextIncarnation.value,
    [identityBrand]: true as const,
  });

  // oxlint-disable-next-line anti-slop/no-object-freeze -- STD-11: issued local reservation cannot swap its fence; P055-ACTOR-LOCAL.
  const reservation: ActorReservation = Object.freeze({ identity, [reservationBrand]: true });
  state.local.set(ref, localSlot.reserved({ reservation, ordinal: nextOrdinal.value }));
  state.incarnation.next = nextIncarnation.next;
  state.incarnation.exhausted = nextIncarnation.exhausted;

  if (reusedOrdinal === undefined) {
    state.localOrdinal.next = nextOrdinal.next;
    state.localOrdinal.exhausted = nextOrdinal.exhausted;
  } else state.recycledLocalOrdinals.pop();

  return Result.succeed(actorAdmissionPosition.create({ reservation }));
};

/** One runtime-local directory owns all identity allocation and admission positions. */
// RETURN_TYPE: The port hides private map/counter state and preserves the stable generic Actor result.
export const makeActorDirectory = <Actor>(options: {
  machines: readonly MachineRecordValue[];
}): ActorDirectory<Actor> => {
  const allowed = new Set(options.machines);
  const runtimeId = crypto.randomUUID();
  const stable = new Map<MachineRecordValue, Map<string, StableSlot<Actor>>>();
  const local = new Map<LocalActorRef, LocalSlot<Actor>>();
  const recycledLocalOrdinals: number[] = [];

  const incarnation: AllocationCursor = { next: 1, exhausted: false };
  const localOrdinal: AllocationCursor = { next: 1, exhausted: false };
  const stableReservationState = { runtimeId, stable, incarnation };

  const localReservationState = {
    runtimeId,
    local,
    recycledLocalOrdinals,
    incarnation,
    localOrdinal,
  };

  const stableSlot = (ref: StableActorRef) => stable.get(ref.machine)?.get(ref.id);

  const isAdmitted = (machine: MachineRecordValue) => allowed.has(machine);

  const reserve: ActorDirectory<Actor>["reserve"] = (request) => {
    const machine = request.kind === "stable" ? request.ref.machine : request.machine;

    if (!isAdmitted(machine)) return Result.fail(invalidRef("Machine is foreign to this runtime"));

    if (request.kind === "local") return reserveLocalPosition(localReservationState, machine);

    const ref = request.ref;

    if (localRefBrand in ref) return Result.fail(invalidRef("Local refs cannot be ensured"));

    const slot = stableSlot(ref);

    switch (slot?._tag) {
      case "pending":
      case "installed":
        return Result.succeed(actorAdmissionPosition.join({ join: Deferred.await(slot.joiners) }));
      case "active":
        return Result.succeed(actorAdmissionPosition.active({ registration: slot.registration }));
      case "tombstoned":
        return Result.fail(disposedRef());
      case undefined:
        return reserveStablePosition(stableReservationState, ref);
    }
  };

  const install: ActorDirectory<Actor>["install"] = (reservation, actor) => {
    if (reservation.identity.kind === "stable") {
      const slot = stableSlot(reservation.identity.ref);

      if (slot?._tag !== "pending" || slot.reservation !== reservation) return Result.fail(stale());

      stable.get(reservation.identity.ref.machine)?.set(
        reservation.identity.ref.id,
        stableSlotData.installed({
          reservation,
          // oxlint-disable-next-line anti-slop/no-object-freeze -- STD-11: activated stable registration cannot swap actor; P055-ACTOR-STABLE.
          registration: Object.freeze({ identity: reservation.identity, actor }),
          joiners: slot.joiners,
        }),
      );

      return Result.succeed(undefined);
    }

    const slot = local.get(reservation.identity.ref);

    if (slot?._tag !== "reserved" || slot.reservation !== reservation) return Result.fail(stale());

    local.set(
      reservation.identity.ref,
      localSlot.installed({
        reservation,
        ordinal: slot.ordinal,
        // oxlint-disable-next-line anti-slop/no-object-freeze -- STD-11: activated local registration cannot swap actor; P055-ACTOR-LOCAL.
        registration: Object.freeze({ identity: reservation.identity, actor }),
      }),
    );

    return Result.succeed(undefined);
  };

  const activate: ActorDirectory<Actor>["activate"] = (reservation) =>
    Effect.uninterruptible(
      Effect.gen(function* () {
        if (reservation.identity.kind === "stable") {
          const slot = stableSlot(reservation.identity.ref);

          if (slot?._tag !== "installed" || slot.reservation !== reservation)
            return yield* Effect.die(new Error("ActorDirectory activation requires installation"));

          stable
            .get(reservation.identity.ref.machine)
            ?.set(
              reservation.identity.ref.id,
              stableSlotData.active({ registration: slot.registration }),
            );
          yield* Deferred.succeed(slot.joiners, slot.registration);

          return slot.registration;
        }

        const ref = reservation.identity.ref;
        const slot = local.get(ref);

        if (slot?._tag !== "installed" || slot.reservation !== reservation)
          return yield* Effect.die(new Error("ActorDirectory activation requires installation"));

        local.set(
          ref,
          localSlot.active({ ordinal: slot.ordinal, registration: slot.registration }),
        );

        return slot.registration;
      }),
    );

  const find: ActorDirectory<Actor>["find"] = (ref) => {
    if (localRefBrand in ref) return Result.fail(invalidRef("Local refs cannot be looked up"));

    if (!isAdmitted(ref.machine))
      return Result.fail(invalidRef("Machine is foreign to this runtime"));

    const slot = stableSlot(ref);

    if (slot?._tag === "tombstoned") return Result.fail(disposedRef());

    return Result.succeed(slot?._tag === "active" ? Option.some(slot.registration) : Option.none());
  };

  const rollback: ActorDirectory<Actor>["rollback"] = (reservation, failure) =>
    Effect.uninterruptible(
      Effect.gen(function* () {
        if (reservation.identity.kind === "stable") {
          const ref = reservation.identity.ref;
          const slot = stableSlot(ref);

          if (
            (slot?._tag !== "pending" && slot?._tag !== "installed") ||
            slot.reservation !== reservation
          )
            return;

          stable.get(ref.machine)?.delete(ref.id);
          yield* Deferred.fail(slot.joiners, failure);

          return;
        }

        const ref = reservation.identity.ref;
        const slot = local.get(ref);

        if (
          (slot?._tag !== "reserved" && slot?._tag !== "installed") ||
          slot.reservation !== reservation
        )
          return;

        local.delete(ref);
        recycledLocalOrdinals.push(slot.ordinal);
      }),
    );

  const retire: ActorDirectory<Actor>["retire"] = (identity, disposedAtSequence) => {
    if (!Number.isSafeInteger(disposedAtSequence) || disposedAtSequence < 0)
      return Result.fail(invalidRef("Disposal sequence must be a non-negative safe integer"));

    if (identity.kind === "stable") {
      const ref = identity.ref;
      const slot = stableSlot(ref);

      if (slot?._tag !== "active" || slot.registration.identity !== identity)
        return Result.fail(stale());

      stable.get(ref.machine)?.set(
        ref.id,
        stableSlotData.tombstoned({
          identity,
          disposedAtSequence,
        }),
      );

      return Result.succeed(undefined);
    }

    const ref = identity.ref;
    const slot = local.get(ref);

    if (slot?._tag !== "active" || slot.registration.identity !== identity)
      return Result.fail(stale());

    local.delete(ref);

    return Result.succeed(undefined);
  };

  return { reserve, install, activate, find, rollback, retire };
};

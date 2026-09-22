import { assert, describe, it } from "@effect/vitest";
import { Cause, Effect, Exit, Option, Result } from "effect";

import { definition } from "../../definition/definition.js";
import { Failure } from "../../diagnostic/diagnostic.js";
import { machine } from "../../machine/machine.js";
import { makeActorDirectory } from "../actor/actor-directory.js";

const Definition = definition({
  id: "runtime-next/directory-owner",
  states: ["idle"],
  events: {},
});

const Machine = Result.getOrThrow(
  machine(Definition, ({ S }) => ({ default: S.idle, states: { idle: {} } })),
);

const failedAdmission = Failure({
  code: "SchemaValidation",
  path: [],
  details: {},
  summary: "Preparation failed",
  help: "Retry the actor admission.",
});

describe("runtime-next ActorDirectory owner", () => {
  it.effect(
    "models stable legal and illegal transitions without exposing an incomplete actor",
    () =>
      Effect.gen(function* () {
        const directory = makeActorDirectory<string>({ machines: [Machine] });
        const ref = { machine: Machine, id: "stable", persist: false } as const;
        const position = Result.getOrThrow(directory.reserve({ kind: "stable", ref }));
        assert.strictEqual(position._tag, "create");

        if (position._tag !== "create") return;
        const reservation = position.reservation;

        assert.ok(Object.isFrozen(reservation));
        assert.ok(Object.isFrozen(reservation.identity));
        assert.strictEqual(Reflect.set(reservation.identity, "incarnation", -1), false);
        assert.ok(Option.isNone(Result.getOrThrow(directory.find(ref))));
        assert.ok(Result.isFailure(directory.retire(reservation.identity, 1)));
        const earlyActivation = yield* Effect.exit(directory.activate(reservation));
        assert.ok(Exit.isFailure(earlyActivation));

        if (Exit.isFailure(earlyActivation))
          assert.ok(earlyActivation.cause.reasons.some(Cause.isDieReason));

        assert.ok(Result.isSuccess(directory.install(reservation, "actor")));
        assert.ok(Result.isFailure(directory.install(reservation, "replacement")));
        assert.ok(Option.isNone(Result.getOrThrow(directory.find(ref))));
        const active = yield* directory.activate(reservation);
        assert.strictEqual(active.actor, "actor");
        yield* directory.rollback(reservation, failedAdmission);
        const found = Result.getOrThrow(directory.find(ref));
        assert.ok(Option.isSome(found));

        if (Option.isSome(found)) assert.strictEqual(found.value, active);
        assert.ok(Result.isFailure(directory.install(reservation, "replacement")));
        assert.ok(Result.isSuccess(directory.retire(active.identity, 2)));
        assert.ok(Result.isFailure(directory.retire(active.identity, 3)));
        assert.ok(Result.isFailure(directory.find(ref)));
      }),
  );

  it.effect(
    "rolls back reserved and installed stable/local tokens without reviving stale fences",
    () =>
      Effect.gen(function* () {
        const directory = makeActorDirectory<string>({ machines: [Machine] });
        const ref = { machine: Machine, id: "retry", persist: false } as const;
        const first = Result.getOrThrow(directory.reserve({ kind: "stable", ref }));
        assert.strictEqual(first._tag, "create");

        if (first._tag !== "create") return;
        yield* directory.rollback(first.reservation, failedAdmission);
        assert.ok(Result.isFailure(directory.install(first.reservation, "stale")));

        const second = Result.getOrThrow(directory.reserve({ kind: "stable", ref }));
        assert.strictEqual(second._tag, "create");

        if (second._tag !== "create") return;
        assert.ok(second.reservation.identity.incarnation > first.reservation.identity.incarnation);
        assert.ok(Result.isSuccess(directory.install(second.reservation, "prepared")));
        yield* directory.rollback(second.reservation, failedAdmission);
        assert.ok(Option.isNone(Result.getOrThrow(directory.find(ref))));

        const third = Result.getOrThrow(directory.reserve({ kind: "stable", ref }));
        assert.strictEqual(third._tag, "create");

        if (third._tag !== "create") return;
        assert.ok(third.reservation.identity.incarnation > second.reservation.identity.incarnation);
        assert.ok(Result.isFailure(directory.install(second.reservation, "stale")));

        const localReserved = Result.getOrThrow(
          directory.reserve({ kind: "local", machine: Machine }),
        );

        assert.strictEqual(localReserved._tag, "create");

        if (localReserved._tag !== "create") return;
        yield* directory.rollback(localReserved.reservation, failedAdmission);

        const localInstalled = Result.getOrThrow(
          directory.reserve({ kind: "local", machine: Machine }),
        );

        assert.strictEqual(localInstalled._tag, "create");

        if (localInstalled._tag !== "create") return;
        assert.strictEqual(
          localInstalled.reservation.identity.key,
          localReserved.reservation.identity.key,
        );
        assert.notStrictEqual(
          localInstalled.reservation.identity,
          localReserved.reservation.identity,
        );
        assert.ok(Result.isFailure(directory.install(localReserved.reservation, "stale")));
        assert.ok(Result.isSuccess(directory.install(localInstalled.reservation, "prepared")));
        yield* directory.rollback(localInstalled.reservation, failedAdmission);
        assert.ok(Result.isFailure(directory.retire(localInstalled.reservation.identity, 4)));
        yield* directory.rollback(third.reservation, failedAdmission);
      }),
  );
});

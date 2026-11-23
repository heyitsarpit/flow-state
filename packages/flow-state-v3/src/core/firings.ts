import { Option, Result } from "effect";
import { Change } from "./change.ts";
import { callSlot, type Schedule, type Values } from "./compiled.ts";
import type { IncarnationSteps } from "./incarnations.ts";
import type { Firing } from "./schedule-decision.ts";
import type { Tx } from "./tx.ts";
import type { ActorId, ArmingId, IncarnationId, Incarnation } from "./world.ts";
import type { Run, Tracked } from "./timers.ts";

/**
 * Firings and lane re-checks: what a schedule's timer does when it fires, and the keys and
 * pauses every lane change re-checks.
 */
export const makeFirings = (
  tx: Tx,
  incarnations: IncarnationSteps,
  // The firing's send as a turn of the incarnation, which applies the firing's change whether its
  // send commits or not.
  turn: (incarnation: Incarnation, schedule: Schedule, payload: Values, firing: Firing) => void,
) => {
  const { schedules, apply } = incarnations;

  // A timer's firing, one synchronous step with no write before its send: its next step is read,
  // then its send runs as a turn carrying the firing; a mapper that throws is the firing's
  // refusal, settled with no turn.
  const fire = (
    incarnation: Incarnation,
    schedule: Schedule,
    due: { readonly tracked: Tracked; readonly run: Run; readonly dueAt: number },
  ) => {
    const metadata = schedules.metadataOf(due.tracked, due.run, due.dueAt);
    const next = schedules.nextOf(incarnation, due.tracked, due.run);
    const firing: Firing = { name: schedule.name, arming: due.run.arming, next };

    const payload = Option.match(schedule.from, {
      onNone: () => Result.succeed<Values>({}),
      onSome: (from) => callSlot(from, metadata),
    });

    Result.match(payload, {
      onFailure: (slot) =>
        apply(
          Option.some(incarnation),
          Change.Settled({ firing, refusal: Option.some({ code: "InvalidTurn", slot }) }),
        ),
      onSuccess: (event) => turn(incarnation, schedule, event, firing),
    });
  };

  /**
   * Serves a firing: a firing of an earlier arming, or of an incarnation that ended, is dropped.
   */
  const firing = (mail: {
    readonly actor: ActorId;
    readonly incarnation: IncarnationId;
    readonly schedule: string;
    readonly track: string;
    readonly arming: ArmingId;
  }) => {
    const incarnation = tx.incarnationOf(mail.actor);

    if (incarnation === undefined || incarnation.id !== mail.incarnation) return;

    const live = schedules.firingRun(incarnation, mail.schedule, mail.track, mail.arming);
    const declared = schedules.scheduleNamed(incarnation, mail.schedule);

    if (Option.isSome(live) && Option.isSome(declared))
      fire(incarnation, declared.value, live.value);
  };

  /**
   * Every lane change re-checks its identity's keys and pauses, and runs no other schedule work;
   * a lane-only change publishes no turn, so the snapshot reads the timers it left.
   */
  const recheckLanes = () => {
    for (const key of tx.takeMoved()) {
      const incarnation = tx.world().incarnations.get(key);

      if (incarnation !== undefined) apply(Option.some(incarnation), Change.Lanes());
    }
  };

  return { firing, recheckLanes };
};

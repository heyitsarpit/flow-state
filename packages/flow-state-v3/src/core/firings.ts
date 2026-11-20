import { Option, Result } from "effect";
import { callSlot, type Schedule, type Values } from "./compiled.ts";
import type { IncarnationSteps } from "./incarnations.ts";
import { Occasion } from "./schedule-decision.ts";
import type { Tx } from "./tx.ts";
import {
  type ActorId,
  type ArmingId,
  type IncarnationId,
  type Incarnation,
  IssueSource,
  type Run,
  Timing,
  type Tracked,
  withIssue,
} from "./world.ts";

/**
 * Firings and lane re-checks: what a schedule's timer does when it fires, and the keys and
 * pauses every lane change re-checks.
 */
export const makeFirings = (
  tx: Tx,
  incarnations: IncarnationSteps,
  // The firing's send as a turn of the incarnation, from the schedule that fired; true when it
  // committed.
  turn: (incarnation: Incarnation, schedule: Schedule, payload: Values) => boolean,
) => {
  const { schedules, setIncarnation, publish } = incarnations;

  const raise = (incarnation: Incarnation, schedule: Schedule, slot: string) => {
    const issue = tx.refuse(incarnation.actor, {
      source: IssueSource.Schedule({ name: schedule.name }),
      code: "InvalidTurn",
      slot: Option.some(slot),
    });

    const next = withIssue(incarnation, issue);
    tx.putIncarnation(next);

    return next;
  };

  // A timer's firing: its next step is taken from now, then its send runs as a turn; a mapper that
  // throws refuses that turn. A next step past the timer limit ends the schedule with one issue,
  // after the firing's turn.
  const fire = (incarnation: Incarnation, schedule: Schedule, tracked: Tracked, run: Run) => {
    const dueAt = Timing.$is("Running")(run.timing) ? run.timing.dueAt : tx.env.now;
    const metadata = schedules.metadataOf(tracked, run, dueAt);
    const next = schedules.fired(incarnation, tracked, run);
    const left = next.incarnation;

    setIncarnation(left);

    const payload = Option.match(schedule.from, {
      onNone: () => Result.succeed<Values>({}),
      onSome: (from) => callSlot(from, metadata),
    });

    const committed = Result.match(payload, {
      onFailure: (slot) => {
        publish(raise(left, schedule, slot));

        return false;
      },
      onSuccess: (event) => turn(left, schedule, event),
    });

    const after = tx.incarnationOf(incarnation.actor);

    if (after === undefined || after.id !== incarnation.id) return;

    const issued = next.over ? raise(after, schedule, schedule.slot) : after;

    // A committed firing's turn decided its next step; otherwise it is checked against the pause
    // reasons here.
    const settled = committed ? issued : schedules.rechecked(issued, Occasion.Lanes());

    if (settled !== after) setIncarnation(settled);

    // The issue is its own refusal record, published once.
    if (next.over) publish(settled);
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

    const live = schedules.firingRun(incarnation, mail.track, mail.arming);
    const declared = schedules.scheduleNamed(incarnation, mail.schedule);

    if (Option.isSome(live) && Option.isSome(declared))
      fire(incarnation, declared.value, live.value.tracked, live.value.run);
  };

  /**
   * Every lane change re-checks its identity's keys and pauses, and runs no other schedule work;
   * a lane-only change publishes no turn, so the snapshot reads the timers it left.
   */
  const recheckLanes = () => {
    for (const key of tx.takeMoved()) {
      const incarnation = tx.world().incarnations.get(key);

      if (incarnation === undefined) continue;

      const settled = schedules.rechecked(incarnation, Occasion.Lanes());

      if (settled !== incarnation) setIncarnation(settled);
    }
  };

  return { firing, recheckLanes };
};

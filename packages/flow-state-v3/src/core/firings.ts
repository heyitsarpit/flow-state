import { Option, Result } from "effect";
import { callSlot, type Schedule, type Values } from "./compiled.ts";
import type { IncarnationSteps } from "./incarnations.ts";
import { type Firing, Next, Occasion } from "./schedule-decision.ts";
import type { Tx } from "./tx.ts";
import type { ActorId, ArmingId, IncarnationId, Incarnation } from "./world.ts";
import type { Failure, Run, Tracked } from "./timers.ts";

/**
 * Firings and lane re-checks: what a schedule's timer does when it fires, and the keys and
 * pauses every lane change re-checks.
 */
export const makeFirings = (
  tx: Tx,
  incarnations: IncarnationSteps,
  // The firing's send as a turn of the incarnation: whether it committed, and its refusal when it
  // was refused. A committed one's turn decided the firing's schedule work.
  turn: (
    incarnation: Incarnation,
    schedule: Schedule,
    payload: Values,
    firing: Firing,
  ) => { readonly committed: boolean; readonly refused: Option.Option<Failure> },
) => {
  const { schedules, setIncarnation, publish } = incarnations;

  // A timer's firing, one synchronous step with no write before its send: its next step is read,
  // then its send runs as a turn carrying the firing; a mapper that throws refuses that turn. A
  // send that does not commit is decided here, with its refusal, and a refused or ended one
  // publishes once.
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

    const sent = Result.match(payload, {
      onFailure: (slot) => ({
        committed: false,
        refused: Option.some<Failure>({ code: "InvalidTurn", slot }),
      }),
      onSuccess: (event) => turn(incarnation, schedule, event, firing),
    });

    const after = tx.incarnationOf(incarnation.actor);

    if (sent.committed || after === undefined || after.id !== incarnation.id) return;

    const settled = schedules.firingSettled(after, firing, sent.refused);

    if (settled !== after) setIncarnation(settled);

    if (Option.isSome(sent.refused) || Next.$is("Over")(next)) publish(settled);
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

    const live = schedules.firingRun(incarnation, mail.schedule, mail.arming);
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

      if (incarnation === undefined) continue;

      const settled = schedules.rechecked(incarnation, Occasion.Lanes());

      if (settled !== incarnation) setIncarnation(settled);
    }
  };

  return { firing, recheckLanes };
};

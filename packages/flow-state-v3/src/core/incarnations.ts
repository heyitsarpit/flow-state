import { Option, Result } from "effect";
import { armingsOf } from "./turn.ts";
import { Act } from "./evidence-of.ts";
import type { LedgerSteps } from "./ledger.ts";
import { decodeRecords } from "./record.ts";
import { GRACE_MS, isInFlight, type Tx, without, withEntry } from "./tx.ts";
import {
  type ActorId,
  actorKey,
  type ActorRecord,
  type Armed,
  Due,
  type Incarnation,
  Mail,
  Timer,
  type Use,
} from "./world.ts";
import type { Persistence } from "./persist.ts";

/**
 * Incarnations: creation, restore, uses, the grace and the end, with their schedules.
 */
export const makeIncarnations = (tx: Tx, persistence: Persistence, ledger: LedgerSteps) => {
  const { armTimer, disarmWhere, incarnationOf, used, lanesOf, enqueue } = tx;
  const { removeActor, saveActor } = persistence;

  // ── incarnations.
  const armSchedules = (
    incarnation: Incarnation,
    armings: ReadonlyArray<{ readonly name: string; readonly send: string; readonly ms: number }>,
  ) => {
    let schedules = incarnation.schedules;

    for (const a of armings) {
      const arming = tx.next();
      disarmWhere(
        (t) =>
          Timer.$is("Schedule")(t) && t.incarnation === incarnation.id && t.schedule === a.name,
      );
      armTimer(
        Timer.Schedule({
          actor: incarnation.actor,
          incarnation: incarnation.id,
          schedule: a.name,
          arming,
        }),
        tx.env.now + a.ms,
      );
      schedules = withEntry(schedules, a.name, { arming, dueAt: tx.env.now + a.ms, send: a.send });
    }

    return { ...incarnation, schedules };
  };

  const stopSchedules = (incarnation: Incarnation) => {
    disarmWhere((t) => Timer.$is("Schedule")(t) && t.incarnation === incarnation.id);

    return { ...incarnation, schedules: new Map<string, Armed>() };
  };

  // Every change of an incarnation is written from its state at the step's end.
  const setIncarnation = (incarnation: Incarnation) => {
    tx.set({
      ...tx.world(),
      incarnations: withEntry(tx.world().incarnations, actorKey(incarnation.actor), incarnation),
    });
    saveActor(incarnation.actor);
  };

  const publish = (incarnation: Incarnation) =>
    tx.act(
      Act.Published({
        actor: incarnation.actor,
        state: incarnation.state,
        memory: incarnation.memory,
      }),
    );

  const start = (actor: ActorId, from: Option.Option<ActorRecord>) => {
    const compiled = tx.machines.get(actor.machine);

    if (compiled === undefined) return;

    const base: Incarnation = {
      id: tx.mint("inc"),
      actor,
      state: Option.match(from, { onNone: () => compiled.initial, onSome: (r) => r.state }),
      activation: tx.next(),
      memory: Option.match(from, { onNone: () => compiled.initialMemory, onSome: (r) => r.memory }),
      schedules: new Map(),
    };

    setIncarnation(base);
    tx.act(Act.Started({ actor }));

    const incarnation = Option.match(from, {
      onNone: () =>
        armSchedules(
          base,
          Result.getOrElse(
            armingsOf(compiled.states.get(base.state)?.schedules ?? [], true, "", base.memory),
            () => [],
          ),
        ),
      onSome: (record) => {
        let schedules = base.schedules;

        for (const s of record.schedules) {
          const arming = tx.next();
          armTimer(
            Timer.Schedule({ actor, incarnation: base.id, schedule: s.name, arming }),
            s.dueAt,
          );
          schedules = withEntry(schedules, s.name, { arming, dueAt: s.dueAt, send: s.send });
        }

        return { ...base, schedules };
      },
    });

    setIncarnation(incarnation);
    publish(incarnation);
    ledger.start(actor);
  };

  const fireWaiting = (actor: ActorId) => {
    const incarnation = incarnationOf(actor);

    if (incarnation === undefined) return;

    for (const [name, armed] of incarnation.schedules) {
      const live = [...tx.world().timers.values()].some(
        (t) => Timer.$is("Schedule")(t) && t.incarnation === incarnation.id && t.schedule === name,
      );

      if (!live && armed.dueAt <= tx.env.now)
        enqueue(
          Mail.Firing({ actor, incarnation: incarnation.id, schedule: name, arming: armed.arming }),
        );
    }
  };

  const ensure = (actor: ActorId, use: Option.Option<Use>, existing: boolean) => {
    const key = actorKey(actor);

    if (incarnationOf(actor) === undefined) {
      const record = Option.fromUndefinedOr(tx.world().records.get(key));

      if (Option.isSome(record) || !existing) start(actor, record);
    }

    if (incarnationOf(actor) === undefined) return;

    Option.match(use, {
      onNone: () => undefined,
      onSome: (u) => {
        tx.set({
          ...tx.world(),
          uses: withEntry(tx.world().uses, key, [...(tx.world().uses.get(key) ?? []), u]),
        });
        fireWaiting(actor);
      },
    });
  };

  const release = (actor: ActorId, use: Use) => {
    const key = actorKey(actor);
    const uses = tx.world().uses.get(key) ?? [];
    const at = uses.indexOf(use);

    if (at < 0) return;
    tx.set({ ...tx.world(), uses: withEntry(tx.world().uses, key, uses.toSpliced(at, 1)) });
  };

  const end = (actor: ActorId) => {
    const incarnation = incarnationOf(actor);

    // The end waits while the identity's records cannot encode: its grace starts again.
    if (incarnation === undefined || tx.world().withheld.has(actorKey(actor))) return;
    // The end writes a dirty record in its own step, not at the next capture.
    saveActor(actor, Due.Now());
    stopSchedules(incarnation);
    disarmWhere((t) => Timer.$is("Grace")(t) && t.incarnation === incarnation.id);
    tx.set({
      ...tx.world(),
      incarnations: without(tx.world().incarnations, actorKey(actor)),
      reads: new Map([...tx.world().reads].filter(([, r]) => r.incarnation !== incarnation.id)),
    });
    tx.act(Act.Finished({ actor }));
    ledger.suspend(actor, false);
  };

  /**
   * Disposes an identity or forgets it: its incarnation ends without a record, its record is
   * removed, and its lanes stay, unbound until an adopting ensure. Forget also lets go of its
   * parked and kept endings, as evidence.
   */
  const dispose = (actor: ActorId, forgetting: boolean) => {
    const incarnation = incarnationOf(actor);
    const key = actorKey(actor);

    if (incarnation !== undefined) {
      stopSchedules(incarnation);
      disarmWhere((t) => Timer.$is("Grace")(t) && t.incarnation === incarnation.id);
      tx.set({
        ...tx.world(),
        incarnations: without(tx.world().incarnations, key),
        reads: new Map([...tx.world().reads].filter(([, r]) => r.incarnation !== incarnation.id)),
      });
      tx.act(Act.Finished({ actor }));
    }

    tx.set({
      ...tx.world(),
      records: without(tx.world().records, key),
      uses: without(tx.world().uses, key),
    });
    removeActor(actor);
    ledger.suspend(actor, forgetting);
  };

  // ── after every step: free incarnations start their grace; used ones stop it.
  const graces = () => {
    for (const incarnation of tx.world().incarnations.values()) {
      const busy =
        used(incarnation.actor) ||
        lanesOf(incarnation.actor).some(([, lane]) => isInFlight(lane)) ||
        tx.world().mail.some((m) => actorKey(m.actor) === actorKey(incarnation.actor));

      const timing = [...tx.world().timers.values()].some(
        (t) => Timer.$is("Grace")(t) && t.incarnation === incarnation.id,
      );

      if (busy && timing)
        disarmWhere((t) => Timer.$is("Grace")(t) && t.incarnation === incarnation.id);

      if (!busy && !timing)
        armTimer(
          Timer.Grace({ actor: incarnation.actor, incarnation: incarnation.id }),
          tx.env.now + GRACE_MS,
        );
    }
  };

  // FLOW_STATE_ALLOW_UNKNOWN: the store's parsed records, decoded once by their Schemas.
  const boot = (storedRecords: ReadonlyMap<string, unknown>) => {
    const restored = decodeRecords(tx.machines, storedRecords);

    tx.set({
      ...tx.world(),
      records: new Map(restored.records.map((r) => [actorKey(r.actor), r])),
      lanes: new Map(restored.lanes.map(({ id, lane }) => [id, lane])),
    });
    ledger.restore(restored.rows);

    // A lane's saved queue and displaced heads end at the boot, in lane-id order after the saved
    // rows; the lane's record is rewritten without them in the same batch as the rows.
    for (const { id, lane, endings } of restored.lanes)
      if (endings.length > 0) {
        ledger.restore(endings);

        for (const ending of endings) tx.act(Act.Ended({ actor: lane.actor, ending }));
        persistence.saveOwed(lane.actor);
        persistence.saveLane(lane.actor, id);
      }

    // A boot owes, parks and delivers nothing: the start of each identity it wakes does. Only an
    // identity owed an ending (a lane in flight at capture, or a saved row) and holding an actor
    // record that decodes is live at ready; a Held lane stays a record, and a disposed identity's
    // rows wait for the incarnation an adopting ensure starts.
    const owed = new Map([
      ...restored.lanes
        .filter((l) => l.inFlight)
        .map(({ lane }) => [actorKey(lane.actor), lane.actor] as const),
      ...restored.rows.map((r) => [actorKey(r.actor), r.actor] as const),
    ]);

    for (const [key, actor] of owed)
      if (!restored.undecodable.has(key)) ensure(actor, Option.none(), true);
  };

  return {
    dispose,
    armSchedules,
    stopSchedules,
    setIncarnation,
    publish,
    start,
    fireWaiting,
    ensure,
    release,
    end,
    graces,
    boot,
  };
};

/**
 * Incarnations.
 */
export type IncarnationSteps = ReturnType<typeof makeIncarnations>;

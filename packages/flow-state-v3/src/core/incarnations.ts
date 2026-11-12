import { Option, Result } from "effect";
import { armingsOf } from "./turn.ts";
import { Evidence } from "./evidence.ts";
import { actorRecordKey, decodeRecords } from "./record.ts";
import { GRACE_MS, isInFlight, ROOT_ACTIVATION, type Tx, without, withEntry } from "./tx.ts";
import {
  type ActorId,
  actorKey,
  type ActorRecord,
  type Armed,
  Due,
  type Incarnation,
  Mail,
  type Parked,
  Phase,
  Timer,
  Tries,
  type Use,
} from "./world.ts";
import type { Persistence } from "./persist.ts";

/**
 * Incarnations: creation, restore, uses, the grace and the end, with their schedules.
 */
export const makeIncarnations = (tx: Tx, persistence: Persistence) => {
  const { armTimer, disarmWhere, incarnationOf, used, lanesOf, enqueue, endingMail } = tx;
  const { persist, saveActor, park, unpark, unkeep } = persistence;

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

  const setIncarnation = (incarnation: Incarnation) => {
    tx.set({
      ...tx.world(),
      incarnations: withEntry(tx.world().incarnations, actorKey(incarnation.actor), incarnation),
    });
  };

  const publish = (incarnation: Incarnation) =>
    tx.emit(
      Evidence.Published({
        actor: incarnation.actor,
        state: incarnation.state,
        memory: incarnation.memory,
      }),
    );

  const ownedBy = (actor: ActorId, waiting: ReadonlyMap<string, Parked>) =>
    [...waiting.values()].filter((p) => actorKey(p.actor) === actorKey(actor));

  // An incarnation starts: its parked endings are delivered, each kept one gets its one try, and
  // each Held head with no ending waiting hears unknown Restored.
  const deliverRestored = (actor: ActorId) => {
    const parked = ownedBy(actor, tx.world().parked);
    const kept = ownedBy(actor, tx.world().kept);

    const waitingAttempts = new Set(
      [...parked, ...kept].flatMap((p) => p.endings.flatMap((e) => Option.toArray(e.attempt))),
    );

    for (const p of parked) {
      for (const ending of p.endings) {
        tx.emit(Evidence.Unparked({ operation: p.operation, attempt: ending.attempt }));
        endingMail(actor, {
          ...ending,
          current: true,
          owner: ROOT_ACTIVATION,
          tries: Tries.Parked(),
        });
      }

      unpark(actor, p.lane);
    }

    for (const p of kept) {
      for (const ending of p.endings)
        endingMail(actor, {
          ...ending,
          current: true,
          owner: ROOT_ACTIVATION,
          tries: Tries.Last(),
        });

      unkeep(actor, p.lane);
    }

    for (const [id, lane] of lanesOf(actor))
      if (Phase.$is("Held")(lane.head.phase) && !waitingAttempts.has(lane.head.id))
        endingMail(actor, {
          operation: lane.operation,
          attempt: Option.some(lane.head.id),
          lane: Option.some(id),
          channel: "unknown",
          reason: "Restored",
          value: undefined,
          owner: ROOT_ACTIVATION,
          current: true,
          tries: Tries.First(),
        });
  };

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
    tx.emit(Evidence.Incarnated({ actor: actor }));

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

    if (Option.isNone(from)) saveActor(actor);
    deliverRestored(actor);
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

    if (incarnation === undefined) return;
    // The end writes a dirty record in its own step, not at the next capture.
    saveActor(actor, Due.Now());
    stopSchedules(incarnation);
    disarmWhere((t) => Timer.$is("Grace")(t) && t.incarnation === incarnation.id);
    tx.set({
      ...tx.world(),
      incarnations: without(tx.world().incarnations, actorKey(actor)),
      reads: new Map([...tx.world().reads].filter(([, r]) => r.incarnation !== incarnation.id)),
    });
    tx.emit(Evidence.Finished({ actor: actor }));
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
      tx.emit(Evidence.Finished({ actor: actor }));
    }

    tx.set({
      ...tx.world(),
      records: without(tx.world().records, key),
      uses: without(tx.world().uses, key),
    });
    persist(actor, [{ key: actorRecordKey(key), record: Option.none() }], Due.Later());

    if (!forgetting) return;

    const letGo = (
      waiting: ReadonlyMap<string, Parked>,
      why: "evidence" | "letGo",
      drop: (actor: ActorId, lane: string) => void,
    ) => {
      for (const p of ownedBy(actor, waiting)) {
        for (const e of p.endings)
          tx.emit(Evidence.Recorded({ operation: p.operation, attempt: e.attempt, why }));
        drop(actor, p.lane);
      }
    };

    letGo(tx.world().parked, "evidence", unpark);
    letGo(tx.world().kept, "letGo", unkeep);
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
      lanes: new Map(
        restored.lanes.map(({ id, lane }) => [
          id,
          { ...lane, head: { ...lane.head, mayHaveApplied: true } },
        ]),
      ),
      parked: new Map(restored.parked.map((p) => [p.lane, p])),
      kept: new Map(restored.kept.map((p) => [p.lane, p])),
    });

    // Each held head's unknown Restored is decided at the boot and parked for its identity, unless
    // its own ending is already waiting; an identity owed an ending is live at ready.
    const waitingAttempts = new Set(
      [...restored.parked, ...restored.kept].flatMap((p) =>
        p.endings.flatMap((e) => Option.toArray(e.attempt)),
      ),
    );

    for (const { id, lane } of restored.lanes)
      if (!waitingAttempts.has(lane.head.id))
        park(lane.actor, id, lane.operation, {
          operation: lane.operation,
          attempt: Option.some(lane.head.id),
          lane: Option.some(id),
          channel: "unknown",
          reason: "Restored",
          value: undefined,
          owner: ROOT_ACTIVATION,
          current: true,
          tries: Tries.Parked(),
        });

    // Only an identity whose captured lanes owe it an ending (a lane InFlight at capture, or an
    // ending waiting before the boot) is live at ready; a Held lane's stays a record.
    const owed = new Map([
      ...restored.lanes
        .filter((l) => l.inFlight)
        .map(({ lane }) => [actorKey(lane.actor), lane.actor] as const),
      ...[...restored.parked, ...restored.kept].map((p) => [actorKey(p.actor), p.actor] as const),
    ]);

    // An owed identity whose record does not decode is not woken; its endings stay parked for
    // the incarnation an adopting ensure starts.
    for (const [key, actor] of owed)
      if (!restored.undecodable.has(key)) ensure(actor, Option.none(), false);
  };

  return {
    dispose,
    armSchedules,
    stopSchedules,
    setIncarnation,
    publish,
    deliverRestored,
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

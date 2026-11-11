import { Option } from "effect";
import { Evidence } from "./evidence.ts";
import { decodeRecords, parkedRecordKey } from "./record.ts";
import { GRACE_MS, isInFlight, ROOT_ACTIVATION, type Tx, who, without, withEntry } from "./tx.ts";
import {
  type ActorId,
  actorKey,
  type ActorRecord,
  type Armed,
  type Incarnation,
  Mail,
  Phase,
  Timer,
  type Use,
} from "./world.ts";
import type { Persistence } from "./persist.ts";

/**
 * Incarnations (Actors R6 to R10): creation, restore, uses, the grace and the end, with their schedules.
 */
export const makeIncarnations = (tx: Tx, persistence: Persistence) => {
  const { armTimer, disarmWhere, incarnationOf, used, lanesOf, enqueue, endingMail } = tx;
  const { persist, saveActor } = persistence;

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
        actor: who(incarnation.actor),
        state: incarnation.state,
        memory: incarnation.memory,
      }),
    );

  const deliverRestored = (actor: ActorId) => {
    const parked = [...tx.world().parked.values()].filter(
      (p) => actorKey(p.actor) === actorKey(actor),
    );

    const parkedAttempts = new Set(
      parked.flatMap((p) => p.endings.flatMap((e) => Option.toArray(e.attempt))),
    );

    for (const p of parked) {
      for (const ending of p.endings) {
        tx.emit(Evidence.Unparked({ operation: p.operation, attempt: ending.attempt }));
        endingMail(actor, { ...ending, current: true, owner: ROOT_ACTIVATION });
      }

      tx.set({ ...tx.world(), parked: without(tx.world().parked, p.lane) });
      persist(actor, [{ key: parkedRecordKey(p.lane), record: Option.none() }], Option.none());
    }

    for (const lane of lanesOf(actor))
      if (Phase.$is("Held")(lane.head.phase) && !parkedAttempts.has(lane.head.id))
        endingMail(actor, {
          operation: lane.operation,
          attempt: Option.some(lane.head.id),
          lane: Option.some(lane.id),
          channel: "unknown",
          reason: "Restored",
          value: undefined,
          owner: ROOT_ACTIVATION,
          current: true,
          redelivered: false,
          parked: false,
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
    tx.emit(Evidence.Incarnated({ actor: who(actor) }));

    const incarnation = Option.match(from, {
      onNone: () =>
        armSchedules(
          base,
          (compiled.states.get(base.state)?.schedules ?? [])
            .filter((s) => s.onEntry && s.delay._tag === "Fixed")
            .map((s) => ({
              name: s.name,
              send: s.send,
              ms: s.delay._tag === "Fixed" ? s.delay.ms : 0,
            })),
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
    saveActor(actor);
    stopSchedules(incarnation);
    disarmWhere((t) => Timer.$is("Grace")(t) && t.incarnation === incarnation.id);
    tx.set({
      ...tx.world(),
      incarnations: without(tx.world().incarnations, actorKey(actor)),
      reads: new Map([...tx.world().reads].filter(([, r]) => r.incarnation !== incarnation.id)),
    });
    tx.emit(Evidence.Finished({ actor: who(actor) }));
  };

  // ── after every step: free incarnations start their grace; used ones stop it (Actors R7, R8).
  const graces = () => {
    for (const incarnation of tx.world().incarnations.values()) {
      const busy =
        used(incarnation.actor) ||
        lanesOf(incarnation.actor).some(isInFlight) ||
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
      lanes: new Map(restored.lanes.map(({ lane }) => [lane.id, lane])),
      parked: new Map(restored.parked.map((p) => [p.lane, p])),
    });

    const owed = new Map([
      ...restored.lanes
        .filter((l) => l.inFlight)
        .map(({ lane }) => [actorKey(lane.actor), lane.actor] as const),
      ...restored.parked.map((p) => [actorKey(p.actor), p.actor] as const),
    ]);

    for (const actor of owed.values()) ensure(actor, Option.none(), false);
  };

  return {
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

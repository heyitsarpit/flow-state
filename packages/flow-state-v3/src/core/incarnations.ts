import { Option, Result } from "effect";
import type { Values } from "./compiled.ts";
import { inputOfName } from "./identity.ts";
import { makeContext } from "./context.ts";
import { armingsOf } from "./turn.ts";
import { chainOf, create } from "./tree.ts";
import { Act } from "./evidence-of.ts";
import type { LedgerSteps } from "./ledger.ts";
import { actorRecordKey, decodeRecords } from "./record.ts";
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
// The source of an issue raised while an incarnation is created.
const CREATION = "creation";

// What an ended incarnation leaves for its handles to read.
const terminal = (incarnation: Incarnation) => ({
  state: incarnation.state,
  memory: incarnation.memory,
});

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

  // The schedules of the states a move exits stop; the others keep their deadlines.
  const stopNamed = (incarnation: Incarnation, names: ReadonlySet<string>) => {
    disarmWhere(
      (t) => Timer.$is("Schedule")(t) && t.incarnation === incarnation.id && names.has(t.schedule),
    );

    return {
      ...incarnation,
      schedules: new Map([...incarnation.schedules].filter(([name]) => !names.has(name))),
    };
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

  // A consumer's providers are ensured with a use and released when it ends; ensure and release
  // are defined below and only called once a step runs.
  const context = makeContext(tx, {
    ensure: (provider, use) => ensure(provider, use, false, Option.none()),
    release: (provider, use) => release(provider, use),
    publish: (incarnation) => publish(incarnation),
    save: (incarnation) => setIncarnation(incarnation),
  });

  const start = (
    actor: ActorId,
    from: Option.Option<ActorRecord>,
    input: Values,
    wiring: Option.Option<ReadonlyMap<string, ActorId>>,
  ) => {
    const compiled = tx.machines.get(actor.machine);

    if (compiled === undefined) return;

    const created = Option.match(from, {
      onNone: () => create(compiled, input),
      onSome: (r) => Result.succeed(r.memory),
    });

    if (Result.isFailure(created)) {
      if (created.failure.computed)
        tx.act(
          Act.Refused({
            code: "Defect",
            actor,
            ending: Option.none(),
            source: CREATION,
            slot: Option.some(`memory.${created.failure.field}`),
          }),
        );

      return;
    }

    const state = Option.match(from, { onNone: () => compiled.initial, onSome: (r) => r.state });

    const base: Incarnation = {
      id: tx.mint("inc"),
      actor,
      state,
      activations: chainOf(state).map(() => tx.next()),
      history: new Map(),
      memory: created.success,
      schedules: new Map(),
      issues: [],
      bound: new Map(),
      context: new Map(),
      stale: new Map(),
      baselines: [],
    };

    tx.set({ ...tx.world(), ended: without(tx.world().ended, actorKey(actor)) });
    setIncarnation(base);
    tx.act(Act.Started({ actor }));

    // Its slots bind before its first publication: the baselines are silent. A restored record
    // binds the providers it was saved with, unless the ensure names its own.
    const fresh = context.bind(
      base,
      Option.getOrElse(
        Option.orElse(
          Option.map(wiring, (given) => new Map([...compiled.wiring, ...given])),
          () =>
            Option.filter(
              Option.map(from, (r) => r.context),
              (saved) => saved.size > 0,
            ),
        ),
        () => compiled.wiring,
      ),
    );

    // A start from a saved record reads its providers now, and owes its reactions one wave for
    // each slot whose saved value differs or is unknown. A reload of a consistent saved world
    // differs in nothing, so it stays silent.
    const saved = Option.filter(
      Option.map(from, (r) => r.seen),
      (seen) => seen.size > 0,
    );

    const bound = Option.match(saved, {
      onNone: () => fresh,
      onSome: (seen) => context.rebase(fresh, seen),
    });

    const incarnation = Option.match(from, {
      onNone: () => {
        const arm = armingsOf(compiled, base.state, new Set(chainOf(base.state)), "", base.memory);

        // A delay refused at creation has no turn to refuse: it is an issue of the creation, named
        // by its schedule's slot, and the rest arm.
        const issues = arm.refused.map((slot) => {
          tx.act(
            Act.Refused({
              code: "InvalidTurn",
              actor,
              ending: Option.none(),
              source: CREATION,
              slot: Option.some(slot),
            }),
          );

          return { source: CREATION, code: "InvalidTurn" as const, slot: Option.some(slot) };
        });

        return armSchedules({ ...bound, issues: [...bound.issues, ...issues] }, arm.armed);
      },
      onSome: (record) => {
        let schedules = bound.schedules;

        for (const s of record.schedules) {
          const arming = tx.next();
          armTimer(
            Timer.Schedule({ actor, incarnation: base.id, schedule: s.name, arming }),
            s.dueAt,
          );
          schedules = withEntry(schedules, s.name, { arming, dueAt: s.dueAt, send: s.send });
        }

        return { ...bound, schedules };
      },
    });

    setIncarnation(incarnation);
    publish(incarnation);
    ledger.start(actor);

    // The owed wave waits in its mailbox after the owed rows, ahead of the event that returned it.
    if (bound.stale.size > 0) enqueue(Mail.Context({ actor }));
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

  // A record the boot could not read is never restored: the identity starts fresh, reported, and
  // its first save overwrites the record.
  const startsFresh = (key: string) => {
    const quarantined = tx.world().quarantined.get(actorRecordKey(key));

    if (quarantined !== undefined)
      tx.act(
        Act.Reported({
          code: "RecordUndecodable",
          record: Option.some(actorRecordKey(key)),
          reason: quarantined,
        }),
      );
  };

  const ensure = (
    actor: ActorId,
    use: Option.Option<Use>,
    existing: boolean,
    wiring: Option.Option<ReadonlyMap<string, ActorId>>,
  ) => {
    const key = actorKey(actor);

    if (incarnationOf(actor) === undefined) {
      const record = Option.fromUndefinedOr(tx.world().records.get(key));

      if (Option.isSome(record) || !existing) {
        const compiled = tx.machines.get(actor.machine);

        if (Option.isNone(record)) startsFresh(key);

        start(
          actor,
          record,
          compiled === undefined ? {} : inputOfName(compiled, actor.name),
          wiring,
        );
      }
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

  // A local actor is always new and lives until disposed: the host's use is never released.
  const createLocal = (actor: ActorId, input: Values) => {
    start(actor, Option.none(), input, Option.none());

    if (incarnationOf(actor) !== undefined)
      tx.set({
        ...tx.world(),
        uses: withEntry(tx.world().uses, actorKey(actor), ["host"]),
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

    // The end waits while the identity's records cannot encode: its grace starts again. An
    // identity whose record stopped encoding was withheld at the end of that turn's step.
    if (incarnation === undefined || tx.world().withheld.has(actorKey(actor))) return;

    // The end writes a dirty record in its own step, not at the next capture.
    saveActor(actor, Due.Now());
    stopSchedules(incarnation);
    disarmWhere((t) => Timer.$is("Grace")(t) && t.incarnation === incarnation.id);
    tx.set({
      ...tx.world(),
      incarnations: without(tx.world().incarnations, actorKey(actor)),
      ended: withEntry(tx.world().ended, actorKey(actor), terminal(incarnation)),
      reads: new Map([...tx.world().reads].filter(([, r]) => r.incarnation !== incarnation.id)),
    });
    tx.act(Act.Finished({ actor }));
    context.unbind(incarnation);
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
        ended: withEntry(tx.world().ended, key, terminal(incarnation)),
        reads: new Map([...tx.world().reads].filter(([, r]) => r.incarnation !== incarnation.id)),
      });
      tx.act(Act.Finished({ actor }));
      context.unbind(incarnation);
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
        tx.world().mail.has(actorKey(incarnation.actor));

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

  const boot = (stored: ReadonlyMap<string, string>) => {
    const restored = decodeRecords(tx.machines, stored);

    tx.set({
      ...tx.world(),
      records: new Map(restored.records.map((r) => [actorKey(r.actor), r])),
      lanes: new Map(
        restored.lanes.flatMap(({ id, lane }) => Option.toArray(Option.map(lane, (l) => [id, l]))),
      ),
      quarantined: new Map(restored.quarantined.map((q) => [q.key, q.reason])),
      owedParts: restored.owedParts,
    });
    ledger.restore(restored.rows);

    // A lane or owed record the boot could not read is reported at each boot while it stays.
    for (const q of restored.quarantined)
      if (!q.key.startsWith("actor/"))
        tx.act(
          Act.Reported({ code: "RecordUndecodable", record: Option.some(q.key), reason: q.reason }),
        );

    // A lane's saved queue and displaced heads end at the boot, in lane-id order after the saved
    // rows; the lane's record is rewritten without them in the same batch as the rows.
    for (const { id, actor, endings } of restored.lanes)
      if (endings.length > 0) {
        ledger.restore(endings);

        for (const ending of endings) tx.act(Act.Ended({ actor, ending }));
        persistence.saveOwed(actor);
        persistence.saveLane(actor, id);
      }

    // A boot owes, parks and delivers nothing: the start of each identity it wakes does. Only an
    // identity owed an ending (a lane in flight at capture, a saved row, or a row the boot just
    // derived) and holding an actor record that decodes is live at ready; a Held lane stays a
    // record, and a disposed identity's rows wait for the incarnation an adopting ensure starts.
    const owing = new Map([
      ...restored.lanes
        .filter((l) => l.inFlight || l.endings.length > 0)
        .map(({ actor }) => [actorKey(actor), actor] as const),
      ...restored.rows.map((r) => [actorKey(r.actor), r.actor] as const),
    ]);

    for (const actor of owing.values()) ensure(actor, Option.none(), true, Option.none());
  };

  return {
    dispose,
    armSchedules,
    stopSchedules,
    stopNamed,
    setIncarnation,
    publish,
    start,
    fireWaiting,
    ensure,
    create: createLocal,
    context,
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

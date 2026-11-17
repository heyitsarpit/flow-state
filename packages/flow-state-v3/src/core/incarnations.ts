import { Option, Result } from "effect";
import type { Values } from "./compiled.ts";
import { inputOfName } from "./identity.ts";
import { makeContext } from "./context.ts";
import { armingsOf } from "./turn.ts";
import { chainOf, create } from "./tree.ts";
import { Act } from "./evidence-of.ts";
import type { LedgerSteps } from "./ledger.ts";
import { actorRecordKey, decodeRecords } from "./record.ts";
import { GRACE_MS, isInFlight, type Tx } from "./tx.ts";
import {
  type ActorId,
  actorKey,
  type ActorRecord,
  Command,
  Due,
  type Incarnation,
  IssueSource,
  Mail,
  Timer,
  startOrder,
  type Use,
  type Wiring,
} from "./world.ts";
import type { Persistence } from "./persist.ts";

/**
 * Incarnations: creation, restore, uses, the grace and the end, with their schedules.
 */
// The source of an issue raised while an incarnation is created.
const CREATION = IssueSource.Creation();

// What an ended incarnation leaves for its handles to read.
const terminal = (incarnation: Incarnation) => ({
  state: incarnation.state,
  memory: incarnation.memory,
});

export const makeIncarnations = (tx: Tx, persistence: Persistence, ledger: LedgerSteps) => {
  const { armTimer, disarm, incarnationOf, used, lanesOf, enqueue } = tx;
  const { removeActor, saveActor } = persistence;

  // ── incarnations.
  const armSchedules = (
    incarnation: Incarnation,
    armings: ReadonlyArray<{ readonly name: string; readonly send: string; readonly ms: number }>,
  ) => {
    if (armings.length === 0) return incarnation;

    const schedules = new Map(incarnation.schedules);

    for (const a of armings) {
      const arming = tx.next();

      for (const armed of Option.toArray(Option.fromUndefinedOr(schedules.get(a.name))))
        disarm(armed.timer);

      const timer = armTimer(
        Timer.Schedule({
          actor: incarnation.actor,
          incarnation: incarnation.id,
          schedule: a.name,
          arming,
        }),
        tx.env.now + a.ms,
      );

      schedules.set(a.name, { arming, dueAt: tx.env.now + a.ms, send: a.send, timer });
    }

    return { ...incarnation, schedules };
  };

  const stopSchedules = (incarnation: Incarnation) => {
    for (const armed of incarnation.schedules.values()) disarm(armed.timer);

    return { ...incarnation, schedules: new Map() };
  };

  // The schedules of the states a move exits stop; the others keep their deadlines.
  const stopNamed = (incarnation: Incarnation, names: ReadonlySet<string>) => {
    if (![...names].some((name) => incarnation.schedules.has(name))) return incarnation;

    for (const [name, armed] of incarnation.schedules) if (names.has(name)) disarm(armed.timer);

    return {
      ...incarnation,
      schedules: new Map([...incarnation.schedules].filter(([name]) => !names.has(name))),
    };
  };

  // Every change of an incarnation is written from its state at the step's end.
  const setIncarnation = (incarnation: Incarnation) => {
    tx.putIncarnation(incarnation);
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
    ensure: (provider, use, wiring) => ensure(provider, use, false, wiring),
    release: (provider, use) => release(provider, use),
    publish: (incarnation) => publish(incarnation),
    save: (incarnation) => setIncarnation(incarnation),
  });

  const start = (
    actor: ActorId,
    from: Option.Option<ActorRecord>,
    input: Values,
    wiring: Option.Option<Wiring>,
  ) => {
    const compiled = tx.machines.get(actor.machine);

    if (compiled === undefined) return;

    const created = Option.match(from, {
      onNone: () => create(compiled, input),
      onSome: (r) => Result.succeed(r.memory),
    });

    if (Result.isFailure(created)) {
      if (created.failure.computed)
        tx.refuse(actor, {
          source: CREATION,
          code: "Defect",
          slot: Option.some(`memory.${created.failure.field}`),
        });

      return;
    }

    const state = Option.match(from, { onNone: () => compiled.initial, onSome: (r) => r.state });

    const base: Incarnation = {
      id: tx.mint("inc"),
      actor,
      state,
      activations: chainOf(state).map(() => tx.next()),
      history: new Map(),
      memory: tx.env.admit(created.success),
      schedules: new Map(),
      issues: [],
      bound: new Map(),
      // A start from a record keeps its saved selections while a selector throws.
      context: Option.match(from, {
        onNone: () => new Map(),
        onSome: (r) =>
          new Map(
            [...r.seen].map(([slot, s]) => [slot, { ...s, value: tx.env.admit(s.value) }] as const),
          ),
      }),
      stale: new Map(),
      baselines: [],
      grace: Option.none(),
    };

    tx.drop("ended", actorKey(actor));
    setIncarnation(base);
    tx.act(Act.Started({ actor }));

    // Its slots bind before its first publication: the baselines are silent. A restored record
    // binds the providers it was saved with, unless the ensure names its own, and starts the
    // providers up its graph with the bindings it saved.
    const fresh = context.bind(
      base,
      Option.getOrElse(
        Option.orElse(
          Option.map(
            Option.flatMap(wiring, (given) => Option.fromUndefinedOr(given.get(actorKey(actor)))),
            (given) => new Map([...compiled.wiring, ...given]),
          ),
          () =>
            Option.filter(
              Option.map(from, (r) => r.context),
              (saved) => saved.size > 0,
            ),
        ),
        () => compiled.wiring,
      ),
      Option.orElse(wiring, () => Option.map(from, (r) => r.graph)),
    );

    // A start from a saved record reads its providers now, and owes its reactions one wave for
    // each slot whose saved selection differs. A reload of a consistent saved world differs in
    // nothing, so it stays silent.
    const bound = Option.match(from, {
      onNone: () => fresh,
      onSome: (record) => context.restore(fresh, record),
    });

    const incarnation = Option.match(from, {
      onNone: () => {
        const arm = armingsOf(compiled, base.state, new Set(chainOf(base.state)), "", base.memory);

        // A delay refused at creation has no turn to refuse: it is an issue of the creation, named
        // by its schedule's slot, and the rest arm.
        const issues = arm.refused.map((slot) =>
          tx.refuse(actor, { source: CREATION, code: "InvalidTurn", slot: Option.some(slot) }),
        );

        return armSchedules({ ...bound, issues: [...bound.issues, ...issues] }, arm.armed);
      },
      onSome: (record) => {
        const schedules = new Map(bound.schedules);

        for (const s of record.schedules) {
          const arming = tx.next();

          const timer = armTimer(
            Timer.Schedule({ actor, incarnation: base.id, schedule: s.name, arming }),
            s.dueAt,
          );

          schedules.set(s.name, { arming, dueAt: s.dueAt, send: s.send, timer });
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
      const live = tx.world().timers.has(armed.timer);

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
    wiring: Option.Option<Wiring>,
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
        tx.putUses(actor, [...(tx.world().uses.get(key) ?? []), u]);
        fireWaiting(actor);
      },
    });
  };

  // A local actor is always new and lives until disposed: the host's use is never released.
  const createLocal = (actor: ActorId, input: Values) => {
    start(actor, Option.none(), input, Option.none());

    if (incarnationOf(actor) !== undefined) tx.putUses(actor, ["host"]);
  };

  const release = (actor: ActorId, use: Use) => {
    const key = actorKey(actor);
    const uses = tx.world().uses.get(key) ?? [];
    const at = uses.indexOf(use);

    if (at < 0) return;
    tx.putUses(actor, uses.toSpliced(at, 1));
  };

  // An ending incarnation leaves: its schedules and grace stop, its reads stop, and its handles
  // keep its terminal snapshot.
  const retire = (incarnation: Incarnation) => {
    stopSchedules(incarnation);

    for (const timer of Option.toArray(incarnation.grace)) disarm(timer);
    tx.dropIncarnation(incarnation.actor);
    tx.put("ended", actorKey(incarnation.actor), terminal(incarnation));

    for (const [call, read] of tx.world().reads)
      if (read.incarnation === incarnation.id) {
        tx.drop("reads", call);
        tx.command(Command.Interrupt({ call }));
      }

    tx.act(Act.Finished({ actor: incarnation.actor }));
    context.unbind(incarnation);
  };

  const end = (actor: ActorId) => {
    const incarnation = incarnationOf(actor);

    // The end waits while the identity's records cannot encode: its grace starts again. An
    // identity whose record stopped encoding was withheld at the end of that turn's step.
    if (incarnation === undefined || tx.world().withheld.has(actorKey(actor))) return;

    // The end writes a dirty record in its own step, not at the next capture.
    saveActor(actor, Due.Now());
    retire(incarnation);
    ledger.suspend(actor, false);
  };

  /**
   * Disposes an identity or forgets it: its incarnation ends without a record, its record is
   * removed, and its lanes stay, unbound until an adopting ensure. Forget also lets go of its
   * parked and kept endings, as evidence.
   */
  const dispose = (actor: ActorId, forgetting: boolean) => {
    const incarnation = incarnationOf(actor);

    if (incarnation !== undefined) retire(incarnation);

    tx.drop("records", actorKey(actor));
    tx.dropUses(actor);
    removeActor(actor);
    ledger.suspend(actor, forgetting);
  };

  // ── after every step: free incarnations start their grace; used ones stop it. Only an
  // identity whose incarnation, uses, lanes, mail or grace changed in the step can change its
  // verdict, so only those are judged, in the order their incarnations started.
  const graces = () => {
    const judged = [...tx.dirtyActors()]
      .flatMap((key) => Option.toArray(Option.fromUndefinedOr(tx.world().incarnations.get(key))))
      .toSorted((a, b) => startOrder(a) - startOrder(b));

    for (const incarnation of judged) {
      const busy =
        used(incarnation.actor) ||
        lanesOf(incarnation.actor).some(([, lane]) => isInFlight(lane)) ||
        tx.world().mail.has(actorKey(incarnation.actor));

      const timing = Option.filter(incarnation.grace, (t) => tx.world().timers.has(t));

      if (busy && Option.isSome(timing)) {
        disarm(timing.value);
        tx.putIncarnation({ ...incarnation, grace: Option.none() });
      }

      if (!busy && Option.isNone(timing)) {
        const grace = armTimer(
          Timer.Grace({ actor: incarnation.actor, incarnation: incarnation.id }),
          tx.env.now + GRACE_MS,
        );

        tx.putIncarnation({ ...incarnation, grace: Option.some(grace) });
      }
    }
  };

  const boot = (stored: ReadonlyMap<string, string>) => {
    const restored = decodeRecords(tx.machines, stored);

    tx.replace("records", new Map(restored.records.map((r) => [actorKey(r.actor), r])));

    for (const { id, lane } of restored.lanes)
      for (const l of Option.toArray(lane)) tx.putLane(id, l);
    tx.replace("quarantined", new Map(restored.quarantined.map((q) => [q.key, q.reason])));
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

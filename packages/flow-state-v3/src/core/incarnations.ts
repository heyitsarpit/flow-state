import { Duration, Option } from "effect";
import type { Values } from "./compiled.ts";
import { inputOfName } from "./identity.ts";
import type { Start } from "./input.ts";
import { makeContext } from "./context.ts";
import { armingsOf } from "./turn.ts";
import { Occasion } from "./schedule-decision.ts";
import { makeSchedules } from "./schedules.ts";
import { makeScheduleRestore } from "./schedule-restore.ts";
import { chainOf, create } from "./tree.ts";
import { Act } from "./evidence-of.ts";
import type { LedgerSteps } from "./ledger.ts";
import { actorRecordKey, decodeRecords, laneRecordKey } from "./record.ts";
import { RuntimeDefaults } from "./defaults.ts";
import { isInFlight, type Tx } from "./tx.ts";
import {
  type ActorId,
  actorKey,
  type ActorKey,
  type ActorRecord,
  type LaneId,
  Command,
  type Incarnation,
  IssueSource,
  Mail,
  Quarantine,
  quarantineText,
  sameActor,
  Timer,
  trackOf,
  byStart,
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
  const schedules = makeSchedules(tx);
  const { restore } = makeScheduleRestore(tx, schedules);

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
    ensure: (provider, use, wiring) => ensure(provider, use, "create", wiring),
    release: (provider, use) => release(provider, use),
    // A changed context re-checks the keys, restarts and pauses that read it.
    publish: (incarnation) => {
      const settled = schedules.rechecked(incarnation, Occasion.Context());

      if (settled !== incarnation) setIncarnation(settled);
      publish(settled);
    },
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

    const memory = Option.match(from, {
      onNone: () => create(compiled, input),
      onSome: (r) => r.memory,
    });

    const state = Option.match(from, { onNone: () => compiled.initial, onSome: (r) => r.state });

    const base: Incarnation = {
      ...tx.mintIncarnation(),
      actor,
      state,
      activations: chainOf(state).map(() => tx.mintActivation()),
      history: new Map(),
      memory: tx.env.admit(memory),
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
      baselines: [],
      grace: Option.none(),
    };

    tx.drop("ended", actorKey(actor));

    // A live identity's record is read from its incarnation: the World keeps none beside it.
    if (tx.world().records.has(actorKey(actor))) tx.drop("records", actorKey(actor));
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
        const entered = chainOf(base.state);

        const arm = armingsOf(
          compiled,
          base.state,
          new Set(entered),
          "",
          {
            memory: bound.memory,
            context: Object.fromEntries([...bound.context].map(([slot, s]) => [slot, s.value])),
            now: tx.env.now,
          },
          (name, series, attempt) => schedules.stepper(actor, name, tx.env.now)(series, attempt),
        );

        // A delay refused at creation has no turn to refuse: it is an issue of the creation, named
        // by its schedule's slot, and the rest arm.
        const issues = arm.refused.map((slot) =>
          tx.refuse(actor, { source: CREATION, code: "InvalidTurn", slot: Option.some(slot) }),
        );

        const created = { ...bound, issues: [...bound.issues, ...issues] };

        return schedules.turned(created, created.schedules, {
          exits: [],
          arms: arm.armed,
          disarms: [],
        });
      },
      onSome: (record) => restore(bound, record.schedules),
    });

    setIncarnation(incarnation);
    publish(incarnation);
    ledger.start(actor);

    // The owed wave waits in its mailbox after the owed rows, ahead of the event that returned it.
    if (context.owes(bound)) enqueue(Mail.Context({ actor, chain: tx.chainNow() }));
  };

  // The deadlines that came due while the actor was unused fire once each, in deadline order.
  const fireWaiting = (actor: ActorId) => {
    const incarnation = incarnationOf(actor);

    if (incarnation === undefined) return;

    for (const { tracked, run } of schedules.waiting(incarnation))
      enqueue(
        Mail.Firing({
          actor,
          incarnation: incarnation.id,
          schedule: tracked.name,
          track: trackOf(tracked.name, tracked.key),
          arming: run.arming,
        }),
      );
  };

  // A record the boot could not read is never restored: the identity starts fresh, reported, and
  // its first save overwrites the record.
  const startsFresh = (key: ActorKey) => {
    const quarantined = tx.world().quarantined.get(actorRecordKey(key));

    if (quarantined !== undefined)
      tx.act(
        Act.Reported({
          code: "RecordUndecodable",
          record: Option.some(actorRecordKey(key)),
          reason: quarantineText(quarantined),
        }),
      );
  };

  const ensure = (
    actor: ActorId,
    use: Option.Option<Use>,
    mode: Start,
    wiring: Option.Option<Wiring>,
  ) => {
    const key = actorKey(actor);

    if (incarnationOf(actor) === undefined) {
      const record = Option.fromUndefinedOr(tx.world().records.get(key));

      if (Option.isSome(record) || mode === "create") {
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
    schedules.stopAll(incarnation);

    for (const timer of Option.toArray(incarnation.grace)) disarm(timer);
    tx.dropIncarnation(incarnation.actor);
    tx.put("ended", actorKey(incarnation.actor), terminal(incarnation));

    for (const [call, read] of tx.world().reads)
      if (read.incarnation === incarnation.id) tx.drop("reads", call);

    tx.command(Command.EndWork({ owners: [incarnation.id], reportTo: "ref" }));
    tx.act(Act.Finished({ actor: incarnation.actor }));
    context.unbind(incarnation);
  };

  const end = (actor: ActorId) => {
    const incarnation = incarnationOf(actor);

    // The end waits while the identity's actor record cannot encode: its grace starts again.
    if (incarnation === undefined || !persistence.encodes(actor)) return;

    // An end captures every marked record at once, not at the next interval.
    persistence.keepEnded(incarnation);
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
    const key = actorKey(actor);

    if (incarnation !== undefined) retire(incarnation);

    tx.drop("records", key);
    tx.dropUses(actor);
    removeActor(actor);
    ledger.suspend(actor, forgetting);
    tx.dropMail(actor);

    if (tx.world().quarantined.has(actorRecordKey(key)))
      tx.drop("quarantined", actorRecordKey(key));

    if (forgetting) forgetRetired(actor);
  };

  // A held lane whose operation this release no longer has never decoded; forget drops its record.
  const forgetRetired = (actor: ActorId) => {
    const retired = [...tx.world().quarantined].flatMap(([record, reason]) =>
      Quarantine.$match(reason, {
        Unreadable: () => [],
        Retired: (r) => (sameActor(r.actor, actor) ? [{ record, ...r }] : []),
      }),
    );

    for (const { record, operation, lane } of retired) {
      tx.drop("quarantined", record);
      persistence.saveLane(actor, lane);
      tx.act(Act.HoldForgotten({ actor, operation, record }));
    }
  };

  /**
   * Delivers a public event as a later turn of the target, by the send table: a live actor gets it,
   * an ended one is restored from the Runtime's copy of its record first, and a send never creates
   * an actor. With no actor to deliver to, the drop is told to the sender as evidence: a record the
   * boot could not read, or none.
   */
  const deliver = (
    actor: ActorId,
    event: { readonly tag: string; readonly payload: Values },
    sender: Option.Option<ActorId>,
  ) => {
    const key = actorKey(actor);

    if (incarnationOf(actor) === undefined && tx.world().records.has(key))
      ensure(actor, Option.none(), "wake", Option.none());

    if (incarnationOf(actor) !== undefined) {
      enqueue(Mail.Event({ actor, ...event, chain: tx.chainNow() }));

      return;
    }

    tx.act(
      Act.SendTargetAbsent({
        actor,
        event: event.tag,
        reason: tx.world().quarantined.has(actorRecordKey(key)) ? "RecordUndecodable" : "NoRecord",
        sender,
      }),
    );
  };

  // ── after every step: free incarnations start their grace; used ones stop it. Only an
  // identity the step changed can change its verdict.
  const graces = () => {
    const judged = [...tx.dirtyActors()]
      .flatMap((key) => Option.toArray(Option.fromUndefinedOr(tx.world().incarnations.get(key))))
      .toSorted(byStart);

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
          tx.env.now + Duration.toMillis(RuntimeDefaults.freeGrace),
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
      if (!Option.contains(q.kind, "actor/"))
        tx.act(
          Act.Reported({
            code: "RecordUndecodable",
            record: Option.some(q.key),
            reason: quarantineText(q.reason),
          }),
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

    for (const actor of owing.values()) ensure(actor, Option.none(), "wake", Option.none());
    reportUnbound(restored.lanes);
  };

  // A lane no actor holds is reported at each boot, until an adopting ensure or its owner's cancel
  // ends it.
  const reportUnbound = (
    lanes: ReadonlyArray<{ readonly id: LaneId; readonly actor: ActorId }>,
  ) => {
    const unbound = lanes.filter(
      ({ id, actor }) =>
        tx.world().lanes.has(id) &&
        incarnationOf(actor) === undefined &&
        !tx.world().records.has(actorKey(actor)),
    );

    for (const { id } of unbound)
      tx.act(
        Act.Reported({
          code: "UnboundLane",
          record: Option.some(laneRecordKey(id)),
          reason: "no actor record holds it",
        }),
      );
  };

  return {
    dispose,
    schedules,
    setIncarnation,
    publish,
    start,
    fireWaiting,
    ensure,
    deliver,
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

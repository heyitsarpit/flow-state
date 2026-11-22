import { Duration, Option } from "effect";
import type { Values } from "./compiled.ts";
import { inputOfName } from "./identity.ts";
import type { Start } from "./input.ts";
import { makeContext } from "./context.ts";
import { Alarm } from "./alarms.ts";
import { makeApply } from "./apply.ts";
import { Change, How, Origin } from "./change.ts";
import { makeSchedules } from "./schedules.ts";
import { makeScheduleRestore } from "./schedule-restore.ts";
import { Act } from "./evidence-of.ts";
import type { LaneSteps } from "./lanes.ts";
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
  Mail,
  Quarantine,
  quarantineText,
  sameActor,
  byStart,
  type Use,
  type Wiring,
} from "./world.ts";
import type { Persistence } from "./persist.ts";

/**
 * Incarnations: creation, restore, uses, the grace and the end; each a change the one applier
 * applies.
 */
export const makeIncarnations = (
  tx: Tx,
  persistence: Persistence,
  ledger: LedgerSteps,
  lanes: LaneSteps,
) => {
  const { setAlarm, clearAlarm, incarnationOf, used, lanesOf, enqueue } = tx;
  const { removeActor } = persistence;

  const schedules = makeSchedules(tx);
  const { restore } = makeScheduleRestore(tx, schedules);

  // A consumer's providers are ensured with a use and released when it ends; ensure and release
  // are defined below and only called once a step runs.
  const context = makeContext(tx, {
    ensure: (provider, use, wiring) => ensure(provider, use, "create", wiring),
    release: (provider, use) => release(provider, use),
  });

  const apply = makeApply(tx, {
    persistence,
    ledger,
    lanes,
    schedules,
    restore,
    context,
    deliver: (actor, event, sender) => deliver(actor, event, sender),
  });

  const live = (actor: ActorId) => Option.fromUndefinedOr(incarnationOf(actor));

  // A restored record binds the providers it was saved with, unless the ensure names its own, and
  // starts the providers up its graph with the bindings it saved.
  const start = (
    actor: ActorId,
    from: Option.Option<ActorRecord>,
    input: Values,
    given: Option.Option<Wiring>,
  ) => {
    const compiled = tx.machines.get(actor.machine);

    if (compiled === undefined) return;

    const wiring = Option.getOrElse(
      Option.orElse(
        Option.map(
          Option.flatMap(given, (g) => Option.fromUndefinedOr(g.get(actorKey(actor)))),
          (own) => new Map([...compiled.wiring, ...own]),
        ),
        () =>
          Option.filter(
            Option.map(from, (r) => r.context),
            (saved) => saved.size > 0,
          ),
      ),
      () => compiled.wiring,
    );

    apply(
      Option.none(),
      Change.Begin({
        actor,
        origin: Option.match(from, {
          onNone: () => Origin.Fresh({ input }),
          onSome: (record) => Origin.Restored({ record }),
        }),
        wiring,
        graph: Option.orElse(given, () => Option.map(from, (r) => r.graph)),
      }),
    );
  };

  // A use added to a live actor: its first wakes the actor's schedules, as a `Use` change.
  const addUse = (actor: ActorId, use: Use) => {
    const returned = !used(actor);
    tx.putUses(actor, [...(tx.world().uses.get(actorKey(actor)) ?? []), use]);

    if (returned) apply(live(actor), Change.Use({ returned }));
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
      onSome: (u) => addUse(actor, u),
    });
  };

  // A local actor is always new and lives until disposed: the host's use is never released.
  const createLocal = (actor: ActorId, input: Values) => {
    start(actor, Option.none(), input, Option.none());

    if (incarnationOf(actor) === undefined) return;

    addUse(actor, "host");
  };

  const release = (actor: ActorId, use: Use) => {
    const key = actorKey(actor);
    const uses = tx.world().uses.get(key) ?? [];
    const at = uses.indexOf(use);

    if (at < 0) return;
    tx.putUses(actor, uses.toSpliced(at, 1));

    // The last use released: the actor's schedules sleep, holding no alarm.
    if (!used(actor) && Option.isSome(live(actor)))
      apply(live(actor), Change.Use({ returned: false }));
  };

  // A free actor's grace passed: it ends with its record kept. The end waits while the identity's
  // actor record cannot encode: its grace starts again.
  const end = (actor: ActorId) => {
    if (Option.isNone(live(actor)) || !persistence.encodes(actor)) return;

    apply(live(actor), Change.End({ how: How.Grace() }));
  };

  /**
   * Disposes an identity or forgets it: its live incarnation ends without a record, its record is
   * removed, and its lanes stay, unbound until an adopting ensure. Forget also lets go of its
   * parked and kept endings, as evidence.
   */
  const dispose = (actor: ActorId, forgetting: boolean) => {
    const key = actorKey(actor);

    if (Option.isSome(live(actor)))
      apply(live(actor), Change.End({ how: forgetting ? How.Forgotten() : How.Disposed() }));
    else {
      ledger.suspend(actor, forgetting);
      tx.dropMail(actor);
    }

    tx.drop("records", key);
    tx.dropUses(actor);
    removeActor(actor);

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
      enqueue(
        Mail.Event({ actor, ...event, chain: tx.chainNow(), resendable: Option.isNone(sender) }),
      );

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

      const grace = Alarm.Grace({ actor: incarnation.actor, incarnation: incarnation.id });

      if (busy) clearAlarm(grace);
      else if (Option.isNone(tx.alarmed(grace)))
        setAlarm(grace, tx.env.now + Duration.toMillis(RuntimeDefaults.freeGrace));
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
    apply,
    dispose,
    schedules,
    start,
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

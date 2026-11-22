import { Equal, Option, Result } from "effect";
import type { Values } from "./compiled.ts";
import { type ContextSteps, OutcomeEdit } from "./context.ts";
import { defect } from "./defect.ts";
import { Change, ENDS, Origin, publishesAlways, refusalOf, whyOf } from "./change.ts";
import { Act } from "./evidence-of.ts";
import type { LaneSteps } from "./lanes.ts";
import type { LedgerSteps } from "./ledger.ts";
import type { Persistence } from "./persist.ts";
import { sameForm } from "./slots.ts";
import { Occasion } from "./schedule-decision.ts";
import type { Due } from "./schedule-plan.ts";
import type { ScheduleSteps } from "./schedules.ts";
import { Alarm } from "./alarms.ts";
import type { Scheduled } from "./timers.ts";
import { historyAfter } from "./tree.ts";
import { Resolved } from "./turn.ts";
import type { Turn } from "./walk.ts";
import { routeOf } from "./trigger.ts";
import type { Tx } from "./tx.ts";
import { create } from "./tree.ts";
import {
  type ActorId,
  type ActorRecord,
  actorKey,
  Command,
  type Incarnation,
  Mail,
  type StoredIssue,
  trackOf,
} from "./world.ts";

/**
 * What the applier needs: the record writes, the owed rows, the lanes, the schedules' decision
 * and restore, the context reads, and the delivery of a turn's sends.
 */
export type ApplierParts = {
  readonly persistence: Persistence;
  readonly ledger: LedgerSteps;
  readonly lanes: LaneSteps;
  readonly schedules: ScheduleSteps;
  readonly restore: (incarnation: Incarnation, saved: ActorRecord["schedules"]) => Incarnation;
  readonly context: ContextSteps;
  readonly deliver: (
    actor: ActorId,
    event: { readonly tag: string; readonly payload: Values },
    sender: Option.Option<ActorId>,
  ) => void;
};

// The sends of a turn, in walk order.
const sendsOf = (turn: Turn) =>
  turn.parts.flatMap((part) => part.actions.filter(Resolved.$is("Send")));

/**
 * The one applier: every change to an actor runs its seven rows in order, each once.
 *
 * **Details**
 *
 * The guard holds a turn's sends to the loop guard, refusing the turn past it; the write writes
 * the incarnation, the only writer of one and the only minter of its activations; the members row
 * runs a turn's lane members; the holders row moves the owed rows; the schedules row decides the
 * schedules and keeps their alarms; the publish row publishes once, by {@link whyOf}; the mail row
 * queues the change's mail. `apply` returns the change it applied, which the guard may have made
 * a refusal.
 */
export const makeApply = (tx: Tx, parts: ApplierParts) => {
  const { persistence, ledger, lanes, schedules, context } = parts;
  const { incarnationOf } = tx;

  // An incarnation written, with its record marked when the change touches what it saves.
  const install = (next: Incarnation, save: boolean) => {
    tx.putIncarnation(next);

    if (save) persistence.saveActor(next.actor);

    return next;
  };

  // The outcomes after their edits: a raise replaces its source's issue and is reported; a clear
  // drops it. No edit keeps the same issues.
  const outcomesAfter = (incarnation: Incarnation, edits: ReadonlyArray<OutcomeEdit>) =>
    edits.reduce<ReadonlyArray<StoredIssue>>(
      (issues, edit) =>
        OutcomeEdit.$match(edit, {
          Raise: ({ issue }) => [
            ...issues.filter((i) => !Equal.equals(i.source, issue.source)),
            tx.refuse(incarnation.actor, issue),
          ],
          Clear: ({ source }) =>
            issues.some((i) => Equal.equals(i.source, source))
              ? issues.filter((i) => !Equal.equals(i.source, source))
              : issues,
        }),
      incarnation.issues,
    );

  // The guard: a turn whose sends would pass the loop guard is refused whole, naming its chain.
  const guard = (change: Change) =>
    Change.$is("Turn")(change) && sendsOf(change.turn).length > 0
      ? Result.match(tx.countSends(sendsOf(change.turn).length), {
          onSuccess: () => change,
          onFailure: (slot) => refusalOf(change.trigger, { code: "InvalidTurn", slot }),
        })
      : change;

  // The write of `Begin`: the incarnation minted, bound and read once. A start from a record keeps its
  // saved selections while a selector throws, and its reactions' saved baselines.
  const begun = (change: Extract<Change, { readonly _tag: "Begin" }>) => {
    const { actor, origin } = change;
    const compiled = tx.machines.get(actor.machine) ?? defect(`no machine ${actor.machine}`);

    const record = Origin.$match(origin, {
      Fresh: () => Option.none<ActorRecord>(),
      Restored: ({ record: r }) => Option.some(r),
    });

    const minted = tx.mintIncarnation();
    const state = Option.match(record, { onNone: () => compiled.initial, onSome: (r) => r.state });

    tx.drop("ended", actorKey(actor));

    // A live identity's record is read from its incarnation: the World keeps none beside it.
    if (tx.world().records.has(actorKey(actor))) tx.drop("records", actorKey(actor));
    tx.act(Act.Started({ actor }));

    const saved = Option.match(record, {
      onNone: () => new Map(),
      onSome: (r) =>
        new Map(
          [...r.seen].map(([slot, s]) => [slot, { ...s, value: tx.env.admit(s.value) }] as const),
        ),
    });

    // Its slots bind before its first publication: the baselines are silent.
    const bound = context.bind(actor, saved, change.wiring, change.graph);

    const base: Incarnation = {
      ...minted,
      actor,
      state,
      activations: (compiled.states.get(state)?.chain ?? []).map(() => tx.mintActivation()),
      history: new Map(),
      memory: tx.env.admit(
        Origin.$match(origin, {
          Fresh: ({ input }) => create(compiled, input),
          Restored: ({ record: r }) => r.memory,
        }),
      ),
      schedules: new Map(),
      issues: [],
      bound: bound.bound,
      context: bound.context,
      baselines: Option.match(record, {
        onNone: () => bound.baselines,
        onSome: (r) => context.restoredBaselines(actor, r),
      }),
    };

    return install({ ...base, issues: outcomesAfter(base, bound.outcomes) }, true);
  };

  // The write: the incarnation after the change's own write; none once it has ended.
  const write = (before: Option.Option<Incarnation>, change: Change) =>
    Change.$match(change, {
      Begin: (begin) => Option.some(begun(begin)),
      Turn: ({ turn, trigger }) =>
        Option.map(before, (incarnation) => {
          const moved = Option.match(turn.move, {
            onNone: () => ({}),
            onSome: (move) => ({
              state: move.leaf,
              activations: [
                ...incarnation.activations.slice(
                  0,
                  incarnation.activations.length - move.exits.length,
                ),
                ...move.enters.map(() => tx.mintActivation()),
              ],
              history: historyAfter(
                tx.machines.get(incarnation.actor.machine) ?? defect("a turn of no machine"),
                incarnation.history,
                incarnation.state,
                move,
              ),
            }),
          });

          return install(
            {
              ...incarnation,
              ...moved,
              memory: tx.env.admit(turn.memory),
              issues: outcomesAfter(
                incarnation,
                Option.toArray(
                  Option.map(routeOf(trigger).source, (source) => OutcomeEdit.Clear({ source })),
                ),
              ),
            },
            true,
          );
        }),
      Refused: ({ source, failure, ending }) =>
        Option.map(before, (incarnation) => {
          const issue = tx.refuse(
            incarnation.actor,
            { source, code: failure.code, slot: Option.some(failure.slot) },
            ending,
          );

          return install(
            {
              ...incarnation,
              issues: [...incarnation.issues.filter((i) => !Equal.equals(i.source, source)), issue],
            },
            false,
          );
        }),
      Unturned: () => before,
      Inputs: ({ read }) =>
        Option.map(before, (incarnation) =>
          install(
            {
              ...incarnation,
              context: read.context,
              baselines: Option.getOrElse(read.baselines, () => incarnation.baselines),
              issues: outcomesAfter(incarnation, read.outcomes),
            },
            Option.isSome(read.baselines),
          ),
        ),
      Lanes: () => before,
      Settled: () => before,
      Use: () => before,
      End: ({ how }) => {
        const ending = ENDS[how._tag];

        for (const incarnation of Option.toArray(before)) {
          if (!ending.drops) continue;

          if (ending.keepsRecord) persistence.keepEnded(incarnation);
          tx.dropIncarnation(incarnation.actor);
          // What it leaves for its handles to read.
          tx.put("ended", actorKey(incarnation.actor), {
            state: incarnation.state,
            memory: incarnation.memory,
          });

          for (const [call, read] of tx.world().reads)
            if (read.incarnation === incarnation.id) tx.drop("reads", call);

          tx.command(Command.EndWork({ owners: [incarnation.id], reportTo: "ref" }));
        }

        return ending.drops ? Option.none<Incarnation>() : before;
      },
    });

  // The members: a turn's lane members, each owned by its part's scope; the turn's record goes before the
  // members' reports, then its lanes flush. The incarnation is read again, since a flush may move
  // it.
  const members = (
    change: Change,
    after: Option.Option<Incarnation>,
    before: Option.Option<Incarnation>,
  ) => {
    if (!Change.$is("Turn")(change)) return after;

    for (const incarnation of Option.toArray(after)) {
      const { turn, trigger } = change;
      const reports = tx.evidenceCount();
      const recorded = lanes.membersOf(incarnation, turn, routeOf(trigger).own);

      tx.insertAct(
        reports,
        Act.Turned({
          actor: incarnation.actor,
          event: turn.parts[0]?.event.tag ?? "",
          from: Option.getOrElse(
            Option.map(before, (b) => b.state),
            () => incarnation.state,
          ),
          to: incarnation.state,
          parts: turn.parts.map((p) => p.part),
          members: recorded,
        }),
      );

      lanes.flushLanes(incarnation.actor);
    }

    return Option.map(after, (a) => incarnationOf(a.actor) ?? a);
  };

  // The holders: the owed rows a start delivers and an end suspends; an ending's own row is tried by its
  // ledger around the change.
  const holders = (change: Change, actor: Option.Option<ActorId>) =>
    Change.$match(change, {
      Begin: ({ actor: started }) => ledger.start(started),
      Turn: () => undefined,
      Refused: () => undefined,
      Unturned: () => undefined,
      Inputs: () => undefined,
      Lanes: () => undefined,
      Settled: () => undefined,
      Use: () => undefined,
      End: ({ how }) => {
        const { rows } = ENDS[how._tag];

        if (rows === "kept") return;

        for (const a of Option.toArray(actor)) ledger.suspend(a, rows === "close");
      },
    });

  // The schedules a change decided, written when they changed.
  const decided = (current: Incarnation, next: Incarnation) =>
    next === current ? current : install(next, true);

  // The schedules: each schedule hears the change's occasion, and the alarms follow the due runs; a returning
  // use also hands back the runs that came due while the actor slept.
  const scheduled = (
    change: Change,
    before: Option.Option<Incarnation>,
    after: Option.Option<Incarnation>,
  ) => {
    const overdue: Array<Due> = [];

    const next = Option.map(after, (current) =>
      Change.$match(change, {
        Begin: ({ origin }) =>
          Origin.$match(origin, {
            Fresh: () => {
              // A start's entry arms, read on its first memory: a creation, so a bad delay is
              // refused with an issue and refuses nothing.
              const arms = schedules.entryArms(current);

              return decided(
                current,
                schedules.turned(current, current.schedules, {
                  exits: [],
                  arms,
                  disarms: [],
                  fired: Option.none(),
                }),
              );
            },
            // A wake decides every schedule silently; when the context differs from what the
            // record last heard, the schedules then hear it as a context change.
            Restored: ({ record }) => {
              const woken = parts.restore(current, record.schedules);

              const moved = [...current.context].some(
                ([slot, now]) =>
                  !sameForm(Option.fromUndefinedOr(record.seen.get(slot)), Option.some(now)),
              );

              return decided(
                current,
                moved ? schedules.rechecked(woken, Occasion.Context()) : woken,
              );
            },
          }),
        Turn: ({ turn, trigger }) =>
          decided(
            current,
            schedules.turned(
              current,
              Option.getOrElse(
                Option.map(before, (b) => b.schedules),
                () => new Map<string, Scheduled>(),
              ),
              {
                exits: Option.match(turn.move, { onNone: () => [], onSome: (m) => m.exits }),
                arms: turn.work.flatMap((w) => w.started),
                disarms: turn.work.flatMap((w) => w.disarmed),
                fired: routeOf(trigger).firing,
              },
            ),
          ),
        Refused: () => current,
        Unturned: () => current,
        Inputs: ({ read }) =>
          read.changed || Option.exists(before, (b) => b.issues !== current.issues)
            ? decided(current, schedules.rechecked(current, Occasion.Context()))
            : current,
        Lanes: () => decided(current, schedules.rechecked(current, Occasion.Lanes())),
        Settled: ({ firing, refusal }) =>
          decided(current, schedules.firingSettled(current, firing, refusal)),
        Use: ({ returned }) => {
          if (returned) overdue.push(...schedules.wake(current));

          return current;
        },
        End: () => current,
      }),
    );

    if (Change.$is("End")(change))
      for (const incarnation of Option.toArray(before))
        tx.clearAlarm(Alarm.Grace({ actor: incarnation.actor, incarnation: incarnation.id }));

    if (!(Change.$is("Use")(change) && change.returned)) schedules.syncAlarms(before, next);

    return { after: next, overdue };
  };

  // Whether a change that publishes only what it changed changed what a snapshot shows.
  const differs = (change: Change, before: Incarnation, after: Incarnation) =>
    (Change.$is("Inputs")(change) && change.read.changed) ||
    before.state !== after.state ||
    before.memory !== after.memory ||
    before.issues !== after.issues ||
    before.schedules !== after.schedules;

  // The publish row: one publication, built here alone, carrying the incarnation and why: always for a start, a
  // turn, a refusal and an unturned ending; once it differs for the rest; `Finished` for an end.
  const published = (
    change: Change,
    before: Option.Option<Incarnation>,
    after: Option.Option<Incarnation>,
  ) => {
    if (Change.$is("End")(change)) {
      for (const incarnation of Option.toArray(before))
        tx.act(Act.Finished({ actor: incarnation.actor }));

      return;
    }

    const always = publishesAlways(change);

    for (const why of Option.toArray(whyOf(change)))
      for (const incarnation of Option.toArray(after))
        if (always || Option.exists(before, (b) => differs(change, b, incarnation)))
          tx.act(Act.Published({ actor: incarnation.actor, incarnation, why }));
  };

  // The mail row: the change's mail: a start's owed context update; a turn's wave to its consumers and its
  // sends, in walk order; an update's reaction events at the front; a returning use's overdue
  // firings; an end's providers released and, when disposed or forgotten, its mailbox dropped.
  const mailed = (
    change: Change,
    before: Option.Option<Incarnation>,
    after: Option.Option<Incarnation>,
    overdue: ReadonlyArray<Due>,
  ) =>
    Change.$match(change, {
      Begin: () => {
        for (const incarnation of Option.toArray(after))
          if (context.owes(incarnation)) tx.owe(incarnation.actor);
      },
      Turn: ({ turn }) => {
        for (const incarnation of Option.toArray(after)) {
          if (
            Option.exists(
              before,
              (b) => b.state !== incarnation.state || b.memory !== incarnation.memory,
            )
          )
            context.wave(incarnation.actor);

          for (const sent of sendsOf(turn))
            parts.deliver(
              sent.actor,
              { tag: sent.tag, payload: sent.payload },
              Option.some(incarnation.actor),
            );
        }
      },
      Refused: () => undefined,
      Unturned: () => undefined,
      Inputs: ({ read }) => {
        for (const incarnation of Option.toArray(after))
          tx.front(
            read.events.map((event) =>
              Mail.Event({
                actor: incarnation.actor,
                ...event,
                chain: tx.chainNow(),
                resendable: false,
              }),
            ),
          );
      },
      Lanes: () => undefined,
      Settled: () => undefined,
      Use: () => {
        for (const incarnation of Option.toArray(after))
          for (const { tracked, run } of overdue)
            tx.enqueue(
              Mail.Firing({
                actor: incarnation.actor,
                incarnation: incarnation.id,
                schedule: tracked.name,
                track: trackOf(tracked.name, tracked.key),
                arming: run.arming,
              }),
            );
      },
      End: ({ how }) => {
        for (const incarnation of Option.toArray(before)) {
          if (ENDS[how._tag].releases) context.unbind(incarnation);

          // An event its mailbox held finds its actor gone: it is unhandled, never dropped unseen.
          if (ENDS[how._tag].dropsMail)
            for (const mail of tx.dropMail(incarnation.actor))
              if (Mail.$is("Event")(mail))
                tx.act(Act.Unhandled({ actor: mail.actor, event: mail.tag }));
        }
      },
    });

  /**
   * Applies one change to its actor, whose live incarnation is `before` (none exactly for a
   * `Begin`), and returns the change applied: a turn past the loop guard is applied as its
   * refusal.
   */
  // RETURN_TYPE: recursive: a refusal the guard found is applied in its place.
  const apply = (before: Option.Option<Incarnation>, given: Change): Change => {
    const change = guard(given);

    if (change !== given) return apply(before, change);

    const written = write(before, change);
    const current = members(change, written, before);
    holders(
      change,
      Option.orElse(
        Option.map(before, (b) => b.actor),
        () => Option.map(current, (c) => c.actor),
      ),
    );
    const { after, overdue } = scheduled(change, before, current);
    published(change, before, after);
    mailed(change, before, after, overdue);

    return change;
  };

  return apply;
};

/**
 * The one applier.
 */
export type Apply = ReturnType<typeof makeApply>;

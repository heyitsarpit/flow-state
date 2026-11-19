import { Duration, Option, Result } from "effect";
import { Act } from "./evidence-of.ts";
import { Audience, Delivery, IN_MAILBOX, type Owed, rowsOf } from "./ledger.ts";
import { encodeActor } from "./actor-record.ts";
import { actorRecordKey, encodeLane, encodeOwed, laneRecordKey, owedRecordKey } from "./record.ts";
import { RuntimeDefaults } from "./defaults.ts";
import type { Tx } from "./tx.ts";
import {
  type ActorId,
  actorKey,
  type ActorRecord,
  Command,
  Due,
  type Incarnation,
  type Lane,
  lastSeenOf,
  Mark,
  type Marks,
  type Ticket,
  type TicketId,
  Timer,
  type Wiring,
  type Write,
} from "./world.ts";

// An identity's owed record holds every row owed to the identity, whatever its delivery.
const toIdentity = (row: Owed) => Audience.$is("Identity")(row.to);

// A row whose try is still in the mailbox: a step that ends with one (a drain stopped at its cap)
// marks the owed record, which no move into or out of a saved delivery did.
const inMailbox = (row: Owed) => toIdentity(row) && IN_MAILBOX[row.delivery._tag];

// Each live incarnation's last record text with the graph it was encoded with: an incarnation is
// immutable, so the same one under the same bindings encodes the same text.
const texts = new WeakMap<
  Incarnation,
  { readonly graph: Wiring; readonly text: Result.Result<string, string> }
>();

const sameGraph = (a: Wiring, b: Wiring) =>
  a.size === b.size && [...a].every(([key, bound]) => b.get(key) === bound);

// An identity's records in the order a batch writes them: its actor record, its lanes, its owed record.
const rank = Mark.$match({ Actor: () => 0, Lane: () => 1, Owed: () => 2 });

/**
 * Persistence of a step: setters mark the record keys a step changes, and a capture encodes every
 * marked key from the World it is given, once, when the edge issues a batch.
 *
 * **Details**
 *
 * A step's marks are due when a send awaits them (`Awaited`), at once when an actor record was
 * removed or an incarnation ended (`Now`), and within the capture interval otherwise (`Later`).
 * An identity whose actor record cannot encode is withheld whole: its keys stay marked, so no lane
 * or owed record outruns its actor record.
 */
export const makePersistence = (tx: Tx) => {
  const { persisted, armTimer, incarnationOf } = tx;

  // What this step did to the records: whether it marked any, whether they are due now, and the
  // tickets its sends await, each with its identity. Step-local, written in place.
  let marked = false;
  let now = false;
  const awaited: Array<{ readonly ticket: Ticket; readonly actor: ActorId }> = [];

  const mark = (key: string, made: Mark) => {
    marked = true;

    if (!tx.world().marked.has(key)) tx.put("marked", key, made);
  };

  // The bindings of every provider up a consumer's graph: a provider started for it again, saved or
  // not, binds as it did, even when it has no record of its own yet.
  const graphOf = (incarnation: Incarnation) => {
    const graph = new Map<string, ReadonlyMap<string, ActorId>>();

    // RETURN_TYPE: recursive: a provider's own providers are read on the way up.
    const walk = (consumer: Incarnation): void => {
      for (const provider of consumer.bound.values()) {
        const key = actorKey(provider);
        const live = incarnationOf(provider);

        if (live !== undefined && !graph.has(key)) {
          graph.set(key, live.bound);
          walk(live);
        }
      }
    };

    walk(incarnation);

    return graph;
  };

  // RETURN_TYPE: the Runtime's copy of a record, whose schedule list stays the record's shape.
  const recordOf = (
    incarnation: Incarnation,
    graph: Wiring = graphOf(incarnation),
  ): ActorRecord => ({
    actor: incarnation.actor,
    state: incarnation.state,
    memory: incarnation.memory,
    schedules: [...incarnation.schedules].map(([name, a]) => ({
      name,
      dueAt: a.dueAt,
      send: a.send,
    })),
    context: incarnation.bound,
    seen: new Map(
      [...lastSeenOf(incarnation)].flatMap(([slot, s]) =>
        Option.toArray(Option.map(s, (v) => [slot, v] as const)),
      ),
    ),
    frames: incarnation.baselines.map((b) => Option.map(b, (x) => x.frame)),
    graph,
  });

  // A record's write, or the key and reason it cannot encode.
  const encoded = (key: string, text: Result.Result<string, string>) =>
    Result.mapBoth(text, {
      // RETURN_TYPE: a Write, so a removal and a record are one list.
      onSuccess: (record): Write => ({ key, record: Option.some(record) }),
      onFailure: (reason) => ({ key, reason }),
    });

  const textOf = (record: ActorRecord) => {
    const compiled = tx.machines.get(record.actor.machine);

    return compiled === undefined ? Result.fail("machine") : encodeActor(compiled, record);
  };

  // A live incarnation's record text, kept by the incarnation and its graph's bindings, so a ticket's
  // check and the capture that follows encode it once.
  const liveText = (incarnation: Incarnation) => {
    const graph = graphOf(incarnation);
    const known = texts.get(incarnation);

    if (known !== undefined && sameGraph(known.graph, graph)) return known.text;

    const text = textOf(recordOf(incarnation, graph));
    texts.set(incarnation, { graph, text });

    return text;
  };

  // An identity's actor record from the World: its live incarnation's, else the one the World
  // keeps for it, else a removal.
  const actorWrite = (actor: ActorId) => {
    const key = actorRecordKey(actorKey(actor));
    const live = incarnationOf(actor);

    if (live !== undefined) return encoded(key, liveText(live));

    const kept = tx.world().records.get(actorKey(actor));

    return kept === undefined
      ? Result.succeed<Write>({ key, record: Option.none() })
      : encoded(key, textOf(kept));
  };

  // A lane's record from its entry; a lane gone Idle that still owes a displaced Attempt's ending
  // keeps a record with no head, and one that owes nothing is removed.
  const laneWrite = (id: string) => {
    const key = laneRecordKey(id);
    const lane = Option.fromUndefinedOr(tx.world().lanes.get(id));
    const owing = [...tx.world().displaced.values()].filter((d) => d.lane === id && d.owed);

    const named = Option.orElse(
      Option.map(lane, (l) => ({ actor: l.actor, operation: l.operation })),
      () =>
        Option.map(Option.fromUndefinedOr(owing[0]), (d) => ({
          actor: d.actor,
          operation: d.operation,
        })),
    );

    return Option.match(named, {
      onNone: () => Result.succeed<Write>({ key, record: Option.none() }),
      onSome: ({ actor, operation }) => {
        const compiled = tx.machines.get(actor.machine);

        return encoded(
          key,
          compiled === undefined
            ? Result.fail("machine")
            : encodeLane(
                compiled,
                operation,
                actor,
                lane,
                owing.map((d) => d.head.id),
              ),
        );
      },
    });
  };

  // An identity's owed record, written, or removed once it owes nothing.
  const owedWrite = (actor: ActorId) => {
    const key = owedRecordKey(actorKey(actor));

    const rows = rowsOf(tx.world().owed, actor)
      .filter(toIdentity)
      .map((r) => ({ ...r, kept: Delivery.$is("Kept")(r.delivery) }));

    const owed =
      rows.length === 0
        ? Result.succeed({ text: Option.none<string>(), unsaved: 0 })
        : Result.map(encodeOwed(actor, rows), (o) => ({ ...o, text: Option.some(o.text) }));

    // A value that cannot be saved even alone is reported; its row is saved as unknown Restored.
    if (Result.isSuccess(owed) && owed.success.unsaved > 0)
      tx.act(
        Act.Reported({
          code: "UnencodableValue",
          record: Option.some(key),
          reason: `${owed.success.unsaved} values with no encoded form saved as unknown Restored`,
        }),
      );

    return Result.mapBoth(owed, {
      onFailure: (reason) => ({ key, reason }),
      // RETURN_TYPE: a Write, so a removal and a record are one list.
      onSuccess: ({ text }): Write => ({ key, record: text }),
    });
  };

  const writeOf = (m: Mark) =>
    Mark.$match(m, {
      Actor: ({ actor }) => actorWrite(actor),
      Lane: ({ lane }) => laneWrite(lane),
      Owed: ({ actor }) => owedWrite(actor),
    });

  // An identity starts to wait: reported once, as it starts.
  const reportWithheld = (
    actor: ActorId,
    failure: { readonly key: string; readonly reason: string },
  ) => {
    if (!tx.world().withheld.has(actorKey(actor)))
      tx.act(
        Act.Reported({
          code: "UnencodableValue",
          record: Option.some(failure.key),
          reason: `withheld: ${failure.reason}`,
        }),
      );
  };

  /**
   * Whether an identity's actor record encodes from the World as it stands; one that does not is
   * withheld at once, reported as it starts to wait.
   *
   * **When to use**
   *
   * Before a move that must not outrun the record: a ticket a send awaits, and an end.
   */
  const encodes = (actor: ActorId) => {
    if (!persisted(actor)) return true;

    const write = actorWrite(actor);

    if (Result.isSuccess(write)) return true;
    reportWithheld(actor, write.failure);
    tx.put("withheld", actorKey(actor), actor);

    return false;
  };

  /**
   * Marks an identity's actor record as changed.
   */
  const saveActor = (actor: ActorId) => {
    if (incarnationOf(actor) !== undefined && persisted(actor))
      mark(actorRecordKey(actorKey(actor)), Mark.Actor({ actor }));
  };

  /**
   * Keeps the record of an identity whose incarnation ends, which outlives it, and makes the
   * step's marks due at once. Its record needs no mark: every change to it was marked as made.
   */
  const keepEnded = (incarnation: Incarnation) => {
    if (!persisted(incarnation.actor)) return;
    tx.put("records", actorKey(incarnation.actor), recordOf(incarnation));
    now = true;
  };

  /**
   * Marks an identity's actor record as removed: captured at once.
   */
  const removeActor = (actor: ActorId) => {
    if (!persisted(actor)) return;
    now = true;
    mark(actorRecordKey(actorKey(actor)), Mark.Actor({ actor }));
  };

  /**
   * Marks a lane's record as changed: captured from the lane's state, or removed if it is gone.
   */
  const saveLane = (actor: ActorId, id: string) => {
    if (persisted(actor)) mark(laneRecordKey(id), Mark.Lane({ actor, lane: id }));
  };

  /**
   * Marks a lane as changed and returns the ticket a send awaits for its capture; `None` when the
   * identity does not persist.
   */
  const saveAwaited = (
    actor: ActorId,
    id: string,
    wanted: { readonly attempt: string; readonly purpose: "acknowledge" | "capture" },
  ) => {
    if (!persisted(actor)) return Option.none<TicketId>();

    const ticket: Ticket = { id: tx.mint("ticket"), ...wanted };
    saveLane(actor, id);
    awaited.push({ ticket, actor });

    return Option.some(ticket.id);
  };

  /**
   * Marks an identity's owed record as changed.
   */
  const saveOwed = (actor: ActorId) => {
    if (persisted(actor)) mark(owedRecordKey(actorKey(actor)), Mark.Owed({ actor }));
  };

  // ── lanes: every change of a lane's entry marks its record.
  const setLane = (id: string, lane: Lane) => {
    tx.putLane(id, lane);
    saveLane(lane.actor, id);
  };

  /**
   * Puts a head on the wire without a mark: its record already says what the call carries, since
   * an acknowledgement or a capture landed it in flight with the retryCount it is sent with.
   */
  const sendLane = (id: string, lane: Lane) => tx.putLane(id, lane);

  const dropLane = (id: string, lane: Lane) => {
    tx.dropLane(id);
    saveLane(lane.actor, id);
  };

  // Only a step that left mail can end with a row in the mailbox.
  const markMailbox = () => {
    for (const rows of tx.world().mail.size > 0 ? tx.world().owed.values() : []) {
      const waiting = rows.find(inMailbox);

      if (waiting !== undefined) saveOwed(waiting.actor);
    }
  };

  const dueOf = (tickets: ReadonlyArray<Ticket>) => {
    if (tickets.length > 0) return Due.Awaited({ tickets });

    return now ? Due.Now() : Due.Later();
  };

  /**
   * Ends a step: tells the edge when its marks are due. A ticket whose identity's actor record
   * cannot encode is refused at once, so no send waits on it; the others' silence is timed from
   * now.
   */
  const close = (final: ReadonlyArray<Ticket> = []) => {
    markMailbox();

    const sent = awaited.filter(({ actor }) => encodes(actor));

    const refused = awaited.filter((a) => !sent.includes(a)).map((a) => a.ticket.id);

    if (!marked && !now && final.length === 0 && refused.length === 0) return;

    for (const { ticket } of sent)
      armTimer(
        Timer.Silent({ ticket: ticket.id }),
        tx.env.now + Duration.toMillis(RuntimeDefaults.storageSilent),
      );

    const tickets = [...sent.map((a) => a.ticket), ...final];

    tx.command(Command.Persist({ refused, due: dueOf(tickets) }));
  };

  // The identity a ticket's send belongs to: the lane or displaced head that waits on it.
  const identityOf = (ticket: Ticket) =>
    Option.orElse(
      Option.map(tx.laneWaiting(ticket.id), ([, lane]) => lane.actor),
      () => Option.map(Option.fromUndefinedOr(tx.world().displaced.get(ticket.id)), (d) => d.actor),
    );

  // Every key to capture, by identity in first-mark order, each identity's keys in batch order.
  const byIdentity = (again: Marks) => {
    const identities = new Map<string, Array<readonly [string, Mark]>>();

    for (const entry of new Map([...again, ...tx.world().marked])) {
      const key = actorKey(entry[1].actor);
      const keys = identities.get(key);

      if (keys === undefined) identities.set(key, [entry]);
      else keys.push(entry);
    }

    return [...identities.values()].map((keys) =>
      keys.toSorted(([, a], [, b]) => rank(a) - rank(b)),
    );
  };

  // The identities that cannot write wait whole: their keys stay marked, and each is reported
  // once, as it starts to wait.
  const withhold = (
    held: ReadonlyArray<{
      readonly keys: ReadonlyArray<readonly [string, Mark]>;
      readonly failure: { readonly key: string; readonly reason: string };
    }>,
  ) => {
    const withheld = new Map(
      held.flatMap(({ keys, failure }) =>
        keys.slice(0, 1).map(([, m]) => {
          reportWithheld(m.actor, failure);

          return [actorKey(m.actor), m.actor] as const;
        }),
      ),
    );

    if (withheld.size > 0 || tx.world().withheld.size > 0) tx.replace("withheld", withheld);

    if (tx.world().marked.size > 0 || held.length > 0)
      tx.replace("marked", new Map(held.flatMap((h) => h.keys)));

    return withheld;
  };

  /**
   * Captures every marked key, and the keys of a refused batch, from the World as it stands: one
   * batch for the whole Runtime.
   *
   * **Details**
   *
   * An identity whose actor record cannot encode writes none of its records: its keys stay marked,
   * it is reported once as it starts to wait, and a ticket its sends await is refused. A record
   * written over a quarantined one is quarantined no more.
   */
  const capture = (tickets: ReadonlyArray<Ticket>, again: Marks) => {
    const projected = byIdentity(again).map((keys) => ({
      keys,
      written: Result.all(keys.map(([, m]) => writeOf(m))),
    }));

    const went = projected.flatMap(({ keys, written }) =>
      Result.isSuccess(written) ? [{ keys, writes: written.success }] : [],
    );

    const withheld = withhold(
      projected.flatMap(({ keys, written }) =>
        Result.isFailure(written) ? [{ keys, failure: written.failure }] : [],
      ),
    );

    const writes = went.flatMap((w) => w.writes);

    for (const write of tx.world().quarantined.size > 0 ? writes : [])
      if (tx.world().quarantined.has(write.key)) tx.drop("quarantined", write.key);

    const refused = tickets.filter((t) =>
      Option.exists(identityOf(t), (actor) => withheld.has(actorKey(actor))),
    );

    tx.command(
      Command.Write({
        writes,
        marks: new Map(went.flatMap((w) => w.keys)),
        tickets: tickets.filter((t) => !refused.includes(t)),
        refused: refused.map((t) => t.id),
      }),
    );
  };

  return {
    saveActor,
    keepEnded,
    removeActor,
    saveLane,
    saveAwaited,
    saveOwed,
    setLane,
    sendLane,
    dropLane,
    encodes,
    close,
    capture,
    marked: () => marked,
  };
};

/**
 * Persistence of a step.
 */
export type Persistence = ReturnType<typeof makePersistence>;

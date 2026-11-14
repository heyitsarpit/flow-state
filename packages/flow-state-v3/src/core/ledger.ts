import { type Brand, Data, Option } from "effect";
import { Act, evidenceOf } from "./evidence-of.ts";
import { Evidence } from "./evidence.ts";
import type { Persistence } from "./persist.ts";
import { ROOT_ACTIVATION, type Tx } from "./tx.ts";
import type { Channel } from "./vocabulary.ts";
import { type ActorId, actorKey, Disposal, Mail } from "./world.ts";

/**
 * Who may hear an owed ending: any incarnation of the identity, or one incarnation alone.
 */
export type Audience = Data.TaggedEnum<{ Identity: {}; Life: { incarnation: string } }>;

/**
 * Constructors and matchers for {@link Audience}.
 */
export const Audience = Data.taggedEnum<Audience>();

/**
 * Where an owed ending's delivery stands.
 *
 * **Details**
 *
 * - `Queued`: a try is in the mailbox.
 * - `Retrying`: refused once, or a Kept row on its one try at a start; its try is in the mailbox.
 * - `Waiting`: nothing can hear it now; the identity's next start queues it.
 * - `Kept`: refused twice; one try at each start; it blocks its lane's key.
 */
export type Delivery = Data.TaggedEnum<{ Queued: {}; Retrying: {}; Waiting: {}; Kept: {} }>;

/**
 * Constructors and matchers for {@link Delivery}.
 */
export const Delivery = Data.taggedEnum<Delivery>();

/**
 * An owed ending's id: minted once, never shown outside the core.
 */
export type OwedId = string & Brand.Brand<"flow-state/OwedId">;

/**
 * One owed ending: the only place an ending is held from its birth to its close.
 */
export type Owed = {
  readonly id: OwedId;
  readonly actor: ActorId;
  readonly to: Audience;
  readonly operation: string;
  readonly attempt: Option.Option<string>;
  readonly lane: Option.Option<string>;
  readonly channel: Channel;
  readonly reason: string;
  // FLOW_STATE_ALLOW_UNKNOWN: the ending's value is the commit's or lookup's own, mapped when heard.
  readonly value: unknown;
  readonly owner: number;
  readonly current: boolean;
  readonly delivery: Delivery;
};

/**
 * How a row closes: heard by a turn, or recorded as evidence or let go.
 */
export type Closed = Data.TaggedEnum<{
  Delivered: {};
  Recorded: { why: "evidence" | "letGo" };
}>;

/**
 * Constructors and matchers for {@link Closed}.
 */
export const Closed = Data.taggedEnum<Closed>();

/**
 * Each identity's owed rows, in the order they were owed. Only this module builds one.
 */
export type Ledger = ReadonlyMap<string, ReadonlyArray<Owed>> & Brand.Brand<"flow-state/Ledger">;

const ledgerOf = (rows: ReadonlyMap<string, ReadonlyArray<Owed>>) =>
  // SAFETY: this module is the only place a ledger is built, from the rows it keeps.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a brand is type-only; the ledger's functions are where it is given
  rows as Ledger;

/**
 * A ledger with no row.
 */
export const emptyLedger = ledgerOf(new Map());

/**
 * An identity's owed rows, in owed order.
 */
export const rowsOf = (ledger: Ledger, actor: ActorId) => ledger.get(actorKey(actor)) ?? [];

/**
 * Whether a Kept row names a lane: the only read that blocks a key.
 */
export const keptOn = (ledger: Ledger, actor: ActorId, lane: string) =>
  rowsOf(ledger, actor).some(
    (r) => Delivery.$is("Kept")(r.delivery) && Option.contains(r.lane, lane),
  );

/**
 * How a turn heard a row's try: with no mapping, heard (accepted, unhandled or denied), or
 * refused.
 */
export type Heard = "Unmapped" | "Heard" | "Refused";

/**
 * The ledger's five functions on one step's working state: the only code that builds, moves or
 * removes a row.
 */
export const makeLedger = (tx: Tx, persistence: Persistence) => {
  const { incarnationOf } = tx;

  const setRows = (actor: ActorId, rows: ReadonlyArray<Owed>) => {
    const next = new Map(tx.world().owed);

    if (rows.length === 0) next.delete(actorKey(actor));
    else next.set(actorKey(actor), rows);

    tx.set({ ...tx.world(), owed: ledgerOf(next) });
  };

  const find = (id: OwedId) =>
    Option.fromUndefinedOr(
      [...tx.world().owed.values()].flatMap((rows) => rows.filter((r) => r.id === id))[0],
    );

  const replace = (row: Owed, next: Option.Option<Owed>) =>
    setRows(
      row.actor,
      rowsOf(tx.world().owed, row.actor).flatMap((r) =>
        r.id === row.id ? Option.toArray(next) : [r],
      ),
    );

  const queue = (row: Owed, delivery: Delivery) => {
    replace(row, Option.some({ ...row, delivery }));
    tx.enqueue(Mail.Ending({ actor: row.actor, id: row.id }));
  };

  // A start adopts its rows: each is delivered current, from the active leaf.
  const adopt = (row: Owed, delivery: Delivery) =>
    queue({ ...row, current: true, owner: ROOT_ACTIVATION }, delivery);

  const live = (row: Pick<Owed, "actor" | "to">) => {
    const incarnation = incarnationOf(row.actor);

    return (
      Disposal.$is("Open")(tx.world().disposal) &&
      incarnation !== undefined &&
      Audience.$match(row.to, {
        Identity: () => true,
        Life: ({ incarnation: id }) => incarnation.id === id,
      })
    );
  };

  // A row that leaves the mailbox takes its references with it: the mail refers to exactly the
  // Queued and Retrying rows.
  const unreferenced = (row: Owed) =>
    tx.set({
      ...tx.world(),
      mail: tx.world().mail.filter((m) => !(Mail.$is("Ending")(m) && m.id === row.id)),
    });

  const recorded = (row: Owed, why: "evidence" | "letGo") =>
    tx.emit(Evidence.Recorded({ operation: row.operation, attempt: row.attempt, why }));

  // A row that waits or is kept is saved for the identity; a move into or out of either state
  // writes that state's rows of its lane.
  const saved = (row: Owed, delivery: Delivery) => {
    if (Delivery.$is("Waiting")(delivery) || Delivery.$is("Kept")(delivery))
      persistence.saveRows(row.actor, row.operation, row.lane, Delivery.$is("Kept")(delivery));
  };

  /**
   * Closes a row: the only removal.
   */
  const close = (row: Owed, how: Closed) => {
    replace(row, Option.none());
    unreferenced(row);
    Closed.$match(how, { Delivered: () => undefined, Recorded: ({ why }) => recorded(row, why) });
    saved(row, row.delivery);
  };

  const wait = (row: Owed) => {
    replace(row, Option.some({ ...row, delivery: Delivery.Waiting() }));
    unreferenced(row);
    tx.emit(Evidence.Parked({ operation: row.operation, attempt: row.attempt }));
    saved(row, Delivery.Waiting());
  };

  /**
   * Owes an ending, already applied to its lane: Queued when its audience can hear it now,
   * Waiting when not; a row for an incarnation that is gone closes at once as evidence.
   */
  const owe = (ending: Omit<Owed, "id" | "delivery">) => {
    const row: Owed = { ...ending, id: tx.mint<OwedId>("owed"), delivery: Delivery.Queued() };
    setRows(row.actor, [...rowsOf(tx.world().owed, row.actor), row]);

    for (const e of evidenceOf(Act.Ended({ actor: row.actor, ending: row }))) tx.emit(e);

    if (live(row)) {
      tx.enqueue(Mail.Ending({ actor: row.actor, id: row.id }));

      return row.id;
    }

    if (Audience.$is("Life")(row.to)) close(row, Closed.Recorded({ why: "evidence" }));
    else wait(row);

    return row.id;
  };

  /**
   * Serves one mail reference: a reference to a row that is gone, or not in the mailbox, does
   * nothing. `hear` runs the row's turn; an unmapped row closes as evidence, a heard one closes
   * delivered, and a refusal queues a Queued row once more behind queued mail and keeps a
   * Retrying one.
   */
  const tryOne = (id: OwedId, hear: (row: Owed) => Heard) =>
    Option.match(find(id), {
      onNone: () => undefined,
      onSome: (row) => {
        if (!Delivery.$is("Queued")(row.delivery) && !Delivery.$is("Retrying")(row.delivery))
          return;

        const heard = hear(row);
        const now = find(id);

        if (Option.isNone(now)) return;

        if (heard === "Unmapped") close(now.value, Closed.Recorded({ why: "evidence" }));
        else if (heard === "Heard") close(now.value, Closed.Delivered());
        else if (Delivery.$is("Queued")(now.value.delivery)) queue(now.value, Delivery.Retrying());
        else if (Delivery.$is("Retrying")(now.value.delivery)) {
          replace(now.value, Option.some({ ...now.value, delivery: Delivery.Kept() }));
          saved(now.value, Delivery.Kept());
        }
      },
    });

  /**
   * An identity can no longer hear: its Queued and Retrying rows wait, lane or not, and rows owed
   * to one incarnation close as evidence. `forget` closes every row instead.
   */
  const forgotten = (row: Owed) =>
    close(row, Closed.Recorded({ why: Delivery.$is("Kept")(row.delivery) ? "letGo" : "evidence" }));

  const suspended = (row: Owed) => {
    if (Audience.$is("Life")(row.to)) close(row, Closed.Recorded({ why: "evidence" }));
    else if (Delivery.$is("Queued")(row.delivery) || Delivery.$is("Retrying")(row.delivery))
      wait(row);
  };

  const suspend = (actor: ActorId, forget: boolean) => {
    for (const row of rowsOf(tx.world().owed, actor)) (forget ? forgotten : suspended)(row);
  };

  /**
   * The one delivery point of a start: Waiting rows queue and Kept rows take their one try, in
   * the order owed.
   */
  const start = (actor: ActorId) => {
    for (const row of rowsOf(tx.world().owed, actor))
      if (Delivery.$is("Waiting")(row.delivery)) {
        tx.emit(Evidence.Unparked({ operation: row.operation, attempt: row.attempt }));
        adopt(row, Delivery.Queued());
        saved(row, row.delivery);
      } else if (Delivery.$is("Kept")(row.delivery)) {
        adopt(row, Delivery.Retrying());
        saved(row, row.delivery);
      }
  };

  /**
   * Lets a lane's Kept rows go, as a cancel on its Idle lane does.
   */
  const letGoKept = (actor: ActorId, lane: string) => {
    for (const row of rowsOf(tx.world().owed, actor))
      if (Delivery.$is("Kept")(row.delivery) && Option.contains(row.lane, lane))
        close(row, Closed.Recorded({ why: "letGo" }));
  };

  /**
   * Rows a boot decoded, owed to their identity: Waiting, or Kept, with no report; their start
   * delivers them.
   */
  const restore = (
    rows: ReadonlyArray<Omit<Owed, "id" | "delivery" | "to"> & { readonly kept: boolean }>,
  ) => {
    for (const { kept, ...row } of rows)
      setRows(row.actor, [
        ...rowsOf(tx.world().owed, row.actor),
        {
          ...row,
          to: Audience.Identity(),
          id: tx.mint<OwedId>("owed"),
          delivery: kept ? Delivery.Kept() : Delivery.Waiting(),
        },
      ]);
  };

  return { owe, tryOne, suspend, start, letGoKept, restore };
};

/**
 * The ledger's functions on one step.
 */
export type LedgerSteps = ReturnType<typeof makeLedger>;

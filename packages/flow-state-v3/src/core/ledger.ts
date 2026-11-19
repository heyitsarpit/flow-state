import { type Brand, Data, Option } from "effect";
import { Act } from "./evidence-of.ts";
import type { RecordedWhy } from "./evidence.ts";
import type { Persistence } from "./persist.ts";
import type { Tx } from "./tx.ts";
import type { Channel } from "./vocabulary.ts";
import { Life } from "./life.ts";
import {
  type ActorId,
  actorKey,
  byCodeUnits,
  type IncarnationId,
  Mail,
  OwnedBy,
  Phase,
} from "./world.ts";

/**
 * Who may hear an owed ending: any incarnation of the identity, or one incarnation alone.
 */
export type Audience = Data.TaggedEnum<{ Identity: {}; Life: { incarnation: IncarnationId } }>;

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
 * Where an owed ending's turn is routed from: the active leaf (current), or the activation that
 * owns the work, so the ending arrives late when that activation has been left.
 */
export type Route = Data.TaggedEnum<{ Current: {}; From: { owner: OwnedBy } }>;

/**
 * Constructors and matchers for {@link Route}.
 */
export const Route = Data.taggedEnum<Route>();

/**
 * Who made an owed row: an ending a call or a lane decided, the unknown { Restored } a start owes
 * for a Held head, or a row a boot read back from its record. Apart from the row's reason, so no
 * contract's own reason passes for Flow's.
 */
export type Origin = Data.TaggedEnum<{ Decided: {}; HeldAtStart: {}; ReadBack: {} }>;

/**
 * Constructors and matchers for {@link Origin}.
 */
export const Origin = Data.taggedEnum<Origin>();

/**
 * One owed ending: the only place an ending is held from its birth to its close.
 */
export type Owed = {
  readonly id: OwedId;
  readonly origin: Origin;
  readonly actor: ActorId;
  readonly to: Audience;
  readonly operation: string;
  readonly attempt: Option.Option<string>;
  readonly lane: Option.Option<string>;
  readonly channel: Channel;
  readonly reason: string;
  // FLOW_STATE_ALLOW_UNKNOWN: the ending's value is the commit's or lookup's own, mapped when heard.
  readonly value: unknown;
  readonly route: Route;
  readonly delivery: Delivery;
};

/**
 * How a row closes: heard by a turn, or recorded as evidence or let go.
 */
export type Closed = Data.TaggedEnum<{
  Delivered: {};
  Recorded: { why: RecordedWhy };
}>;

/**
 * Constructors and matchers for {@link Closed}.
 */
export const Closed = Data.taggedEnum<Closed>();

/**
 * Each identity's owed rows, in the order they were owed. Only this module writes one.
 */
export type Ledger = ReadonlyMap<string, ReadonlyArray<Owed>>;

/**
 * An identity's owed rows, in owed order.
 */
export const rowsOf = (ledger: Ledger, actor: ActorId) => ledger.get(actorKey(actor)) ?? [];

/**
 * Whether a row outlives the step that moves it, so the move writes its identity's owed record: it
 * waits, it is kept, or it is the unknown { Restored } a start owed for a Held head.
 */
const SAVED_DELIVERY = {
  Queued: false,
  Retrying: false,
  Waiting: true,
  Kept: true,
} as const satisfies Record<Delivery["_tag"], boolean>;

/**
 * Whether a row's try is in its identity's mailbox: Queued and Retrying rows.
 */
export const IN_MAILBOX = {
  Queued: true,
  Retrying: true,
  Waiting: false,
  Kept: false,
} as const satisfies Record<Delivery["_tag"], boolean>;

const SAVED_ORIGIN = {
  Decided: false,
  HeldAtStart: true,
  ReadBack: false,
} as const satisfies Record<Origin["_tag"], boolean>;

const isSaved = (row: Pick<Owed, "delivery" | "origin">) =>
  SAVED_DELIVERY[row.delivery._tag] || SAVED_ORIGIN[row.origin._tag];

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

  const started = new Map<string, ReadonlyArray<Owed>>();

  const setRows = (actor: ActorId, rows: ReadonlyArray<Owed>) => {
    if (!started.has(actorKey(actor))) started.set(actorKey(actor), rowsOf(tx.world().owed, actor));

    if (rows.length === 0) tx.drop("owed", actorKey(actor));
    else tx.put("owed", actorKey(actor), rows);
  };

  const find = (actor: ActorId, id: OwedId) =>
    Option.fromUndefinedOr(rowsOf(tx.world().owed, actor).find((r) => r.id === id));

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
    queue({ ...row, route: Route.Current() }, delivery);

  const live = (row: Pick<Owed, "actor" | "to">) => {
    const incarnation = incarnationOf(row.actor);

    return (
      Life.$is("Open")(tx.world().life) &&
      incarnation !== undefined &&
      Audience.$match(row.to, {
        Identity: () => true,
        Life: ({ incarnation: id }) => incarnation.id === id,
      })
    );
  };

  // A row that leaves the mailbox takes its references with it: the mail refers to exactly the
  // Queued and Retrying rows, each in its own identity's mailbox.
  const unreferenced = (row: Owed) => tx.unreference(row.actor, row.id);

  const recorded = (row: Owed, why: RecordedWhy) => tx.act(Act.RowRecorded({ row, why }));

  // A row the owed record held at the step's start: every row owed to the identity at a step's end
  // is in it, a row still in the mailbox included.
  const onRecord = (row: Owed) =>
    Audience.$is("Identity")(row.to) &&
    (started.get(actorKey(row.actor)) ?? rowsOf(tx.world().owed, row.actor)).some(
      (r) => r.id === row.id,
    );

  // A move into or out of the owed record writes it.
  const saved = (row: Owed, delivery: Delivery) => {
    if (isSaved(row) || isSaved({ ...row, delivery }) || onRecord(row))
      persistence.saveOwed(row.actor);
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
    tx.act(Act.RowWaits({ row }));
    saved(row, Delivery.Waiting());
  };

  /**
   * Owes an ending, already applied to its lane: Queued when its audience can hear it now,
   * Waiting when not; a row for an incarnation that is gone closes at once as evidence.
   */
  const owe = (
    ending: Omit<Owed, "id" | "delivery" | "origin">,
    origin: Origin = Origin.Decided(),
  ) => {
    const row: Owed = { ...ending, id: tx.mint("owed"), origin, delivery: Delivery.Queued() };
    setRows(row.actor, [...rowsOf(tx.world().owed, row.actor), row]);

    tx.act(Act.Ended({ actor: row.actor, ending: row }));

    if (live(row)) {
      tx.enqueue(Mail.Ending({ actor: row.actor, id: row.id }));
      saved(row, row.delivery);

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
  const tryOne = (actor: ActorId, id: OwedId, hear: (row: Owed) => Heard) => {
    const found = find(actor, id);

    if (Option.isNone(found)) return;

    const row = found.value;

    if (!IN_MAILBOX[row.delivery._tag]) return;

    const heard = hear(row);
    const now = find(actor, id);

    if (Option.isNone(now)) return;

    afterTry[heard](now.value);
  };

  // A refused try: a Queued row queues once more, Retrying; a Retrying one is Kept. A row out of
  // the mailbox was moved by the turn itself and stays as it is.
  const refused = (row: Owed) =>
    Delivery.$match(row.delivery, {
      Queued: () => queue(row, Delivery.Retrying()),
      Retrying: () => {
        replace(row, Option.some({ ...row, delivery: Delivery.Kept() }));
        saved(row, Delivery.Kept());
      },
      Waiting: () => undefined,
      Kept: () => undefined,
    });

  const afterTry = {
    Unmapped: (row) => close(row, Closed.Recorded({ why: "evidence" })),
    Heard: (row) => close(row, Closed.Delivered()),
    Refused: refused,
  } as const satisfies Record<Heard, (row: Owed) => void>;

  /**
   * An identity can no longer hear: its Queued and Retrying rows wait, lane or not, and rows owed
   * to one incarnation close as evidence. `forget` closes every row instead.
   */
  const forgotten = (row: Owed) =>
    close(row, Closed.Recorded({ why: Delivery.$is("Kept")(row.delivery) ? "letGo" : "evidence" }));

  const suspended = (row: Owed) =>
    Audience.$match(row.to, {
      Life: () => close(row, Closed.Recorded({ why: "evidence" })),
      Identity: () => (IN_MAILBOX[row.delivery._tag] ? wait(row) : undefined),
    });

  const suspend = (actor: ActorId, forget: boolean) => {
    for (const row of rowsOf(tx.world().owed, actor)) (forget ? forgotten : suspended)(row);
  };

  /**
   * The one delivery point of a start, whatever began it: the identity's lanes are adopted, so
   * their later endings are current; Waiting rows queue and Kept rows take their one try, in the
   * order owed; then each Held head with no row for its Attempt is owed unknown Restored, lane by
   * lane in lane-id order.
   */
  const start = (actor: ActorId) => {
    const lanes = tx.lanesOf(actor).toSorted(([a], [b]) => byCodeUnits(a, b));

    const owedAttempts = new Set(
      rowsOf(tx.world().owed, actor).flatMap((r) => Option.toArray(r.attempt)),
    );

    for (const [id, lane] of lanes)
      persistence.setLane(id, { ...lane, head: { ...lane.head, owner: OwnedBy.Root() } });

    // A row already in the mailbox keeps its try.
    for (const row of rowsOf(tx.world().owed, actor))
      Delivery.$match(row.delivery, {
        Waiting: () => {
          tx.act(Act.RowQueued({ row }));
          adopt(row, Delivery.Queued());
          saved(row, row.delivery);
        },
        Kept: () => {
          adopt(row, Delivery.Retrying());
          saved(row, row.delivery);
        },
        Queued: () => undefined,
        Retrying: () => undefined,
      });

    for (const [id, lane] of lanes)
      if (Phase.$is("Held")(lane.head.phase) && !owedAttempts.has(lane.head.id))
        owe(
          {
            actor,
            to: Audience.Identity(),
            operation: lane.operation,
            attempt: Option.some(lane.head.id),
            lane: Option.some(id),
            channel: "unknown",
            reason: "Restored",
            value: undefined,
            route: Route.Current(),
          },
          Origin.HeldAtStart(),
        );
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
    rows: ReadonlyArray<
      Omit<Owed, "id" | "delivery" | "to" | "origin"> & { readonly kept: boolean }
    >,
  ) => {
    for (const { kept, ...row } of rows)
      setRows(row.actor, [
        ...rowsOf(tx.world().owed, row.actor),
        {
          ...row,
          to: Audience.Identity(),
          id: tx.mint("owed"),
          origin: Origin.ReadBack(),
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

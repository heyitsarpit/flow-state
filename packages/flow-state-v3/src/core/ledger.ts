import { type Brand, Data, Option } from "effect";
import { Act } from "./evidence-of.ts";
import type { RecordedWhy } from "./evidence.ts";
import type { Persistence } from "./persist.ts";
import type { Tx } from "./tx.ts";
import type { Channel, IssueCode } from "./vocabulary.ts";
import { Life } from "./life.ts";
import type { Values } from "./compiled.ts";
import {
  type ActorId,
  actorKey,
  type AttemptId,
  byCodeUnits,
  type IncarnationId,
  type LaneId,
  Mail,
  OwnedBy,
} from "./world.ts";

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
 * Who made an owed row: an ending a call or a lane decided, a row a boot read back or derived
 * from its record, or a placement's `placeholder`, which is no landed data. Apart from the row's
 * reason, so no contract's own reason passes for Flow's.
 */
export type Origin = Data.TaggedEnum<{ Decided: {}; ReadBack: {}; Placeholder: {} }>;

/**
 * Constructors and matchers for {@link Origin}.
 */
export const Origin = Data.taggedEnum<Origin>();

/**
 * Why a row's last try was refused: the refusal's code and the callback slot that failed. It is
 * the cause of the row's issue, so the issue is shown exactly while the row holds it.
 */
export type Refusal = { readonly code: IssueCode; readonly slot: Option.Option<string> };

/**
 * One owed ending: the only place an ending is held from its birth to its close.
 *
 * **Details**
 *
 * `life` names the one incarnation a read's ending is owed to; none for a write's, which any
 * incarnation of the identity hears. `refusal` is written only by {@link makeLedger}'s `afterTry`
 * and never saved.
 */
export type Owed = {
  readonly id: OwedId;
  readonly origin: Origin;
  readonly actor: ActorId;
  readonly life: Option.Option<IncarnationId>;
  readonly operation: string;
  readonly attempt: Option.Option<AttemptId>;
  readonly lane: Option.Option<LaneId>;
  readonly channel: Channel;
  readonly reason: string;
  // FLOW_STATE_ALLOW_UNKNOWN: the ending's value is the commit's or lookup's own, mapped when heard.
  readonly value: unknown;
  readonly route: Route;
  readonly delivery: Delivery;
  // The input of the call it ends, which its mapper reads and its saved row keeps with its key.
  readonly input: Option.Option<Values>;
  readonly refusal: Option.Option<Refusal>;
};

/**
 * What a new row carries: everything but what the ledger writes itself.
 */
export type Ending = Omit<Owed, "id" | "delivery" | "origin" | "refusal">;

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
 * How a turn heard a row's try: with no mapping, heard (accepted, unhandled or denied), or refused
 * with its refusal.
 */
export type Heard = Data.TaggedEnum<{ Unmapped: {}; Heard: {}; Refused: { refusal: Refusal } }>;

/**
 * Constructors and matchers for {@link Heard}.
 */
export const Heard = Data.taggedEnum<Heard>();

/**
 * Each identity's owed rows, in the order they were owed. Only this module writes one.
 */
export type Ledger = ReadonlyMap<string, ReadonlyArray<Owed>>;

/**
 * An identity's owed rows, in owed order.
 */
export const rowsOf = (ledger: Ledger, actor: ActorId) => ledger.get(actorKey(actor)) ?? [];

/**
 * Whether a row's delivery outlives the step that moves it, so the move writes its identity's owed
 * record: it waits or it is kept.
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

const isSaved = (row: Pick<Owed, "delivery">) => SAVED_DELIVERY[row.delivery._tag];

/**
 * Whether a Kept row names a lane: the only read that blocks a key.
 */
export const keptOn = (ledger: Ledger, actor: ActorId, lane: LaneId) =>
  rowsOf(ledger, actor).some(
    (r) => Delivery.$is("Kept")(r.delivery) && Option.contains(r.lane, lane),
  );

/**
 * Whether a row is owed to its identity, whichever incarnation hears it, and not to one life.
 */
export const toIdentity = (row: Pick<Owed, "life">) => Option.isNone(row.life);

// An unknown row of an Attempt, whose final answer may still replace it.
const unknownOf = (rows: ReadonlyArray<Owed>, attempt: AttemptId) =>
  Option.fromUndefinedOr(
    rows.find((r) => r.channel === "unknown" && Option.contains(r.attempt, attempt)),
  );

/**
 * The ledger's functions on one step's working state: the only code that builds, moves or removes
 * a row.
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

  const live = (row: Pick<Owed, "actor" | "life">) => {
    const incarnation = incarnationOf(row.actor);

    return (
      Life.$is("Open")(tx.world().life) &&
      incarnation !== undefined &&
      Option.match(row.life, { onNone: () => true, onSome: (id) => incarnation.id === id })
    );
  };

  // A row that leaves the mailbox takes its references with it: the mail refers to exactly the
  // Queued and Retrying rows, each in its own identity's mailbox.
  const unreferenced = (row: Owed) => tx.unreference(row.actor, row.id);

  const recorded = (row: Owed, why: RecordedWhy) => tx.act(Act.RowRecorded({ row, why }));

  // A row the owed record held at the step's start: every row owed to the identity at a step's end
  // is in it, a row still in the mailbox included.
  const onRecord = (row: Owed) =>
    toIdentity(row) &&
    (started.get(actorKey(row.actor)) ?? rowsOf(tx.world().owed, row.actor)).some(
      (r) => r.id === row.id,
    );

  // A move into or out of the work record writes it.
  const saved = (row: Owed, delivery: Delivery) => {
    if (isSaved(row) || isSaved({ ...row, delivery }) || onRecord(row))
      persistence.saveWork(row.actor);
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

  const added = (ending: Ending, origin: Origin) => {
    const row: Owed = {
      ...ending,
      id: tx.mint("owed"),
      origin,
      delivery: Delivery.Queued(),
      refusal: Option.none(),
    };

    setRows(row.actor, [...rowsOf(tx.world().owed, row.actor), row]);
    tx.act(Act.Ended({ actor: row.actor, ending: row }));

    if (live(row)) {
      tx.enqueue(Mail.Ending({ actor: row.actor, id: row.id }));
      saved(row, row.delivery);

      return row.id;
    }

    if (Option.isSome(row.life)) close(row, Closed.Recorded({ why: "evidence" }));
    else wait(row);

    return row.id;
  };

  /**
   * Owes an ending, already applied to its lane: Queued when its audience can hear it now, Waiting
   * when not; a row for an incarnation that is gone closes at once as evidence. An Attempt has at
   * most one unheard unknown row: a second unknown adds nothing, and a final answer first closes
   * the unknown it replaces.
   */
  const owe = (ending: Ending, origin: Origin = Origin.Decided()) => {
    const unheard = Option.flatMap(ending.attempt, (attempt) =>
      unknownOf(rowsOf(tx.world().owed, ending.actor), attempt),
    );

    if (Option.isSome(unheard)) {
      if (ending.channel === "unknown") return unheard.value.id;
      close(unheard.value, Closed.Recorded({ why: "replaced" }));
    }

    return added(ending, origin);
  };

  /**
   * The row a mail reference may try: none when it is gone or not in the mailbox.
   */
  const tried = (actor: ActorId, id: OwedId) =>
    Option.filter(find(actor, id), (row) => IN_MAILBOX[row.delivery._tag]);

  // A refused try: a Queued row queues once more, Retrying; a Retrying one is Kept. Either holds
  // its refusal until it closes.
  const refused = (row: Owed, refusal: Refusal) =>
    Delivery.$match(row.delivery, {
      Queued: () => queue({ ...row, refusal: Option.some(refusal) }, Delivery.Retrying()),
      Retrying: () => {
        replace(
          row,
          Option.some({ ...row, refusal: Option.some(refusal), delivery: Delivery.Kept() }),
        );
        saved(row, Delivery.Kept());
      },
      Waiting: () => undefined,
      Kept: () => undefined,
    });

  /**
   * A row's move after its try, by how its turn heard it: unmapped closes as evidence, heard closes
   * delivered, refused queues a Queued row once more and keeps a Retrying one. A row the turn
   * itself moved out of the mailbox, or closed, stays as it is.
   */
  const afterTry = (id: OwedId, actor: ActorId, heard: Heard) =>
    Option.match(tried(actor, id), {
      onNone: () => undefined,
      onSome: (row) =>
        Heard.$match(heard, {
          Unmapped: () => close(row, Closed.Recorded({ why: "evidence" })),
          Heard: () => close(row, Closed.Delivered()),
          Refused: ({ refusal }) => refused(row, refusal),
        }),
    });

  /**
   * An identity can no longer hear: its Queued and Retrying rows wait, lane or not, and rows owed
   * to one incarnation close as evidence. `forget` closes every row instead.
   */
  const forgotten = (row: Owed) =>
    close(row, Closed.Recorded({ why: Delivery.$is("Kept")(row.delivery) ? "letGo" : "evidence" }));

  const suspended = (row: Owed) => {
    if (Option.isSome(row.life)) close(row, Closed.Recorded({ why: "evidence" }));
    else if (IN_MAILBOX[row.delivery._tag]) wait(row);
  };

  const suspend = (actor: ActorId, forget: boolean) => {
    for (const row of rowsOf(tx.world().owed, actor)) (forget ? forgotten : suspended)(row);
  };

  /**
   * The one delivery point of a start, whatever began it: the identity's lanes are adopted, so
   * their later endings are current; Waiting rows queue and Kept rows take their one try, in the
   * order owed. A Held head owes nothing of its own: the boot derived what a restored one owes.
   */
  const start = (actor: ActorId) => {
    const lanes = tx.lanesOf(actor).toSorted(([a], [b]) => byCodeUnits(a, b));

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
  };

  /**
   * Lets a lane's Kept rows go, as a cancel on its Idle lane does.
   */
  const letGoKept = (actor: ActorId, lane: LaneId) => {
    for (const row of rowsOf(tx.world().owed, actor))
      if (Delivery.$is("Kept")(row.delivery) && Option.contains(row.lane, lane))
        close(row, Closed.Recorded({ why: "letGo" }));
  };

  /**
   * Rows a boot decoded or derived, owed to their identity: Waiting, or Kept, with no report; their
   * start delivers them. A derived row is an ending owed now, so it is recorded Ended, and waiting.
   */
  const restore = (
    rows: ReadonlyArray<{
      readonly row: Omit<Ending, "life"> & { readonly kept: boolean };
      readonly derived: boolean;
    }>,
  ) => {
    for (const {
      row: { kept, ...ending },
      derived,
    } of rows) {
      const row: Owed = {
        ...ending,
        life: Option.none(),
        id: tx.mint("owed"),
        origin: Origin.ReadBack(),
        delivery: kept ? Delivery.Kept() : Delivery.Waiting(),
        refusal: Option.none(),
      };

      setRows(row.actor, [...rowsOf(tx.world().owed, row.actor), row]);

      if (derived) {
        tx.act(Act.Ended({ actor: row.actor, ending: row }));
        tx.act(Act.RowWaits({ row }));
      }
    }
  };

  return { owe, tried, afterTry, suspend, start, letGoKept, restore };
};

/**
 * The ledger's functions on one step.
 */
export type LedgerSteps = ReturnType<typeof makeLedger>;

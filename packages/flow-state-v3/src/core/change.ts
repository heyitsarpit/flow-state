import { Data, Option } from "effect";
import type { Values } from "./compiled.ts";
import type { Read } from "./context.ts";
import { defect } from "./defect.ts";
import type { Why } from "./evidence.ts";
import type { Owed } from "./ledger.ts";
import type { Firing } from "./schedule-decision.ts";
import type { Failure } from "./timers.ts";
import { routeOf, type Trigger } from "./trigger.ts";
import type { Turn } from "./walk.ts";
import type { ActorId, ActorRecord, StoredSource, Wiring } from "./world.ts";

/**
 * Where an incarnation's `Begin` starts from: a fresh input, or the record an end kept.
 */
export type Origin = Data.TaggedEnum<{
  Fresh: { input: Values };
  Restored: { record: ActorRecord };
}>;

/**
 * Constructors and matchers for {@link Origin}.
 */
export const Origin = Data.taggedEnum<Origin>();

/**
 * How an actor ends: its grace passed, disposed, forgotten, or the Runtime's disposal ended.
 */
export type How = Data.TaggedEnum<{ Grace: {}; Disposed: {}; Forgotten: {}; RuntimeDisposed: {} }>;

/**
 * Constructors and matchers for {@link How}.
 */
export const How = Data.taggedEnum<How>();

/**
 * What an actor's end does, by how: whether its incarnation is dropped and its record kept, what
 * its owed rows do (wait for the next start, close, or stay as the disposal left them), whether
 * its providers are released, and whether its mailbox is dropped.
 */
export const ENDS = {
  Grace: { drops: true, keepsRecord: true, rows: "wait", releases: true, dropsMail: false },
  Disposed: { drops: true, keepsRecord: false, rows: "wait", releases: true, dropsMail: true },
  Forgotten: { drops: true, keepsRecord: false, rows: "close", releases: true, dropsMail: true },
  RuntimeDisposed: {
    drops: false,
    keepsRecord: false,
    rows: "kept",
    releases: false,
    dropsMail: false,
  },
} as const satisfies Record<
  How["_tag"],
  {
    readonly drops: boolean;
    readonly keepsRecord: boolean;
    readonly rows: "wait" | "close" | "kept";
    readonly releases: boolean;
    readonly dropsMail: boolean;
  }
>;

/**
 * Every change to an actor, as one value: the only input of {@link makeApply}'s `apply`.
 *
 * **Details**
 *
 * - `Begin`: an incarnation starts, fresh or from its record, bound to its providers.
 * - `Turn`: an accepted turn's one record, with its trigger.
 * - `Refused`: a turn refused before commit: its source's issue; an ending's row when it was one.
 * - `Unturned`: an ending's turn that ran nothing (denied or unhandled).
 * - `Inputs`: a context update's read.
 * - `Lanes`: the actor's lanes moved outside a turn.
 * - `Settled`: a firing whose send did not commit, with its refusal when it was refused.
 * - `Use`: the actor's first use returned, or its last one was released.
 * - `End`: the actor's live incarnation ends, by `how`.
 */
export type Change = Data.TaggedEnum<{
  Begin: {
    actor: ActorId;
    origin: Origin;
    wiring: ReadonlyMap<string, ActorId>;
    graph: Option.Option<Wiring>;
  };
  Turn: { turn: Turn; trigger: Trigger };
  Refused: { source: StoredSource; failure: Failure; ending: Option.Option<Owed> };
  Unturned: { row: Owed };
  Inputs: { read: Read };
  Lanes: {};
  Settled: { firing: Firing; refusal: Option.Option<Failure> };
  Use: { returned: boolean };
  End: { how: How };
}>;

/**
 * Constructors and matchers for {@link Change}.
 */
export const Change = Data.taggedEnum<Change>();

/**
 * Why a change publishes, by its tag alone: none for a change that publishes nothing (a lane move,
 * whose snapshot the next publication shows, and an end, which `Finished` stands for).
 */
export const whyOf = (change: Change) =>
  Change.$match(change, {
    Begin: () => Option.some<Why>("Begin"),
    Turn: () => Option.some<Why>("Turn"),
    Refused: () => Option.some<Why>("Other"),
    Unturned: () => Option.some<Why>("Other"),
    Inputs: () => Option.some<Why>("Other"),
    Lanes: () => Option.none<Why>(),
    Settled: () => Option.some<Why>("Other"),
    Use: () => Option.some<Why>("Other"),
    End: () => Option.none<Why>(),
  });

/**
 * Whether a change publishes whatever it changed: a start, a turn, a refusal and an unturned
 * ending always do; any other publishing change only once it changed what a snapshot shows.
 */
export const publishesAlways = (change: Change) =>
  Change.$match(change, {
    Begin: () => true,
    Turn: () => true,
    Refused: () => true,
    Unturned: () => true,
    Inputs: () => false,
    Lanes: () => false,
    Settled: () => false,
    Use: () => false,
    End: () => false,
  });

/**
 * The change a refusal before commit is: a firing's is its schedule's `Settled`; any other's is
 * its source's `Refused`.
 */
export const refusalOf = (trigger: Trigger, failure: Failure) => {
  const route = routeOf(trigger);

  return Option.match(route.firing, {
    onSome: (firing) => Change.Settled({ firing, refusal: Option.some(failure) }),
    onNone: () =>
      Change.Refused({
        source: Option.getOrElse(route.source, () => defect("a refusal with no source")),
        failure,
        ending: route.ending,
      }),
  });
};

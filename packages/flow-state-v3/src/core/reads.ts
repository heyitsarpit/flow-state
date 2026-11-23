import { Option } from "effect";
import type { ScheduleInput, Values } from "./compiled.ts";
import type { TimerKey } from "./timers.ts";
import type { Incarnation } from "./world.ts";

/**
 * What a scope is read as: its active leaf, its memory and its context slots' values. The before
 * view of a turn is the pre-turn scope; the after view has the turn's memory; the committed view
 * is the incarnation's.
 */
export type Scope = { readonly state: string; readonly memory: Values; readonly context: Values };

/**
 * What each callback reads beyond its scope.
 *
 * **Details**
 *
 * - `Guard`: a guard or a key select inside it reads the before view and the event, no time.
 * - `Patch`: `updateMemory` reads the before view, the event and the turn's time.
 * - `Select`: an action's select, member key or send reads the after view and the event.
 * - `Schedule`: a delay, `keys`, a pause reason or `restartOn` reads the committed view (a turn's
 *   own arm, the after view), its timer's key, the lanes' rows and the time.
 * - `Reaction`: a context reaction's `when` reads the consumer's memory.
 * - `Place`: a placement's select reads the committed view's memory and context.
 */
export type Extras = {
  readonly Guard: { readonly event: Values };
  readonly Patch: { readonly event: Values; readonly now: number };
  readonly Select: { readonly event: Values };
  readonly Schedule: {
    readonly key: Option.Option<TimerKey>;
    readonly operations: ScheduleInput["operations"];
    readonly now: number;
  };
  readonly Reaction: Record<string, never>;
  readonly Place: Record<string, never>;
};

type Reads = {
  readonly Guard: {
    readonly state: string;
    readonly memory: Values;
    readonly context: Values;
    readonly event: Values;
  };
  readonly Patch: {
    readonly memory: Values;
    readonly context: Values;
    readonly event: Values;
    readonly now: number;
  };
  readonly Select: { readonly memory: Values; readonly event: Values };
  readonly Schedule: ScheduleInput;
  readonly Reaction: { readonly memory: Values };
  readonly Place: { readonly memory: Values; readonly context: Values };
};

const builders: { readonly [K in keyof Extras]: (scope: Scope, extra: Extras[K]) => Reads[K] } = {
  Guard: (scope, { event }) => ({
    state: scope.state,
    memory: scope.memory,
    context: scope.context,
    event,
  }),
  Patch: (scope, { event, now }) => ({ memory: scope.memory, context: scope.context, event, now }),
  Select: (scope, { event }) => ({ memory: scope.memory, event }),
  Schedule: (scope, { key, operations, now }) => ({
    key: Option.getOrUndefined(Option.map(key, (k) => k.value)),
    memory: scope.memory,
    context: scope.context,
    operations,
    now,
  }),
  Reaction: (scope) => ({ memory: scope.memory }),
  Place: (scope) => ({ memory: scope.memory, context: scope.context }),
};

/**
 * The scope an incarnation's committed view reads.
 */
export const scopeOf = (incarnation: Incarnation) => ({
  state: incarnation.state,
  memory: incarnation.memory,
  context: Object.fromEntries([...incarnation.context].map(([slot, s]) => [slot, s.value])),
});

/**
 * The input of a user callback: the one builder of every record a callback reads, by the
 * callback's kind, so two callbacks of one view never read two shapes of one fact.
 */
export const readsOf = <K extends keyof Extras>(scope: Scope, callback: K, extra: Extras[K]) =>
  builders[callback](scope, extra);

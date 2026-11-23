import { Data, Option, Result } from "effect";
import type { ActivationId } from "./world.ts";
import type { Alternative, Compiled, Schedule, Series, Values } from "./compiled.ts";
import type { Part } from "./evidence.ts";
import { readsOf } from "./reads.ts";
import type { Move } from "./tree.ts";
import {
  type Arming,
  firstDecline,
  moveFor,
  recordFrom,
  type LaneView,
  resolve,
  Resolved,
  unchanged,
  Verdict,
  writable,
} from "./turn.ts";
import { armingsOf, disarmedBy } from "./turn-arms.ts";
import type { RefusedCode } from "./vocabulary.ts";

/**
 * Why a part ran: the turn's source. (Raises, notifies, exits and abandoned callbacks join the
 * walk with fragments.)
 */
export type PartCause = Data.TaggedEnum<{ Source: {} }>;

/**
 * Constructors and matchers for {@link PartCause}.
 */
export const PartCause = Data.taggedEnum<PartCause>();

/**
 * One alternative a turn ran in one scope: where it was written, why it ran, the event it heard,
 * its patch (none when it wrote nothing) and its actions resolved on the after view.
 */
export type PartRun = {
  readonly part: Part;
  readonly handler: string;
  readonly cause: PartCause;
  readonly event: { readonly tag: string; readonly payload: Values };
  readonly patch: Option.Option<Values>;
  readonly actions: ReadonlyArray<Resolved>;
};

/**
 * The schedule work of one scope a turn touched: the state it names (none for the root), the
 * schedules its event disarms, and those it arms with their first steps.
 */
export type ScopeWork = {
  readonly path: Option.Option<string>;
  readonly disarmed: ReadonlyArray<string>;
  readonly started: ReadonlyArray<Arming>;
};

/**
 * What one accepted turn decided, the one record of it: the parts in walk order (the source
 * first), the one changer's move, the memory after every patch, and the schedule work per scope.
 * It holds no id: `apply` mints them.
 */
export type Turn = {
  readonly parts: ReadonlyArray<PartRun>;
  readonly move: Option.Option<Move>;
  readonly memory: Values;
  readonly work: ReadonlyArray<ScopeWork>;
};

/**
 * What a turn decided.
 *
 * **Details**
 *
 * - `Accepted`: the walk's one {@link Turn}.
 * - `Denied`: handlers existed and all declined, with each decline's code.
 * - `Unhandled`: no handler.
 * - `Refused`: the turn is invalid or a callback failed before commit; nothing of it applies.
 */
export type TurnResult = Data.TaggedEnum<{
  Accepted: { turn: Turn };
  Denied: { reasons: ReadonlyArray<string> };
  Unhandled: {};
  Refused: { code: RefusedCode; slot: string };
}>;

/**
 * Constructors and matchers for {@link TurnResult}.
 */
export const TurnResult = Data.taggedEnum<TurnResult>();

/**
 * Everything a turn reads: the pre-turn state and memory, the event, the route, the
 * turn's time and the lanes with its own ending admitted.
 *
 * **Details**
 *
 * - `state`: the active leaf's path; `activations` numbers each state on its chain, outermost
 *   first; `history` holds each compound's last active child; `context` its slots' values.
 * - `late`: the event is a late ending, routed from `from`, the depth of the owner's nearest
 *   surviving ancestor (0 for the root); a current event is routed from the leaf.
 * - `lane(operation, key)`: a lane's view; a `None` key names the ending's own lane.
 * - `owns(activation)`: that activation owns an InFlight head, so a late turn may not exit it.
 */
export type TurnInput = {
  readonly compiled: Compiled;
  readonly state: string;
  readonly activations: ReadonlyArray<ActivationId>;
  readonly history: ReadonlyMap<string, string>;
  readonly memory: Values;
  readonly context: Values;
  readonly tag: string;
  readonly payload: Values;
  readonly late: boolean;
  // Whether the turn's source cannot send it again (an operation's outcome, an actor's send, a
  // context reaction): it commits whatever its own arms do.
  readonly unrepeatable: boolean;
  readonly from: number;
  readonly now: number;
  readonly lane: (operation: string, key: Option.Option<Values>) => LaneView;
  readonly owns: (activation: ActivationId) => boolean;
  readonly step: (
    name: string,
    series: Series,
    attempt: number,
  ) => Option.Option<{
    readonly ms: number;
    // FLOW_STATE_ALLOW_UNKNOWN: an Effect Schedule step's output, whatever its type.
    readonly output: unknown;
  }>;
};

const NO_SCHEDULES: ReadonlyArray<Schedule> = [];

type Visited = { readonly run: PartRun; readonly alternative: Alternative };

type Walk = Data.TaggedEnum<{
  Walking: {
    parts: ReadonlyArray<Visited>;
    changer: Option.Option<Visited>;
    memory: Values;
  };
  Refused: { code: RefusedCode; slot: string };
}>;

const Walk = Data.taggedEnum<Walk>();

// One part joins the walk: its patch read on the before view (a patch that throws or is no record
// is a defect; one naming a field the machine may not write refuses), and its target, which makes
// its site the changer unless another site is.
// RETURN_TYPE: each branch builds one Walk variant; the union is the contract.
const visit = (walk: Walk, alternative: Alternative, handler: string, input: TurnInput): Walk =>
  Walk.$match(walk, {
    Refused: () => walk,
    Walking: ({ parts, changer, memory }) => {
      const site = alternative.at;
      const event = { tag: input.tag, payload: input.payload };

      const another = Option.exists(changer, (c) => c.alternative.at !== site);

      if (Option.isSome(alternative.target) && another)
        return Walk.Refused({ code: "InvalidTurn", slot: site });

      const patch = Option.match(alternative.update, {
        onNone: () => Result.succeed(Option.none<Values>()),
        onSome: (update) => {
          const written = recordFrom(
            update,
            readsOf(input, "Patch", { event: input.payload, now: input.now }),
          );

          if (Result.isFailure(written))
            return Result.fail(Walk.Refused({ code: "Defect", ...written.failure }));

          if (!writable(input.compiled, written.success))
            return Result.fail(Walk.Refused({ code: "InvalidTurn", slot: update.slot }));

          return Result.succeed(Option.some(written.success));
        },
      });

      if (Result.isFailure(patch)) return patch.failure;

      // oxlint-disable-next-line lint-bomb/no-allocation-in-loop -- one part per visit: the turn's record
      const run: PartRun = {
        part: {
          at: alternative.at,
          node: handler === "" ? "root" : handler,
          target: Option.match(moveFor(alternative, handler, input), {
            onNone: () => "self",
            onSome: (m) => m.target,
          }),
        },
        handler,
        cause: PartCause.Source(),
        event,
        patch: patch.success,
        actions: [],
      };

      const after = Option.match(patch.success, {
        onNone: () => memory,
        onSome: (written) =>
          // oxlint-disable-next-line lint-bomb/no-allocation-in-loop -- the after memory: one patch, merged once
          unchanged(written, memory) ? memory : { ...memory, ...written },
      });

      const visited = { run, alternative };

      return Walk.Walking({
        parts: [...parts, visited],
        changer: Option.isSome(alternative.target) ? Option.some(visited) : changer,
        memory: after,
      });
    },
  });

// After the walk, on the after view: each part's actions resolved, and the scope's schedule work,
// read on the leaf the changer's move reaches. A turn's own arm with a bad delay refuses the turn,
// but a turn its source cannot send again (an operation's outcome, an actor's send, a context
// reaction) commits with that start refused.
// RETURN_TYPE: each branch builds one TurnResult variant; the union is the contract.
const settled = (walk: Walk, input: TurnInput): TurnResult =>
  Walk.$match(walk, {
    Refused: ({ code, slot }) => TurnResult.Refused({ code, slot }),
    Walking: ({ parts, changer, memory }) => {
      const after = { ...input, memory };
      const select = readsOf(after, "Select", { event: input.payload });
      const resolved: Array<PartRun> = [];

      for (const { run, alternative } of parts) {
        const actions: Array<Resolved> = [];

        for (const action of alternative.actions) {
          const one = resolve(action, select);

          if (Result.isFailure(one))
            // oxlint-disable-next-line lint-bomb/no-allocation-in-loop -- the refusal is the turn's one result; the loop ends here
            return TurnResult.Refused({ code: "InvalidTurn", slot: one.failure.slot });
          actions.push(one.success);
        }

        // oxlint-disable-next-line lint-bomb/no-allocation-in-loop -- one resolved part per part: the turn's record
        resolved.push({ ...run, actions });
      }

      const move = Option.flatMap(changer, (c) => moveFor(c.alternative, c.run.handler, input));
      const leaf = Option.match(move, { onNone: () => input.state, onSome: (m) => m.leaf });
      const entered = new Set(Option.match(move, { onNone: () => [], onSome: (m) => m.enters }));
      const handler = parts[0]?.run.handler ?? "";

      const started = armingsOf(
        input.compiled,
        leaf,
        entered,
        input.tag,
        { ...after, state: leaf },
        input.now,
        input.step,
      );

      const first = Option.flatMap(
        Option.fromUndefinedOr(started.find((a) => Result.isFailure(a.first))),
        (a) => Result.getFailure(a.first),
      );

      if (Option.isSome(first) && !input.unrepeatable)
        return TurnResult.Refused({ code: "InvalidTurn", slot: first.value });

      return TurnResult.Accepted({
        turn: {
          parts: resolved,
          move,
          memory,
          work: [
            {
              path: handler === "" ? Option.none() : Option.some(handler),
              disarmed: disarmedBy(input.compiled, leaf, input.tag),
              started,
            },
          ],
        },
      });
    },
  });

// The source's part and everything it reaches, then the after view.
const accept = (alternative: Alternative, handler: string, input: TurnInput) =>
  settled(
    visit(
      Walk.Walking({ parts: [], changer: Option.none(), memory: input.memory }),
      alternative,
      handler,
      input,
    ),
    input,
  );

const lists = (input: TurnInput, path: string) => {
  for (const schedule of input.compiled.states.get(path)?.schedules ?? NO_SCHEDULES)
    if (schedule.armOn.includes(input.tag) || schedule.disarmOn.includes(input.tag)) return true;

  return false;
};

// The implicit "self" of the deepest state on the route whose schedule lists the event in armOn
// or disarmOn.
const implicit = (input: TurnInput) => {
  let node = "";

  for (const path of (input.compiled.states.get(input.state)?.chain ?? []).slice(0, input.from))
    if (lists(input, path)) node = path;

  if (node === "") return Option.none();

  const alternative: Alternative = {
    at: `trigger:${node}:${input.tag}`,
    target: Option.none(),
    guards: [],
    update: Option.none(),
    actions: [],
  };

  return Option.some({ node, alternatives: [alternative] });
};

const EMPTY: ReadonlyArray<Alternative> = [];

// Each level from the routed state up to the root, with its written alternatives for the event.
const levelsOf = (input: TurnInput) => {
  const chain = (input.compiled.states.get(input.state)?.chain ?? []).slice(0, input.from);

  const levels: Array<{
    readonly node: string;
    readonly alternatives: ReadonlyArray<Alternative>;
  }> = [];

  let written = false;

  for (let i = chain.length; i >= 0; i -= 1) {
    const node = i === 0 ? "" : (chain[i - 1] ?? "");
    const level = i === 0 ? input.compiled.root : input.compiled.states.get(node)?.on;
    const alternatives = level?.get(input.tag) ?? EMPTY;

    written ||= alternatives.length > 0;
    // oxlint-disable-next-line lint-bomb/no-allocation-in-loop -- one entry per level of the chain: the turn's route
    levels.push({ node, alternatives });
  }

  return written ? levels : Option.toArray(implicit(input));
};

const resultOf = (
  verdict: Verdict,
  alternative: Alternative,
  handler: string,
  input: TurnInput,
  reasons: Array<string>,
) =>
  Verdict.$match(verdict, {
    Pass: () => Option.some(accept(alternative, handler, input)),
    Defect: ({ slot }) => Option.some(TurnResult.Refused({ code: "GuardDefect", slot })),
    Declined: ({ code }) => {
      reasons.push(code);

      return Option.none<TurnResult>();
    },
  });

/**
 * Runs one admitted event against a machine's handlers.
 *
 * **Details**
 *
 * The active leaf's level is tried first, then each ancestor's, then the root's; a late ending
 * starts at the owner's nearest surviving ancestor. At each level the first alternative whose
 * guards all pass wins. When no level handles the event and an active state's schedule lists it
 * in `armOn` or `disarmOn`, that state handles it with an unguarded "self". A guard, update, select or schedule
 * callback that throws, or an invalid delay, refuses the whole turn.
 */
// RETURN_TYPE: each branch builds one TurnResult variant; the union is the contract.
export const runTurn = (input: TurnInput): TurnResult => {
  const levels = levelsOf(input);

  const reasons: Array<string> = [];
  const read = readsOf(input, "Guard", { event: input.payload });

  for (const level of levels)
    for (const alternative of level.alternatives) {
      const verdict = firstDecline(alternative, level.node, input, read);
      const ended = resultOf(verdict, alternative, level.node, input, reasons);

      if (Option.isSome(ended)) return ended.value;
    }

  return reasons.length > 0 ? TurnResult.Denied({ reasons }) : TurnResult.Unhandled();
};

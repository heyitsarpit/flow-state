import { Data, Option } from "effect";
import type { Values } from "./compiled.ts";
import { type Channel, isDecline } from "./vocabulary.ts";
import { type CallId, type Ending, type Head, Phase, type TicketId } from "./world.ts";

/**
 * What happens to a lane: a member, a turn's end, a store's or a call's answer, an admitted or
 * kept ending, or the Runtime's disposal.
 *
 * **Details**
 *
 * `CommitReject` and `CommitCancel` are a commit under each concurrency policy; this build runs
 * reject only. `Settled` is a call's classified result, queued as mail or, during disposal,
 * parked. `Ended` is that ending admitted to its lane in its turn.
 */
export type Cue = Data.TaggedEnum<{
  CommitReject: { input: Values; owner: number };
  CommitCancel: { input: Values; owner: number };
  Retry: { owner: number };
  Cancel: {};
  TurnEnded: {};
  Stored: {};
  Refused: {};
  // FLOW_STATE_ALLOW_UNKNOWN: a call's value is the contract's own, mapped at admission.
  Settled: { channel: Channel; reason: string; value: unknown; route: "queue" | "park" };
  Ended: { channel: Channel; reason: string };
  Keep: { ending: Ending };
  DisposalStarts: {};
  BoundPassed: {};
}>;

/**
 * Constructors and matchers for {@link Cue}.
 */
export const Cue = Data.taggedEnum<Cue>();

/**
 * Why a never-sent Attempt ends `NotSent`.
 */
export type NotSentWhy = "Rejected" | "Cancelled" | "StorageRefused" | "Disposed";

/**
 * What a cell decides, as data; the step applies it.
 *
 * **Details**
 *
 * - `Mint`: a new head, `Unsent`, for the commit's input and owning activation.
 * - `Decline`: the commit ends `NotSent` and mints nothing.
 * - `Become`: the head moves to a phase it already has the fields for.
 * - `Owe`: a retry owes the head's re-send.
 * - `Withdraw`: a cancel waits for the acknowledgement's storage.
 * - `EndUnsent`: the never-sent head ends `NotSent` and the lane drops.
 * - `Release`: the head is let go, as evidence, and the lane drops.
 * - `LetGo`: the kept ending is let go.
 * - `Interrupt`: the call is interrupted; the head is `Cancelling`.
 * - `Flush`: the turn ended; the head is acknowledged or captured, or invoked when nothing persists.
 * - `Send`, `Resend`: the head is invoked, a re-send counting one more.
 * - `HoldRefused`: a refused capture holds the head and ends it unknown `StorageRefused`.
 * - `Queue`, `Park`: a call's ending goes to the mailbox, or is parked during disposal as its
 *   Attempt delivers it.
 * - `Resolve`, `Hold`: an admitted ending drops the lane, or holds it, as `reason`.
 * - `Keep`: a twice-refused ending is kept on its lane.
 * - `Impossible`: a pair the table rules out, or leaves open; a defect in Flow.
 */
export type Move = Data.TaggedEnum<{
  Stay: {};
  Mint: { input: Values; owner: number };
  Decline: { why: NotSentWhy; owner: number };
  Become: { phase: Phase };
  Owe: { owner: number };
  Withdraw: { ticket: TicketId };
  EndUnsent: { why: NotSentWhy };
  Release: {};
  LetGo: {};
  Interrupt: { call: CallId };
  Flush: { purpose: "acknowledge" | "capture" };
  Send: {};
  Resend: {};
  HoldRefused: {};
  // FLOW_STATE_ALLOW_UNKNOWN: a call's value is the contract's own, mapped at admission.
  Queue: { channel: Channel; reason: string; value: unknown };
  // FLOW_STATE_ALLOW_UNKNOWN: a call's value is the contract's own, mapped at admission.
  Park: { channel: Channel; reason: string; value: unknown; interrupt: Option.Option<CallId> };
  Resolve: {};
  Hold: { reason: string };
  Keep: { ending: Ending };
  Impossible: {};
}>;

/**
 * Constructors and matchers for {@link Move}.
 */
export const Move = Data.taggedEnum<Move>();

/**
 * The move of a pair the table rules out or leaves open.
 */
export type Impossible = Data.TaggedEnum.Value<Move, "Impossible">;

type CueOf<C extends Cue["_tag"]> = Data.TaggedEnum.Value<Cue, C>;

/**
 * A head in one phase.
 */
export type HeadAt<P extends Phase["_tag"]> = Head & {
  readonly phase: Data.TaggedEnum.Value<Phase, P>;
};

type Row<C extends Cue["_tag"]> = {
  readonly Idle: (cue: CueOf<C>) => Move;
  readonly Kept: (cue: CueOf<C>) => Move;
} & { readonly [P in Phase["_tag"]]: (head: HeadAt<P>, cue: CueOf<C>) => Move };

/**
 * The write lane's table: one cell per cue and lane state, total by its type.
 */
export type Table = { readonly [C in Cue["_tag"]]: Row<C> };

// RETURN_TYPE: the open and ruled-out cells are typed Impossible, so a check can name them.
const impossible = (): Impossible => Move.Impossible();
const stay = () => Move.Stay();
const decline = (cue: CueOf<"CommitReject">) => Move.Decline({ why: "Rejected", owner: cue.owner });

const declineBeside = (_head: Head, cue: CueOf<"CommitReject">) => decline(cue);

// How the head's Attempt delivers an ending: a definite failure after an earlier unknown send of
// the same Attempt is unknown StillUnknown.
const delivered = (head: Head, channel: Channel, reason: string) => {
  const still: Channel = "unknown";

  return channel === "failure" && head.mayHaveApplied && !isDecline(reason)
    ? { channel: still, reason: "StillUnknown" }
    : { channel, reason };
};

// An admitted ending of the head: an unknown, or a definite failure it delivers as unknown, holds
// the lane; any other ending resolves it.
const admitted = (head: Head, cue: CueOf<"Ended">) => {
  const ending = delivered(head, cue.channel, cue.reason);

  return ending.channel === "unknown" ? Move.Hold({ reason: ending.reason }) : Move.Resolve();
};

// A call's result, classified by the phase it found: a call a cancel interrupted ends unknown
// Cancelled whatever it returned. During disposal it is parked as its Attempt delivers it.
const settled = (head: Head, cue: CueOf<"Settled">, cancelled: boolean) => {
  const channel: Channel = cancelled ? "unknown" : cue.channel;
  const reason = cancelled ? "Cancelled" : cue.reason;

  return cue.route === "queue"
    ? Move.Queue({ channel, reason, value: cue.value })
    : Move.Park({
        ...delivered(head, channel, reason),
        value: cue.value,
        interrupt: Option.none(),
      });
};

const disposedOnWire = (head: HeadAt<"OnWire" | "Cancelling">) =>
  Move.Park({
    channel: "unknown",
    reason: "Disposed",
    value: undefined,
    interrupt: Option.some(head.phase.call),
  });

const keep = (cue: CueOf<"Keep">) => Move.Keep({ ending: cue.ending });

const keepBeside = (_head: Head, cue: CueOf<"Keep">) => keep(cue);

/**
 * Every cell of the write lane, by cue and lane state. Only reject concurrency is built; a
 * cancel-policy commit, and a kept ending on a Held head, are `Impossible` until their rulings.
 */
export const table = {
  CommitReject: {
    Idle: (cue) => Move.Mint({ input: cue.input, owner: cue.owner }),
    Kept: decline,
    Acknowledging: declineBeside,
    Unsent: declineBeside,
    Withdrawing: declineBeside,
    Recapturing: declineBeside,
    Resending: declineBeside,
    OnWire: declineBeside,
    Cancelling: declineBeside,
    Held: declineBeside,
  },
  CommitCancel: {
    Idle: impossible,
    Kept: impossible,
    Acknowledging: impossible,
    Unsent: impossible,
    Withdrawing: impossible,
    Recapturing: impossible,
    Resending: impossible,
    OnWire: impossible,
    Cancelling: impossible,
    Held: impossible,
  },
  Retry: {
    Idle: stay,
    Kept: stay,
    Acknowledging: stay,
    Unsent: stay,
    Withdrawing: stay,
    Recapturing: stay,
    Resending: stay,
    OnWire: stay,
    Cancelling: stay,
    Held: (_head, cue) => Move.Owe({ owner: cue.owner }),
  },
  Cancel: {
    Idle: stay,
    Kept: () => Move.LetGo(),
    Acknowledging: (head) => Move.Withdraw({ ticket: head.phase.ticket }),
    Unsent: () => Move.EndUnsent({ why: "Cancelled" }),
    Withdrawing: stay,
    Recapturing: () => Move.Release(),
    Resending: () => Move.Release(),
    OnWire: (head) => Move.Interrupt({ call: head.phase.call }),
    Cancelling: stay,
    Held: () => Move.Release(),
  },
  TurnEnded: {
    Idle: stay,
    Kept: stay,
    Acknowledging: stay,
    Unsent: () => Move.Flush({ purpose: "acknowledge" }),
    Withdrawing: stay,
    Recapturing: stay,
    Resending: () => Move.Flush({ purpose: "capture" }),
    OnWire: stay,
    Cancelling: stay,
    Held: stay,
  },
  Stored: {
    Idle: impossible,
    Kept: impossible,
    Acknowledging: () => Move.Send(),
    Unsent: impossible,
    Withdrawing: () => Move.EndUnsent({ why: "Cancelled" }),
    Recapturing: () => Move.Resend(),
    Resending: impossible,
    OnWire: impossible,
    Cancelling: impossible,
    Held: impossible,
  },
  Refused: {
    Idle: impossible,
    Kept: impossible,
    Acknowledging: () => Move.EndUnsent({ why: "StorageRefused" }),
    Unsent: impossible,
    Withdrawing: () => Move.EndUnsent({ why: "StorageRefused" }),
    Recapturing: () => Move.HoldRefused(),
    Resending: impossible,
    OnWire: impossible,
    Cancelling: impossible,
    Held: impossible,
  },
  Settled: {
    Idle: impossible,
    Kept: impossible,
    Acknowledging: impossible,
    Unsent: impossible,
    Withdrawing: impossible,
    Recapturing: impossible,
    Resending: impossible,
    OnWire: (head, cue) => settled(head, cue, false),
    Cancelling: (head, cue) => settled(head, cue, true),
    Held: impossible,
  },
  Ended: {
    Idle: stay,
    Kept: stay,
    Acknowledging: impossible,
    Unsent: impossible,
    Withdrawing: impossible,
    Recapturing: impossible,
    Resending: impossible,
    OnWire: admitted,
    Cancelling: () => Move.Hold({ reason: "Cancelled" }),
    Held: admitted,
  },
  Keep: {
    Idle: keep,
    Kept: keep,
    Acknowledging: keepBeside,
    Unsent: keepBeside,
    Withdrawing: keepBeside,
    Recapturing: keepBeside,
    Resending: keepBeside,
    OnWire: keepBeside,
    Cancelling: keepBeside,
    Held: impossible,
  },
  DisposalStarts: {
    Idle: stay,
    Kept: stay,
    Acknowledging: () => Move.EndUnsent({ why: "Disposed" }),
    Unsent: () => Move.EndUnsent({ why: "Disposed" }),
    Withdrawing: () => Move.EndUnsent({ why: "Disposed" }),
    Recapturing: () => Move.Become({ phase: Phase.Held() }),
    Resending: () => Move.Become({ phase: Phase.Held() }),
    OnWire: stay,
    Cancelling: stay,
    Held: stay,
  },
  BoundPassed: {
    Idle: stay,
    Kept: stay,
    Acknowledging: stay,
    Unsent: stay,
    Withdrawing: stay,
    Recapturing: stay,
    Resending: stay,
    OnWire: disposedOnWire,
    Cancelling: disposedOnWire,
    Held: stay,
  },
} as const satisfies Table;

/**
 * Where a lane stands: Idle, Kept (a kept ending and no head), or its head.
 */
export type LaneState = Data.TaggedEnum<{ Idle: {}; Kept: {}; Head: { head: Head } }>;

/**
 * Constructors and matchers for {@link LaneState}.
 */
export const LaneState = Data.taggedEnum<LaneState>();

const at = <C extends Cue["_tag"]>(row: Row<C>, state: LaneState, cue: CueOf<C>) =>
  LaneState.$match(state, {
    Idle: () => row.Idle(cue),
    Kept: () => row.Kept(cue),
    Head: ({ head }) =>
      Phase.$match(head.phase, {
        Acknowledging: (phase) => row.Acknowledging({ ...head, phase }, cue),
        Unsent: (phase) => row.Unsent({ ...head, phase }, cue),
        Withdrawing: (phase) => row.Withdrawing({ ...head, phase }, cue),
        Recapturing: (phase) => row.Recapturing({ ...head, phase }, cue),
        Resending: (phase) => row.Resending({ ...head, phase }, cue),
        OnWire: (phase) => row.OnWire({ ...head, phase }, cue),
        Cancelling: (phase) => row.Cancelling({ ...head, phase }, cue),
        Held: (phase) => row.Held({ ...head, phase }, cue),
      }),
  });

/**
 * The one total function from the table: the move a cue makes on a lane state.
 */
export const cell = (state: LaneState, cue: Cue) =>
  Cue.$match(cue, {
    CommitReject: (c) => at(table.CommitReject, state, c),
    CommitCancel: (c) => at(table.CommitCancel, state, c),
    Retry: (c) => at(table.Retry, state, c),
    Cancel: (c) => at(table.Cancel, state, c),
    TurnEnded: (c) => at(table.TurnEnded, state, c),
    Stored: (c) => at(table.Stored, state, c),
    Refused: (c) => at(table.Refused, state, c),
    Settled: (c) => at(table.Settled, state, c),
    Ended: (c) => at(table.Ended, state, c),
    Keep: (c) => at(table.Keep, state, c),
    DisposalStarts: (c) => at(table.DisposalStarts, state, c),
    BoundPassed: (c) => at(table.BoundPassed, state, c),
  });

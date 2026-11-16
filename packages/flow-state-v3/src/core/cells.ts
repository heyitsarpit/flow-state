import { Data, Option } from "effect";
import type { Values } from "./compiled.ts";
import { type Channel, isDecline } from "./vocabulary.ts";
import { type CallId, type Head, Phase, sentBefore, type TicketId } from "./world.ts";

/**
 * What happens to a lane: a member, a turn's end, a store's or a call's answer, or the Runtime's
 * disposal.
 *
 * **Details**
 *
 * `CommitReject`, `CommitLatest`, `CommitSerialize` and `CommitCancel` are a commit under each
 * concurrency policy. `Answered` is a call's classified result, applied to its lane in the step the
 * call settles; from then on the ending is an owed row.
 */
export type Cue = Data.TaggedEnum<{
  CommitReject: { input: Values; owner: number };
  CommitLatest: { input: Values; owner: number };
  CommitSerialize: { input: Values; owner: number };
  CommitCancel: { input: Values; owner: number };
  Retry: { owner: number };
  Cancel: {};
  TurnEnded: {};
  Stored: {};
  Refused: {};
  // FLOW_STATE_ALLOW_UNKNOWN: a call's value is the contract's own, mapped when its row is heard.
  Answered: { channel: Channel; reason: string; value: unknown };
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
export type NotSentWhy = "Rejected" | "Overloaded" | "Cancelled" | "StorageRefused" | "Disposed";

/**
 * How many commits serialize queues behind a head; the next declines NotSent Overloaded.
 */
export const QUEUE_LIMIT = 64;

/**
 * What a cell decides, as data; the step applies it.
 *
 * **Details**
 *
 * - `Mint`: a new head, `Unsent`, for the commit's input and owning activation.
 * - `Decline`: the commit ends `NotSent` and mints nothing.
 * - `Queue`: the commit waits behind the head; `latest` ends a commit already waiting Superseded
 *   (evidence) and keeps only this one.
 * - `Replace`: the head ends as evidence, `Superseded` or `Released`, with any queued commit, and
 *   the commit mints the new head.
 * - `Displace`: the head leaves the lane to await its call or ticket, interrupted when on the wire,
 *   its ending owed when a cancel was pending on it, else evidence; the commit mints the new head.
 * - `Become`: the head moves to a phase it already has the fields for.
 * - `Owe`: a retry owes the head's re-send.
 * - `Withdraw`: a cancel waits for the acknowledgement's storage.
 * - `EndUnsent`: the never-sent head ends `NotSent` and the next queued commit is promoted.
 * - `Release`: the head is let go, as evidence, and the next queued commit is promoted.
 * - `Interrupt`: the call is interrupted; the head is `Cancelling`.
 * - `Flush`: the turn ended; the head is acknowledged or captured, or invoked when nothing persists.
 * - `Send`, `Resend`: the head is invoked, a re-send counting one more.
 * - `HoldRefused`: a refused capture holds the head and ends it unknown `StorageRefused`.
 * - `Answer`: the call's ending, as its Attempt delivers it, is owed; an unknown holds the head,
 *   any other ending promotes the next queued commit. A promoted commit mints a new head, and a
 *   lane with nothing queued drops. `asked` is the channel before a definite failure after an
 *   earlier send became unknown; `interrupt` names a call the disposal bound interrupts.
 * - `Impossible`: a pair the table rules out, or leaves open; a defect in Flow.
 */
export type Move = Data.TaggedEnum<{
  Stay: {};
  Mint: { input: Values; owner: number };
  Decline: { why: NotSentWhy; owner: number };
  Queue: { input: Values; owner: number; latest: boolean };
  Replace: { input: Values; owner: number; ended: "Superseded" | "Released" };
  Displace: { input: Values; owner: number; owed: boolean };
  Become: { phase: Phase };
  Owe: { owner: number };
  Withdraw: { ticket: TicketId };
  EndUnsent: { why: NotSentWhy };
  Release: {};
  Interrupt: { call: CallId };
  Flush: { purpose: "acknowledge" | "capture" };
  Send: {};
  Resend: {};
  HoldRefused: {};
  Answer: {
    channel: Channel;
    asked: Channel;
    reason: string;
    // FLOW_STATE_ALLOW_UNKNOWN: a call's value is the contract's own, mapped when its row is heard.
    value: unknown;
    interrupt: Option.Option<CallId>;
  };
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
} & {
  readonly [P in Phase["_tag"]]: (head: HeadAt<P>, cue: CueOf<C>, queued: number) => Move;
};

/**
 * The write lane's table: one cell per cue and lane state, total by its type.
 */
export type Table = { readonly [C in Cue["_tag"]]: Row<C> };

// RETURN_TYPE: the open and ruled-out cells are typed Impossible, so a check can name them.
const impossible = (): Impossible => Move.Impossible();
const stay = () => Move.Stay();
const decline = (cue: CueOf<"CommitReject">) => Move.Decline({ why: "Rejected", owner: cue.owner });

const declineBeside = (_head: Head, cue: CueOf<"CommitReject">) => decline(cue);

type Commit = { readonly input: Values; readonly owner: number };

const mint = (cue: Commit) => Move.Mint({ input: cue.input, owner: cue.owner });

const queueLatest = (_head: Head, cue: Commit) =>
  Move.Queue({ input: cue.input, owner: cue.owner, latest: true });

const queueSerial = (_head: Head, cue: Commit, queued: number) =>
  queued < QUEUE_LIMIT
    ? Move.Queue({ input: cue.input, owner: cue.owner, latest: false })
    : Move.Decline({ why: "Overloaded", owner: cue.owner });

const supersede = (_head: Head, cue: Commit) =>
  Move.Replace({ input: cue.input, owner: cue.owner, ended: "Superseded" });

const releaseFor = (_head: Head, cue: Commit) =>
  Move.Replace({ input: cue.input, owner: cue.owner, ended: "Released" });

const displace = (owed: boolean) => (_head: Head, cue: Commit) =>
  Move.Displace({ input: cue.input, owner: cue.owner, owed });

// How the head's Attempt delivers an ending: a definite failure after an earlier unknown send of
// the same Attempt is unknown StillUnknown.
const delivered = (head: Head, channel: Channel, reason: string) => {
  const still: Channel = "unknown";

  return channel === "failure" && sentBefore(head) && !isDecline(reason)
    ? { channel: still, reason: "StillUnknown" }
    : { channel, reason };
};

// A call's result, classified by the phase it found: a call a cancel interrupted ends unknown
// Cancelled, with no value, whatever it returned; a definite failure after an earlier send is
// unknown StillUnknown.
const answered = (head: Head, cue: CueOf<"Answered">, cancelled: boolean) => {
  const asked: Channel = cancelled ? "unknown" : cue.channel;
  const reason = cancelled ? "Cancelled" : cue.reason;

  return Move.Answer({
    ...delivered(head, asked, reason),
    asked,
    value: cancelled ? undefined : cue.value,
    interrupt: Option.none(),
  });
};

const disposedOnWire = (head: HeadAt<"OnWire" | "Cancelling">) =>
  Move.Answer({
    channel: "unknown",
    asked: "unknown",
    reason: "Disposed",
    value: undefined,
    interrupt: Option.some(head.phase.call),
  });

/**
 * Every cell of the write lane, by cue and lane state. A Kept row's decline of a commit, or under
 * the cancel policy its letting go, comes before the table, which reads no row.
 */
export const table = {
  CommitReject: {
    Idle: mint,
    Acknowledging: declineBeside,
    Unsent: declineBeside,
    Withdrawing: declineBeside,
    Recapturing: declineBeside,
    Resending: declineBeside,
    OnWire: declineBeside,
    Cancelling: declineBeside,
    Held: declineBeside,
  },
  CommitLatest: {
    Idle: mint,
    Acknowledging: supersede,
    Unsent: supersede,
    Withdrawing: queueLatest,
    Recapturing: queueLatest,
    Resending: queueLatest,
    OnWire: queueLatest,
    Cancelling: queueLatest,
    Held: queueLatest,
  },
  CommitSerialize: {
    Idle: mint,
    Acknowledging: queueSerial,
    Unsent: queueSerial,
    Withdrawing: queueSerial,
    Recapturing: queueSerial,
    Resending: queueSerial,
    OnWire: queueSerial,
    Cancelling: queueSerial,
    Held: queueSerial,
  },
  CommitCancel: {
    Idle: mint,
    Acknowledging: supersede,
    Unsent: supersede,
    Withdrawing: displace(true),
    Recapturing: releaseFor,
    Resending: releaseFor,
    OnWire: displace(false),
    Cancelling: displace(true),
    Held: releaseFor,
  },
  Retry: {
    Idle: stay,
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
    Acknowledging: () => Move.EndUnsent({ why: "StorageRefused" }),
    Unsent: impossible,
    Withdrawing: () => Move.EndUnsent({ why: "StorageRefused" }),
    Recapturing: () => Move.HoldRefused(),
    Resending: impossible,
    OnWire: impossible,
    Cancelling: impossible,
    Held: impossible,
  },
  Answered: {
    Idle: impossible,
    Acknowledging: impossible,
    Unsent: impossible,
    Withdrawing: impossible,
    Recapturing: impossible,
    Resending: impossible,
    OnWire: (head, cue) => answered(head, cue, false),
    Cancelling: (head, cue) => answered(head, cue, true),
    Held: impossible,
  },
  DisposalStarts: {
    Idle: stay,
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
 * Where a lane stands: Idle, or its head with how many commits are queued behind it.
 */
export type LaneState = Data.TaggedEnum<{ Idle: {}; Head: { head: Head; queued: number } }>;

/**
 * Constructors and matchers for {@link LaneState}.
 */
export const LaneState = Data.taggedEnum<LaneState>();

const at = <C extends Cue["_tag"]>(row: Row<C>, state: LaneState, cue: CueOf<C>) =>
  LaneState.$match(state, {
    Idle: () => row.Idle(cue),
    Head: ({ head, queued }) =>
      Phase.$match(head.phase, {
        Acknowledging: (phase) => row.Acknowledging({ ...head, phase }, cue, queued),
        Unsent: (phase) => row.Unsent({ ...head, phase }, cue, queued),
        Withdrawing: (phase) => row.Withdrawing({ ...head, phase }, cue, queued),
        Recapturing: (phase) => row.Recapturing({ ...head, phase }, cue, queued),
        Resending: (phase) => row.Resending({ ...head, phase }, cue, queued),
        OnWire: (phase) => row.OnWire({ ...head, phase }, cue, queued),
        Cancelling: (phase) => row.Cancelling({ ...head, phase }, cue, queued),
        Held: (phase) => row.Held({ ...head, phase }, cue, queued),
      }),
  });

/**
 * The one total function from the table: the move a cue makes on a lane state.
 */
export const cell = (state: LaneState, cue: Cue) =>
  Cue.$match(cue, {
    CommitReject: (c) => at(table.CommitReject, state, c),
    CommitLatest: (c) => at(table.CommitLatest, state, c),
    CommitSerialize: (c) => at(table.CommitSerialize, state, c),
    CommitCancel: (c) => at(table.CommitCancel, state, c),
    Retry: (c) => at(table.Retry, state, c),
    Cancel: (c) => at(table.Cancel, state, c),
    TurnEnded: (c) => at(table.TurnEnded, state, c),
    Stored: (c) => at(table.Stored, state, c),
    Refused: (c) => at(table.Refused, state, c),
    Answered: (c) => at(table.Answered, state, c),
    DisposalStarts: (c) => at(table.DisposalStarts, state, c),
    BoundPassed: (c) => at(table.BoundPassed, state, c),
  });

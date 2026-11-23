import { Data, Option } from "effect";
import { Cue, LaneState } from "./cells.ts";
import type { Values } from "./compiled.ts";
import {
  type Channel,
  Evidence,
  type LaneFact,
  type Member,
  type Part,
  type RecordedWhy,
  type Reported,
  type SendDrop,
} from "./evidence.ts";
import type { IssueCode } from "./vocabulary.ts";
import { type ActorId, Command, type Incarnation, Phase } from "./world.ts";
import type { Why } from "./evidence.ts";

// An owed row as its reports name it.
type RowRef = { readonly operation: string; readonly attempt: Option.Option<string> };

/**
 * An act whose reports it determines: a lane's cue with its states before and after and the
 * commands it gave, a replaced lookup, a silent store, an owed ending, a row's move or close, a
 * try heard, a turn's verdict, an incarnation's life, a defect, or the Runtime's end.
 */
export type Act = Data.TaggedEnum<{
  RowWaits: { row: RowRef };
  RowQueued: { row: RowRef };
  RowRecorded: { row: RowRef; why: RecordedWhy };
  Heard: { row: RowRef; event: string; actor: ActorId };
  Turned: {
    actor: ActorId;
    event: string;
    from: string;
    to: string;
    parts: ReadonlyArray<Part>;
    members: ReadonlyArray<Member>;
  };
  Unhandled: { actor: ActorId; event: string };
  SendTargetAbsent: {
    actor: ActorId;
    event: string;
    reason: SendDrop;
    sender: Option.Option<ActorId>;
  };
  Denied: { actor: ActorId; event: string; reasons: ReadonlyArray<string> };
  Paused: {
    actor: ActorId;
    schedule: string;
    key: Option.Option<Values>;
    reasons: ReadonlyArray<string>;
    left: number;
  };
  Resumed: { actor: ActorId; schedule: string; key: Option.Option<Values>; dueAt: number };
  Refused: {
    code: IssueCode;
    actor: ActorId;
    ending: Option.Option<RowRef>;
    slot: Option.Option<string>;
  };
  Started: { actor: ActorId };
  Published: { actor: ActorId; incarnation: Incarnation; why: Why };
  Finished: { actor: ActorId };
  Defect: {};
  RuntimeEnded: {};
  WriteFailed: {};
  CleanupFailed: {};
  HoldForgotten: { actor: ActorId; operation: string; record: string };
  Lane: {
    actor: ActorId;
    operation: string;
    key: Option.Option<Values>;
    before: LaneState;
    cue: Cue;
    after: LaneState;
    commands: ReadonlyArray<Command>;
  };
  ReadReplaced: { operation: string };
  InvalidInput: { actor: ActorId; operation: string };
  Reported: Reported;
  Silent: { operation: string; attempt: string };
  Ended: {
    actor: ActorId;
    ending: {
      readonly operation: string;
      readonly attempt: Option.Option<string>;
      readonly channel: Channel;
      readonly reason: string;
    };
  };
}>;

/**
 * Constructors and matchers for {@link Act}.
 */
export const Act = Data.taggedEnum<Act>();

const headOf = (state: LaneState) =>
  LaneState.$match(state, {
    Idle: () => Option.none(),
    Head: ({ head }) => Option.some(head),
  });

// A displaced head (Withdrawing, OnWire, Cancelling) ends when its call or ticket answers; a cancel
// releases exactly the heads a commit would release.
const REPLACED = {
  Acknowledging: Option.some<LaneFact>("Superseded"),
  Unsent: Option.some<LaneFact>("Superseded"),
  Withdrawing: Option.none<LaneFact>(),
  Recapturing: Option.some<LaneFact>("Released"),
  Resending: Option.some<LaneFact>("Released"),
  OnWire: Option.none<LaneFact>(),
  Cancelling: Option.none<LaneFact>(),
  Held: Option.some<LaneFact>("Released"),
} as const satisfies Record<Phase["_tag"], Option.Option<LaneFact>>;

// The cues that are a commit, under each concurrency policy.
const COMMITS = {
  CommitReject: true,
  CommitLatest: true,
  CommitSerialize: true,
  CommitCancel: true,
  Retry: false,
  Cancel: false,
  TurnEnded: false,
  Stored: false,
  Refused: false,
  Answered: false,
  DisposalStarts: false,
  BoundPassed: false,
} as const satisfies Record<Cue["_tag"], boolean>;

const queuedOf = (state: LaneState) =>
  LaneState.$match(state, { Idle: () => 0, Head: ({ queued }) => queued });

/**
 * The reports an act determines, derived from the act alone: Minted for a new head, Sent for
 * each invocation, the lane facts of a retry, cancel or refusal, and Ended for an ending.
 */
// RETURN_TYPE: every act gives a list of the one Evidence type, whichever case built it.
export const evidenceOf = (act: Act): ReadonlyArray<Evidence> =>
  Act.$match(act, {
    RowWaits: ({ row }) => [Evidence.Parked({ operation: row.operation, attempt: row.attempt })],
    RowQueued: ({ row }) => [Evidence.Unparked({ operation: row.operation, attempt: row.attempt })],
    RowRecorded: ({ row, why }) => [
      Evidence.Recorded({ operation: row.operation, attempt: row.attempt, why }),
    ],
    Heard: ({ row, event, actor }) => [
      Evidence.Delivered({ operation: row.operation, attempt: row.attempt, event, actor }),
    ],
    Turned: (turn) => [
      Evidence.Turn({
        actor: turn.actor,
        event: turn.event,
        from: turn.from,
        to: turn.to,
        parts: turn.parts,
        members: turn.members,
      }),
    ],
    Unhandled: ({ actor, event }) => [Evidence.Unhandled({ actor, event })],
    SendTargetAbsent: (absent) => [Evidence.SendTargetAbsent(absent)],
    Denied: ({ actor, event, reasons }) => [Evidence.Denied({ actor, event, reasons })],
    Paused: (paused) => [Evidence.Paused(paused)],
    Resumed: (resumed) => [Evidence.Resumed(resumed)],
    Refused: ({ code, actor, ending, slot }) => [
      Evidence.Issue({
        code,
        ending: Option.map(ending, (e) => ({
          operation: e.operation,
          attempt: e.attempt,
          actor,
        })),
        slot,
      }),
    ],
    Started: ({ actor }) => [Evidence.Incarnated({ actor })],
    Published: ({ actor, incarnation, why }) => [
      Evidence.Published({
        actor,
        incarnation: incarnation.id,
        why,
        state: incarnation.state,
        memory: incarnation.memory,
      }),
    ],
    Finished: ({ actor }) => [Evidence.Finished({ actor })],
    Defect: () => [Evidence.Issue({ code: "Defect", ending: Option.none(), slot: Option.none() })],
    RuntimeEnded: () => [Evidence.RuntimeDisposed()],
    WriteFailed: () => [
      Evidence.Issue({ code: "StorageFailure", ending: Option.none(), slot: Option.none() }),
    ],
    CleanupFailed: () => [
      Evidence.Issue({ code: "CleanupFailed", ending: Option.none(), slot: Option.none() }),
    ],
    HoldForgotten: (forgotten) => [Evidence.HoldForgotten(forgotten)],
    Reported: (report) => [Evidence.Reported(report)],
    ReadReplaced: ({ operation }) => [
      Evidence.Lane({ kind: "Superseded", operation, attempt: Option.none() }),
    ],
    InvalidInput: ({ actor, operation }) => [Evidence.InvalidInput({ actor, operation })],
    Silent: ({ operation, attempt }) => [
      Evidence.Lane({ kind: "StorageSilent", operation, attempt: Option.some(attempt) }),
    ],
    Ended: ({ actor, ending }) => [
      Evidence.Ended({
        operation: ending.operation,
        attempt: ending.attempt,
        channel: ending.channel,
        reason: ending.reason,
        actor,
      }),
    ],
    Lane: ({ actor, operation, key, before, cue, after, commands }) => {
      const was = headOf(before);
      const attempt = Option.map(was, (h) => h.id);

      const now = headOf(after);
      const replaced = Option.isSome(was) && !Option.exists(now, (h) => h.id === was.value.id);

      const minted = Option.toArray(now).flatMap((h) =>
        Option.exists(was, (w) => w.id === h.id)
          ? []
          : Option.toArray(key).map((k) =>
              Evidence.Minted({ operation, attempt: h.id, actor, key: k }),
            ),
      );

      const commit = COMMITS[cue._tag];

      const ended =
        commit && replaced
          ? Option.toArray(was).flatMap((h) => {
              return Option.toArray(
                Option.map(REPLACED[h.phase._tag], (kind) =>
                  Evidence.Lane({ kind, operation, attempt }),
                ),
              );
            })
          : [];

      // Queued commits a commit dropped, with no Attempt: latest keeps only the newest.
      const droppedCount =
        commit && (replaced || Cue.$is("CommitLatest")(cue)) ? queuedOf(before) : 0;

      const dropped = Array.from({ length: droppedCount }, () =>
        Evidence.Lane({ kind: "Superseded", operation, attempt: Option.none() }),
      );

      const sent = commands.flatMap((c) =>
        Command.$is("Invoke")(c) ? [Evidence.Sent({ operation, attempt: c.attempt.id })] : [],
      );

      // What a retry, a cancel or a refused write tells beyond the lane's move.
      const none = () => [];

      const told = Cue.$match(cue, {
        Retry: () =>
          Option.match(was, {
            onNone: () => [
              Evidence.Lane({ kind: "NothingToResend", operation, attempt: Option.none() }),
            ],
            onSome: (h) =>
              Phase.$is("Held")(h.phase)
                ? []
                : [Evidence.Lane({ kind: "InFlight", operation, attempt })],
          }),
        Cancel: () =>
          Option.exists(was, (h) => Option.contains(REPLACED[h.phase._tag], "Released"))
            ? [Evidence.Lane({ kind: "Released", operation, attempt })]
            : [],
        Refused: () => [Evidence.Lane({ kind: "StorageFailure", operation, attempt })],
        CommitReject: none,
        CommitLatest: none,
        CommitSerialize: none,
        CommitCancel: none,
        TurnEnded: none,
        Stored: none,
        Answered: none,
        DisposalStarts: none,
        BoundPassed: none,
      });

      return [...ended, ...dropped, ...minted, ...told, ...sent];
    },
  });

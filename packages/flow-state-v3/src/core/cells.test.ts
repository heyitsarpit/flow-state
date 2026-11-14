import assert from "node:assert/strict";
import { Brand, Option } from "effect";
import { describe, it } from "vite-plus/test";
import { Cue, cell, LaneState, type Move, table } from "./cells.ts";
import { type CallId, Phase, type TicketId } from "./world.ts";

const ticket = Brand.nominal<TicketId>()("ticket-1");

const call = Brand.nominal<CallId>()("call-1");

const head = (phase: Phase, sent = false) => ({
  id: "att-1",
  input: { tone: "a" },
  retryCount: sent ? 1 : 0,
  mayHaveApplied: sent,
  owner: 0,
  phase,
});

const phases = {
  Acknowledging: Phase.Acknowledging({ ticket }),
  Unsent: Phase.Unsent(),
  Withdrawing: Phase.Withdrawing({ ticket }),
  Recapturing: Phase.Recapturing({ ticket }),
  Resending: Phase.Resending(),
  OnWire: Phase.OnWire({ call }),
  Cancelling: Phase.Cancelling({ call }),
  Held: Phase.Held(),
};

type StateName = "Idle" | "Kept" | keyof typeof phases;

const states: ReadonlyArray<StateName> = [
  "Idle",
  "Kept",
  "Acknowledging",
  "Unsent",
  "Withdrawing",
  "Recapturing",
  "Resending",
  "OnWire",
  "Cancelling",
  "Held",
];

const stateOf = (name: StateName, sent = false) => {
  if (name === "Idle") return LaneState.Idle();

  return name === "Kept"
    ? LaneState.Kept()
    : LaneState.Head({ head: head(phases[name], sent || name === "Held") });
};

const ending = {
  operation: "ring",
  attempt: Option.none<string>(),
  lane: Option.none<string>(),
  channel: "failure" as const,
  reason: "Rejected",
  value: undefined,
  owner: 0,
  current: true,
  tries: { _tag: "Last" as const },
};

// A move as the row states it: its tag and the fields the Spec rule fixes.
const shown = (move: Move) => {
  if (move._tag === "Decline") return `Decline ${move.why}`;

  if (move._tag === "EndUnsent") return `EndUnsent ${move.why}`;

  if (move._tag === "Flush") return `Flush ${move.purpose}`;

  if (move._tag === "Become") return `Become ${move.phase._tag}`;

  if (move._tag === "Hold") return `Hold ${move.reason}`;

  if (move._tag === "Queue") return `Queue ${move.channel} ${move.reason}`;

  if (move._tag !== "Park") return move._tag;
  const interrupts = Option.isSome(move.interrupt) ? " interrupt" : "";

  return `Park ${move.channel} ${move.reason}${interrupts}`;
};

const allOf = (move: string) => Object.fromEntries(states.map((s) => [s, move]));

// Each row is written from WriteLanes `algorithm` `cell` (the Spec's input on the left, in
// today's cue and move names), for the cells that exist under reject and the cancel policy
// today. The Kept row, `Settled` and `Ended`, `Keep` and the cancel policy's commit go in A1 (one
// `Answered` cue, the ledger) or are T18's; their rows state today's behaviour.
const rows: ReadonlyArray<{
  readonly cue: string;
  readonly of: Cue;
  readonly sent: boolean;
  readonly expected: Record<string, string>;
}> = [
  // commit under reject: Idle mints; every other phase declines NotSent { Rejected } (R7). The
  // Kept row's decline is R6's, before the cell.
  {
    cue: "commit",
    sent: false,
    of: Cue.CommitReject({ input: {}, owner: 0 }),
    expected: { ...allOf("Decline Rejected"), Idle: "Mint" },
  },
  // commit under the cancel policy: not built (only reject concurrency is built).
  {
    cue: "commit-cancel",
    sent: false,
    of: Cue.CommitCancel({ input: {}, owner: 0 }),
    expected: allOf("Impossible"),
  },
  // retry: Held owes its re-send; Idle gives NothingToResend and every other phase InFlight, as
  // evidence, with no move (R8).
  {
    cue: "retry",
    sent: false,
    of: Cue.Retry({ owner: 0 }),
    expected: { ...allOf("Stay"), Held: "Owe" },
  },
  // cancel: Idle nothing; Acknowledging goes Withdrawing; Unsent ends NotSent { Cancelled };
  // Recapturing, Resending and Held are released; OnWire is interrupted; Withdrawing and
  // Cancelling stay (R14). A Kept row is let go (R14, outside the cell after A1).
  {
    cue: "cancel",
    sent: false,
    of: Cue.Cancel(),
    expected: {
      Idle: "Stay",
      Kept: "LetGo",
      Acknowledging: "Withdraw",
      Unsent: "EndUnsent Cancelled",
      Withdrawing: "Stay",
      Recapturing: "Release",
      Resending: "Release",
      OnWire: "Interrupt",
      Cancelling: "Stay",
      Held: "Release",
    },
  },
  // invoked after the turn: Unsent is acknowledged, then sent; Resending is captured, then
  // re-sent (R5, R8; WriteAhead R13); nothing elsewhere.
  {
    cue: "turn-ended",
    sent: false,
    of: Cue.TurnEnded(),
    expected: { ...allOf("Stay"), Unsent: "Flush acknowledge", Resending: "Flush capture" },
  },
  // stored: Acknowledging is sent; Recapturing is re-sent; Withdrawing ends NotSent
  // { Cancelled }; impossible elsewhere.
  {
    cue: "stored",
    sent: false,
    of: Cue.Stored(),
    expected: {
      ...allOf("Impossible"),
      Acknowledging: "Send",
      Withdrawing: "EndUnsent Cancelled",
      Recapturing: "Resend",
    },
  },
  // refused: Acknowledging and Withdrawing end NotSent { StorageRefused }; Recapturing goes Held
  // with unknown { StorageRefused }; impossible elsewhere (WriteAhead R13).
  {
    cue: "refused",
    sent: false,
    of: Cue.Refused(),
    expected: {
      ...allOf("Impossible"),
      Acknowledging: "EndUnsent StorageRefused",
      Withdrawing: "EndUnsent StorageRefused",
      Recapturing: "HoldRefused",
    },
  },
  // answered, while open: OnWire owes the call's own ending; Cancelling owes unknown
  // { Cancelled } (today's; I41's as-is delivery is T18's); impossible elsewhere.
  {
    cue: "answered-success",
    sent: false,
    of: Cue.Settled({ channel: "success", reason: "success", value: 1, route: "queue" }),
    expected: {
      ...allOf("Impossible"),
      OnWire: "Queue success success",
      Cancelling: "Queue unknown Cancelled",
    },
  },
  // answered while disposing: owed to the identity as the Attempt delivers it.
  {
    cue: "answered-disposing",
    of: Cue.Settled({ channel: "failure", reason: "CardDeclined", value: 1, route: "park" }),
    sent: true,
    expected: {
      ...allOf("Impossible"),
      OnWire: "Park unknown StillUnknown",
      Cancelling: "Park unknown Cancelled",
    },
  },
  // the ending applied to its lane: a success resolves OnWire; a definite failure after an
  // earlier send is unknown StillUnknown and holds (R2); Cancelling holds as Cancelled. Lanes
  // the ending no longer heads stay.
  {
    cue: "applied-success",
    sent: false,
    of: Cue.Ended({ channel: "success", reason: "success" }),
    expected: {
      ...allOf("Stay"),
      Acknowledging: "Impossible",
      Unsent: "Impossible",
      Withdrawing: "Impossible",
      OnWire: "Resolve",
      Cancelling: "Hold Cancelled",
      Held: "Resolve",
    },
  },
  {
    cue: "applied-failure-after-send",
    of: Cue.Ended({ channel: "failure", reason: "CardDeclined" }),
    sent: true,
    expected: {
      ...allOf("Stay"),
      Acknowledging: "Impossible",
      Unsent: "Impossible",
      Withdrawing: "Impossible",
      OnWire: "Hold StillUnknown",
      Cancelling: "Hold Cancelled",
      Held: "Hold StillUnknown",
    },
  },
  // a twice-refused ending is kept, beside any head (R10; a ledger row after A1).
  { cue: "keep", sent: false, of: Cue.Keep({ ending }), expected: allOf("Keep") },
  // disposal starts: Acknowledging, Unsent and Withdrawing end NotSent { Disposed };
  // Recapturing and Resending go Held; OnWire, Cancelling, Held and Idle stay (Actors R22).
  {
    cue: "disposal-starts",
    sent: false,
    of: Cue.DisposalStarts(),
    expected: {
      ...allOf("Stay"),
      Acknowledging: "EndUnsent Disposed",
      Unsent: "EndUnsent Disposed",
      Withdrawing: "EndUnsent Disposed",
      Recapturing: "Become Held",
      Resending: "Become Held",
    },
  },
  // the bound passes: OnWire and Cancelling end unknown { Disposed } and are interrupted;
  // nothing elsewhere.
  {
    cue: "bound-passed",
    sent: false,
    of: Cue.BoundPassed(),
    expected: {
      ...allOf("Stay"),
      OnWire: "Park unknown Disposed interrupt",
      Cancelling: "Park unknown Disposed interrupt",
    },
  },
];

describe("the write lane's table (WriteLanes algorithm cell; T54 A-19)", () => {
  for (const row of rows)
    for (const state of states)
      it(`cell.${state}-${row.cue}`, () => {
        assert.strictEqual(shown(cell(stateOf(state, row.sent), row.of)), row.expected[state]);
      });

  it("every cue of today's table has a row", () => {
    assert.deepStrictEqual(
      [...new Set(rows.map((r) => r.of._tag))].toSorted(),
      Object.keys(table).toSorted(),
    );
  });
});

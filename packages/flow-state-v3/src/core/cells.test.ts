import assert from "node:assert/strict";
import { Brand, Option } from "effect";
import { describe, it } from "vite-plus/test";
import { Cue, cell, LaneState, type Move, table } from "./cells.ts";
import { type CallId, Phase, sentBefore, type TicketId } from "./world.ts";

const ticket = Brand.nominal<TicketId>()("ticket-1");

const call = Brand.nominal<CallId>()("call-1");

const head = (phase: Phase, sent = false) => ({
  id: "att-1",
  input: { tone: "a" },
  retryCount: sent ? 1 : 0,
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

type StateName = "Idle" | keyof typeof phases;

const states: ReadonlyArray<StateName> = [
  "Idle",
  "Acknowledging",
  "Unsent",
  "Withdrawing",
  "Recapturing",
  "Resending",
  "OnWire",
  "Cancelling",
  "Held",
];

const stateOf = (name: StateName, sent = false) =>
  name === "Idle"
    ? LaneState.Idle()
    : LaneState.Head({ head: head(phases[name], sent || name === "Held"), queued: 0 });

// A move as the row states it: its tag and the fields the Spec rule fixes.
const shown = (move: Move) => {
  if (move._tag === "Decline") return `Decline ${move.why}`;

  if (move._tag === "EndUnsent") return `EndUnsent ${move.why}`;

  if (move._tag === "Flush") return `Flush ${move.purpose}`;

  if (move._tag === "Become") return `Become ${move.phase._tag}`;

  if (move._tag === "Queue") return move.latest ? "Queue latest" : "Queue";

  if (move._tag === "Replace") return `Replace ${move.ended}`;

  if (move._tag === "Displace") return move.owed ? "Displace owed" : "Displace evidence";

  if (move._tag !== "Answer") return move._tag;
  const interrupts = Option.isSome(move.interrupt) ? " interrupt" : "";

  return `Answer ${move.channel} ${move.reason}${interrupts}`;
};

const allOf = (move: string) => Object.fromEntries(states.map((s) => [s, move]));

// Each row is written from WriteLanes `algorithm` `cell` (the Spec's input on the left, in
// today's cue and move names), for the cells that exist under reject and the cancel policy.
// A Kept row's decline and its let-go on cancel come before the table (WriteLanes R6, R14).
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
  // commit under latest: Idle mints; Acknowledging and Unsent end the head Superseded and the
  // commit becomes the head; every other phase queues it, ending a queued commit Superseded (R7).
  {
    cue: "commit-latest",
    sent: false,
    of: Cue.CommitLatest({ input: {}, owner: 0 }),
    expected: {
      ...allOf("Queue latest"),
      Idle: "Mint",
      Acknowledging: "Replace Superseded",
      Unsent: "Replace Superseded",
    },
  },
  // commit under serialize: Idle mints; every other phase appends it to W, however many wait (R7).
  {
    cue: "commit-serialize",
    sent: false,
    of: Cue.CommitSerialize({ input: {}, owner: 0 }),
    expected: { ...allOf("Queue"), Idle: "Mint" },
  },
  // commit under cancel: Idle mints; Acknowledging and Unsent end the head Superseded;
  // Recapturing, Resending and Held release it; OnWire is interrupted and displaced, its ending
  // evidence; Withdrawing and Cancelling are displaced with their ending owed; the commit mints.
  {
    cue: "commit-cancel",
    sent: false,
    of: Cue.CommitCancel({ input: {}, owner: 0 }),
    expected: {
      Idle: "Mint",
      Acknowledging: "Replace Superseded",
      Unsent: "Replace Superseded",
      Withdrawing: "Displace owed",
      Recapturing: "Replace Released",
      Resending: "Replace Released",
      OnWire: "Displace evidence",
      Cancelling: "Displace owed",
      Held: "Replace Released",
    },
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
  // Cancelling stay (R14). An Idle lane's Kept rows are let go outside the cell (R14).
  {
    cue: "cancel",
    sent: false,
    of: Cue.Cancel(),
    expected: {
      Idle: "Stay",
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
  // answered, in the step the call settles: OnWire owes the call's own ending (a success drops
  // the lane, an unknown holds it); Cancelling owes unknown { Cancelled } (today's; I41's as-is
  // delivery is not built yet); impossible elsewhere (R2, R10).
  {
    cue: "answered-success",
    sent: false,
    of: Cue.Answered({ channel: "success", reason: "success", value: 1 }),
    expected: {
      ...allOf("Impossible"),
      OnWire: "Answer success success",
      Cancelling: "Answer unknown Cancelled",
    },
  },
  // a definite failure after an earlier send of the Attempt is unknown StillUnknown (R2, I36).
  {
    cue: "answered-failure-after-send",
    of: Cue.Answered({ channel: "failure", reason: "CardDeclined", value: 1 }),
    sent: true,
    expected: {
      ...allOf("Impossible"),
      OnWire: "Answer unknown StillUnknown",
      Cancelling: "Answer unknown Cancelled",
    },
  },
  // a definite failure of a first send is owed as it is.
  {
    cue: "answered-failure",
    of: Cue.Answered({ channel: "failure", reason: "CardDeclined", value: 1 }),
    sent: false,
    expected: {
      ...allOf("Impossible"),
      OnWire: "Answer failure CardDeclined",
      Cancelling: "Answer unknown Cancelled",
    },
  },
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
      OnWire: "Answer unknown Disposed interrupt",
      Cancelling: "Answer unknown Disposed interrupt",
    },
  },
];

describe("the write lane's table (WriteLanes algorithm cell)", () => {
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

// WriteLanes I36's table, written from its text: an Attempt was sent before when its retryCount
// is above 0, or its head is Held, Recapturing or Resending. Nothing else counts.
const sentBeforeRows: ReadonlyArray<readonly [keyof typeof phases, number, boolean]> = [
  ["Acknowledging", 0, false],
  ["Unsent", 0, false],
  ["Withdrawing", 0, false],
  ["Recapturing", 0, true],
  ["Resending", 0, true],
  ["OnWire", 0, false],
  ["Cancelling", 0, false],
  ["Held", 0, true],
  ["Acknowledging", 1, true],
  ["OnWire", 1, true],
  ["Cancelling", 2, true],
];

describe("sentBefore (WriteLanes I36)", () => {
  for (const [phase, retryCount, expected] of sentBeforeRows)
    it(`sentBefore.${phase}-retryCount-${retryCount}`, () => {
      assert.strictEqual(
        sentBefore({ ...head(phases[phase]), retryCount }),
        expected,
        `a ${phase} head with retryCount ${retryCount} was sent before: ${expected}`,
      );
    });
});

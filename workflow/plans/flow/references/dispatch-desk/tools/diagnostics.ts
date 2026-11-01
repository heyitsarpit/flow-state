// One FlowError and its canonical diagnostics (Diagnostics.plan O1 and O2). Every Flow failure at a boundary is
// a FlowError with a closed `code`, diagnostics, an optional cause and, for Story failures, the partial evidence
// (completed checkpoints, how far the run got, cleanup). Branch on `code` and `path`, never on text.
import { FlowError } from "flow-state";

// What a Story run can reject with in this app (2.10.1, 2.10.2). The run keeps its evidence up to the failing
// boundary, so a failed Story still plays back.
export async function runStory(story: { readonly run: () => Promise<unknown> }) {
  try {
    return await story.run();
  } catch (failure) {
    if (!(failure instanceof FlowError)) throw failure;

    switch (failure.code) {
      // Every expectation and property is checked after the whole plan ran: the error carries the complete run
      // and every failure `{ step, cut, target, path, expected, actual }`, printed the same by a test runner
      // and by `flow story run`.
      case "StoryExpectationFailed":
        return report("expectation", failure);

      // A step that cannot apply: ActorAbsent, AlreadyEntered, NotEntered, TabOpen, TabClosed, NothingHeld,
      // NoDeadline. In this app: `release` with nothing held, `advance({ next })` on a schedule that is not
      // armed, a `send` to an editor that was never ensured in that tab.
      case "StoryInvalidCommand":
        return report("step", failure);

      // A fiber is still waiting on host I/O (a real setTimeout, crypto.subtle, a network promise). Host I/O
      // never decides a result in a Story; the owner is named. In this app, an adapter that awaits the real
      // network instead of the Desk fake.
      case "HostTimeWait":
        return report("owner", failure);

      // A turn rejected at commit: a failing `select`, or an invalid duration in an armOn schedule. The
      // lane effects of an ending that caused it are kept.
      case "InvalidTurn":
        return report("turn", failure);

      default:
        throw failure;
    }
  }
}

function report(kind: string, failure: FlowError) {
  for (const diagnostic of failure.diagnostics) {
    console.error(
      kind,
      diagnostic.classification,
      diagnostic.code,
      diagnostic.path,
      diagnostic.help,
    );
  }

  throw failure;
}

/**
 * Codes this app can meet now, besides the four above: SendTargetAbsent (a send to an actor no one ensured),
 * MissingContextProvider (an editor with no Session), NonDurableContextProvider (a durable editor over a
 * non-durable session), AdmissionOverloaded, ConcurrentCapture, HiddenOrder, HiddenFilter, UndeclaredEffect.
 * The host narrows with `describeHostFailure` (app/host.ts).
 *
 * design gap: `InvalidTurn`, `StoryInvalidCommand`, `HostTimeWait` and `StoryExpectationFailed` are FlowError
 * codes by 2.10.2 and 2.10.1; whether the closed code type includes them is not shown, so the `switch` is
 * written as if it does.
 */

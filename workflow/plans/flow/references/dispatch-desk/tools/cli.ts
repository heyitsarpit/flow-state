/**
 * CLI cookbook (CommandLine.plan; machine-design 2.9.5, 2.10.14). Strings document commands; importing this file
 * runs nothing. The CLI finds flow.config.ts at the project root; nothing is written unless asked.
 * Story ids are unique across the configuration (2.10.1), so `run <id>` needs no scope. Ids used here are the
 * Stories in features/Tickets (`desk/*`, `queue/*`, `editor/*`) and the fragment Stories with no app.
 */
export const cliExamples = [
  // Stories: every subject (an app, a machine, a fragment alone) is listed, described and run the same way.
  {
    command: "flow story list",
    expected:
      "desk/save-repairs-queue, desk/revoked-mid-save, editor/saved, queue/toggled, comments/posted-in-order (appId null), …; nothing runs",
    exit: 0,
  },
  {
    command: "flow story describe desk/closed-mid-save --format json",
    expected:
      "subject DispatchDesk (app), every step with its index, checkpoints, expectations, and the Desk fake with its endpoints, controls and their Schemas",
    exit: 0,
  },
  {
    command: "flow story run desk/closed-mid-save --trace-output closed-mid-save.trace.json",
    expected: "completed; every `expect` held; trace written atomically",
    exit: 0,
  },
  {
    command: "flow story run editor/unsure-resend",
    expected: "StoryExpectationFailed lists every failed expectation after the whole plan ran",
    exit: 2,
  },

  // Structure, rendered on demand from the live app
  {
    command: "flow graph DispatchDesk/Editor --format mermaid",
    expected:
      "states, deny codes, outcome edges, `comments` and `uploads` placements, and the save lane (docs: one lane per ticket)",
    exit: 0,
  },
  {
    command: "flow diff --base main",
    expected: "transitions, operations, outcomes, schedules and domain declarations that changed",
    exit: 1,
  },

  // Findings. `flow check` reads declarations and Story steps, never closures or a Runtime.
  {
    command: "flow check",
    expected:
      "construction errors, rule 20 (every ending handled), entity rules, stuck states, and the findings below",
    exit: 0,
  },
  {
    command: "flow check --finding UnresolvedHold",
    expected:
      "a `reject`, `latest` or `serialize` write whose unknown has no reachable retry or cancel; the Editor's UNSURE has both, so none",
    exit: 0,
  },
  {
    command: "flow check --finding SharedContract",
    expected:
      "two write operations (or two copies) on one contract in one actor; `comments` placed in Editor and Queue are two actors, so none",
    exit: 0,
  },
  {
    command: "flow check --finding KeyRequired",
    expected:
      "a keyed write's `retry` or `cancel` outside the handler that maps it, with no key; `SaveStopped` is the one that maps `save` alone, so it is exempt",
    exit: 0,
  },
  {
    command: "flow check --finding VerbMismatch",
    expected: "an operation used with two verbs, such as `lookup` on one that maps `value`",
    exit: 0,
  },
  {
    command: "flow check --finding FeedUnhandled",
    expected:
      "a fact feed that does not map `value`, `missed` and `failure`; DeskFeed maps all three, so none",
    exit: 0,
  },

  // Why: fragments' and machines' operations (2.9.5: operations are nodes under their placement)
  {
    command: "flow explain DispatchDesk/Editor OPEN.EDITING SaveRequested",
    expected:
      "→ OPEN.SAVING, commits save (DispatchDesk/save-title, reject, one lane per ticket); may deny NoPermission | EmptyTitle | TitleTooLong",
    exit: 0,
  },
  {
    command: "flow explain DispatchDesk/Editor --operation uploads.put",
    expected:
      "a fragment's write under its placement: one lane per file ref, subject = copy key, released by whenAbandoned",
    exit: 0,
  },
  {
    command: "flow explain DispatchDesk/Editor --operation comments.post",
    expected: "the Comments trait's write; subject path [] in the editor, [previewId] in the queue",
    exit: 0,
  },
  {
    command: "flow explain tickets",
    expected:
      "each entry as a sentence, then the impact table: assign repairs list (status, assignee) and openCount; saveTitle repairs list only",
    exit: 0,
  },
  {
    command: "flow explain tickets --read tickets.list",
    expected: "every write and feed that can repair the queue's list",
    exit: 0,
  },
  {
    command: "flow explain --trace revoked-mid-save.trace.json --at settled",
    expected:
      "lane, ending, store and session questions answered from the trace's records at that checkpoint, 'evidence unavailable' outside the window",
    exit: 0,
  },
  // I2 B: a subroutine's exits and where each lands in the host, then a late ending after one of them.
  {
    command: "flow explain DispatchDesk/Visit --state RESOLVING",
    expected:
      "ResolveWizard exits Resolved { resolution } → RESOLVED (commits resolve), Abandoned { parts } → RELEASING (commits release); " +
      "whenAbandoned notifies onDraft; nested DISCARD (ConfirmDiscard) exits Kept → STEPS.history, Discarded → exit Abandoned",
    exit: 0,
  },
  {
    command: "flow explain resolve/late-after-leaving --at late --operation resolve",
    expected:
      "resolve (owner RESOLVED) ended after RESOLVED was left: late, routed to the root's Resolved handler, which does not move (rule 20)",
    exit: 0,
  },

  // Coverage: write-lane cells, ending routes, Flow reasons, and stream cells  reached by the Stories
  {
    command: "flow stories --coverage",
    expected:
      "cells reached by editor/*, queue/* and desk/*: InFlight, Held, restore (unknown Restored, NotSent Restored), parked endings, current and late ending routes; unreached cells are listed",
    exit: 0,
  },
  {
    command: "flow stories --coverage --app dispatch-desk --checkpoints",
    expected:
      "per module, each COVERAGE.md section 6 checkpoint and the Story that reaches it (editor/*, fields, panels, queue, technicians, find, resolve, roster, comments, presence, feed, assistant, desk/*); none missing",
    exit: 0,
  },
  {
    command: "flow stories --coverage --kind session",
    expected: "stream cells reached by feed/* and presence/*: drop, reconnect, catch-up, missed",
    exit: 0,
  },

  // Traces
  {
    command: "flow trace summarize closed-mid-save.trace.json --read tickets.list",
    expected: "each repair of the list with its causes",
    exit: 0,
  },
  {
    command:
      "flow trace summarize closed-mid-save.trace.json --entity DispatchDesk/Ticket:north/T-42 --sequence 41",
    expected: "where each field came from, predictions and confirmations",
    exit: 0,
  },
  {
    command: "flow trace diff a.trace.json b.trace.json --section repairs",
    expected: "equal when both traces are complete and match",
    exit: 0,
  },
];

/**
 * Exit 0: completed, or an explanation produced (including "stale" and "insufficient evidence").
 * Exit 1: a difference, or a check with errors.
 * Exit 2: usage, config, artifact, Story, cleanup, I/O or internal failure (a failed expectation is a Story failure).
 * Success writes one document to stdout; failure writes one to stderr. --format text | json.
 *
 * design gap: the `--finding` filter on `flow check`, and `--kind`, `--app` and `--checkpoints` on `flow stories --coverage`, are placeholders;
 * 2.10.14 names the commands and what they list, not these flags.
 */

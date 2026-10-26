/**
 * CLI cookbook (CommandLine.plan). Strings document commands; importing this file runs nothing.
 * The CLI finds flow.config.ts at the project root; nothing is written unless asked.
 */
export const cliExamples = [
  // Stories
  {
    command: "flow story list",
    expected: "dispatch-desk/ticket-save, …, without running them",
    exit: 0,
  },
  {
    command: "flow story describe dispatch-desk/ticket-save --format json",
    expected: "actors, steps and checkpoints",
    exit: 0,
  },
  {
    command: "flow story run dispatch-desk/ticket-save --trace-output ticket-save.trace.json",
    expected: "completed; trace written atomically",
    exit: 0,
  },

  // Structure, rendered on demand from the live app
  {
    command: "flow graph DispatchDesk/Editor --format mermaid",
    expected: "states, deny codes, outcome edges, overrides and fallthrough",
    exit: 0,
  },
  {
    command: "flow diff --base main",
    expected: "transitions, operations, outcomes, schedules and domain declarations that changed",
    exit: 1,
  },
  {
    command: "flow check",
    expected:
      "construction errors, entity rules (unused inputs, recorded-position conditionals), stuck states",
    exit: 0,
  },

  // Why: machines
  {
    command: "flow explain DispatchDesk/Editor OPEN.EDITING SaveRequested",
    expected: "→ OPEN.SAVING; may deny NoPermission | EmptyTitle | TitleTooLong",
    exit: 0,
  },
  {
    command: "flow explain DispatchDesk/Editor OPEN.EDITING Escape",
    expected: "EDITING may deny NothingToDiscard, then falls through to OPEN → CLOSED",
    exit: 0,
  },

  // Why: the ticket domain (entity-domain.md section 7)
  {
    command: "flow explain tickets",
    expected:
      "each entry as a sentence, then the impact table: assign repairs list (status, assignee) and openCount",
    exit: 0,
  },
  {
    command: "flow explain tickets --read tickets.list",
    expected: "every write and stream, in any domain, that can repair the queue's list",
    exit: 0,
  },
  {
    command: "flow explain tickets --trace queue-assign.trace.json --at settled",
    expected: "why each answer refetched or did not, at that checkpoint",
    exit: 0,
  },

  // Traces
  {
    command: "flow trace summarize ticket-save.trace.json --read tickets.list",
    expected: "each repair of the list with its causes",
    exit: 0,
  },
  {
    command:
      "flow trace summarize ticket-save.trace.json --entity DispatchDesk/Ticket:north/T-42 --sequence 41",
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
 * Exit 2: usage, config, artifact, Story, cleanup, I/O or internal failure.
 * Success writes one document to stdout; failure writes one to stderr. --format text | json.
 */

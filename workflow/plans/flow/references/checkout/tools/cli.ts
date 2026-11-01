/**
 * CLI cookbook for the checkout (machine-design 2.7.16, 2.10.14). Strings document commands; importing this file
 * runs nothing. The CLI finds flow.config.ts at the project root.
 */
export const cliExamples = [
  {
    command: "flow story list",
    expected:
      "cart/*, pay/*, refunds/* under checkout; pay/three-ds-alone and pay/address-alone with appId null",
    exit: 0,
  },
  {
    command: "flow story run pay/reconciled",
    expected: "completed; one confirm request, one intent read, one charge",
    exit: 0,
  },
  // I2 C: why a challenge's answer, arriving after `TimedOut`, placed the order in one run and not in another.
  {
    command: "flow explain pay/late-challenge --at paid-after-timeout --operation authenticate",
    expected:
      "authenticate (owner CHALLENGE) ended success after the owner was left by exit TimedOut: late, routed to the root; " +
      "root Authenticated alternative 1 (guard S.CARD) taken: CARD owns no pending call, so the late turn may leave it (rule 15)",
    exit: 0,
  },
  {
    command: "flow explain pay/late-while-paying --at late-stays-paying --operation authenticate",
    expected:
      'late success routed to the root; alternative 1 denied (S.CARD: active leaf PAYING); alternative 3 taken ("self"); ' +
      "a target out of PAYING here would be LateMayNotLeave: PAYING owns pay { intentId: pi_1 }",
    exit: 0,
  },
  // I2 B: a subroutine's exits, as the graph shows them.
  {
    command: "flow graph Checkout/Pay --state CHALLENGE",
    expected:
      "ThreeDS exits Passed { authId } → PLACING, Declined { code } → CARD, TimedOut → CARD; nested countdown on OPEN (resumable)",
    exit: 0,
  },
  {
    command: "flow stories --coverage",
    expected:
      "per checkpoint the states, transitions, operations and endings it reached; CK's 11 module checkpoints all reached",
    exit: 0,
  },
  { command: "flow check", expected: "no findings for the checkout", exit: 0 },
] as const;

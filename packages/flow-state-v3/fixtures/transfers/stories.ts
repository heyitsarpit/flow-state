import { Story, type StoryConfig } from "../../src/host/testing/index.ts";
import { account, bank, savings } from "./machine.ts";
import { bankServer } from "./server.ts";

/**
 * The bank app as every transfers Story runs it: persisted, each capture written at once.
 */
export const config: StoryConfig = { app: bank, scope: "story", persistence: { captureMs: 0 } };

/**
 * A transfer on the account, as the user sends it.
 */
export const send = (ref: typeof account, transferId: string, cents: number) =>
  Story.send(ref, { _tag: "Send", transferId, cents });

/**
 * Two transfers that land at once.
 */
export const usual = Story.app(
  config,
  [bankServer],
  [
    Story.attach(account),
    send(account, "t1", 500),
    send(account, "t2", 900),
    Story.checkpoint("sent"),
  ],
);

/**
 * A transfer over the limit: the bank declines it.
 */
export const declined = Story.app(
  config,
  [bankServer],
  [Story.attach(account), send(account, "t1", 5000), Story.checkpoint("declined")],
);

/**
 * A transfer reaches the bank, its answer is lost, and the page reloads before the deadline.
 */
export const lostThenReload = Story.app(
  config,
  [bankServer],
  [
    Story.attach(account),
    bankServer.hold("transfer"),
    send(account, "t1", 500),
    Story.checkpoint("sending"),
    bankServer.dropResponse("transfer"),
    Story.advance("5 seconds"),
    Story.reload(),
    Story.checkpoint("reloaded"),
  ],
);

/**
 * A transfer that never answers: the nudge at 20 seconds, then the commit's own deadline at 30.
 */
export const deadline = Story.app(
  config,
  [bankServer],
  [
    Story.attach(account),
    bankServer.hold("transfer"),
    send(account, "t1", 500),
    Story.advance("19999 millis"),
    Story.checkpoint("before nudge"),
    Story.advance("1 millis"),
    Story.checkpoint("nudged"),
    Story.advance("9999 millis"),
    Story.checkpoint("before deadline"),
    Story.advance("1 millis"),
    Story.checkpoint("late"),
    bankServer.release("transfer"),
  ],
);

const round = (n: number) => {
  const steps = [
    send(account, `a${n}`, 500),
    send(savings, `b${n}`, 2000),
    bankServer.hold("transfer"),
    send(account, `c${n}`, 300),
    Story.advance("1 second"),
    bankServer.release("transfer"),
    bankServer.hold("transfer"),
    send(savings, `d${n}`, 100),
    bankServer.dropResponse("transfer"),
    Story.advance("31 seconds"),
    Story.send(savings, { _tag: "Resend", transferId: `d${n}` }),
  ];

  if (n % 3 === 2) steps.push(Story.reload());

  return steps;
};

/**
 * Two accounts over nine rounds of landed, declined, held, lost and resent transfers, with a
 * reload every third round: about a hundred steps, for the bench.
 */
export const long = Story.app(
  config,
  [bankServer],
  [
    Story.attach(account),
    Story.attach(savings),
    ...Array.from({ length: 9 }, (_, n) => round(n)).flat(),
    Story.checkpoint("end"),
  ],
);

/**
 * Every Story of the fixture, by name.
 */
export const stories = { usual, declined, lostThenReload, deadline, long };

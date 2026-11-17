import { cafeComposed, cafeDecomposed, account } from "../app.ts";
import { grownStory } from "./usual.ts";

// A transfer id well past any a real bank issues.
const LONG_ID = 100_000;

/**
 * Transfers of 0, -5 and 2^53 cents.
 */
export const centsEdges = grownStory("transfers/cents-edges")
  .ensure(account)
  .send(account, { _tag: "Send", transferId: "t-zero", cents: 0 })
  .send(account, { _tag: "Send", transferId: "t-negative", cents: -5 })
  .send(account, { _tag: "Send", transferId: "t-max", cents: 2 ** 53 })
  .checkpoint("sent");

/**
 * A transfer id of 100,000 characters, the transfer's key.
 */
export const longId = grownStory("transfers/long-id")
  .ensure(account)
  .send(account, { _tag: "Send", transferId: "t".repeat(LONG_ID), cents: 1 })
  .checkpoint("sent");

/**
 * Two accounts named "café", one composed and one decomposed, each send a transfer.
 */
export const twoSpellings = grownStory("transfers/two-spellings")
  .ensure(cafeComposed)
  .ensure(cafeDecomposed)
  .send(cafeComposed, { _tag: "Send", transferId: "t1", cents: 1 })
  .send(cafeDecomposed, { _tag: "Send", transferId: "t1", cents: 1 })
  .checkpoint("both");

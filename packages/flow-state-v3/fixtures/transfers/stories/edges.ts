import { cafeComposed, cafeDecomposed, account } from "../app.ts";
import { grownStory } from "./usual.ts";

// The bytes `{"transferId":""}` adds around a transfer id in its key's canonical text.
const KEY_FRAME = 17;

const KEY_BOUND = 8192;

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
 * A transfer id whose key's canonical text is exactly the 8,192-byte key bound.
 */
export const idAtBound = grownStory("transfers/id-at-bound")
  .ensure(account)
  .send(account, { _tag: "Send", transferId: "t".repeat(KEY_BOUND - KEY_FRAME), cents: 1 })
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

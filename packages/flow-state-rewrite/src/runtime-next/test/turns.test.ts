import { describe, it } from "@effect/vitest";

describe("runtime-next turns", () => {
  // Owner: P06.
  // Source: turn-plan.test.ts:215 "freezes one pre-turn snapshot, orders callbacks, and redirects the updated candidate".
  // Source: turn-plan.test.ts:242 "returns a no-op when every guard rejects without running later stages".
  // Source: turn-plan.test.ts:455 "builds a pure event turn candidate from an admitted event".
  // Source: turn-plan.test.ts:485 "orders machine actions and exact store targets".
  // Source: turn-plan.test.ts:500 "preserves authored false and null callback results".
  // Source: turn-plan.test.ts:892 "keeps a valid no-op plan free of synthetic changes".
  // Contract/correction: ARCH-012; refactor.md pure turn planning boundary.
  // Setup: An actor with guards, memory updates, authored false/null values, redirects, and store actions.
  // Action: Dispatch an event and observe callback order, state, memory, and store target.
  // Observable result: Each callback reads the captured pre-turn state as defined; accepted actions run in authored order and updated candidate redirects correctly.
  // Failure/cleanup: A refusing guard yields a no-op without running later callbacks or synthetic publication.
  it.todo("RN-TURN-001 event guards and callbacks use one captured pre-turn state");

  // Owner: P06.
  // Source: turn-plan.test.ts:273 "rejects the complete batch at the first unconstructed operation plan".
  // Source: turn-plan.test.ts:411 "rejects issue-only carriers with duplicate fixed slots".
  // Source: turn-plan.test.ts:609 "maps expected planning refusal without running effects".
  // Source: turn-plan.test.ts:625 "retains planning defects separately from expected refusal".
  // Source: turn-plan.test.ts:725 "rejects a candidate with an inconsistent store cut".
  // Source: turn-plan.test.ts:747 "rejects a timer projection whose deadline precedes its start".
  // Contract/correction: STD-05/06; refactor.md ActorEngine publication cut.
  // Setup: An actor with malformed event, operation batch, store result, context slot, or timer deadline variants.
  // Action: Dispatch each invalid input then one valid event.
  // Observable result: Expected refusal is typed and defects remain distinct; no failed candidate changes store, snapshot, evidence, or executes staged work.
  // Failure/cleanup: Cancellation releases prepared permits and the valid later event still commits.
  it.todo("RN-TURN-002 invalid plans fail before user effects or publication");

  // Owner: P06.
  // Source: turn-plan.test.ts:509 "reconciles activity lifetimes against the prior snapshot".
  // Source: turn-plan.test.ts:538 "cancels removed activity before late completion can apply".
  // Source: turn-plan.test.ts:876 "plans suspension with cancellation before publication".
  // Contract/correction: ARCH-012; refactor.md ActorEngine activities and operation cursors.
  // Setup: An actor with one live activity and a replacement under an operation key.
  // Action: Replace or remove the activity, then deliver old and current completion facts.
  // Observable result: Old work is cancelled first and its late completion has no effect; only the current occurrence updates the actor once.
  // Failure/cleanup: Shutdown joins remaining work and releases its resources.
  it.todo("RN-TURN-003 activity replacement cancels old work before late completion");
});

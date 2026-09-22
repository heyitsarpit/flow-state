import { describe, it } from "@effect/vitest";

describe("runtime-next facade", () => {
  // Owner: P01.
  // Source: runtime.test.ts:884 "rejects a copied App before publishing RuntimeSetup".
  // Source: runtime.test.ts:893 "rejects an App-shaped proxy without structural reads".
  // Source: runtime.test.ts:913 "captures the App before validating a flapping getter".
  // Contract/correction: API-012; refactor.md final runtime facade; STD-03.
  // Setup: A compiled app plus copied, proxied, and getter-backed setup inputs.
  // Action: Create a setup and construct a runtime, then mutate the original options before readiness.
  // Observable result: The runtime retains the admitted app identity and never rereads a hostile or changing getter.
  // Failure/cleanup: Malformed inputs produce a typed diagnostic before publication; no runtime starts.
  it.todo("RN-FACADE-001 runtime setup captures and validates its app once");

  // Owner: P01.
  // Source: new refactor.md owner proof; no frozen source declaration.
  // Contract/correction: API-011/API-012; approved correction 1; refactor.md final runtime facade.
  // Frozen outcome: Frozen handle access depended on the private runtimeOwner seam and had no final public lease shape.
  // Required new outcome: Types expose one owner lease from create/ensure, a non-owning lookup handle, and no disposal on handle or ref.
  // Setup: The final Runtime, owner-lease, ActorHandle, and ActorRef type declarations for two machine families.
  // Action: Compile positive create/ensure/get uses and negative handle/ref disposal uses.
  // Observable result: Create/ensure return an owner lease type, getActor returns a non-owning handle type, and neither handle nor ref has disposal authority; frozen behavior used a private owner seam.
  // Failure/cleanup: No owner implementation or package-root export is required for this type proof.
  it.todo("RN-FACADE-002 only owner leases grant actor disposal");

  // Owner: P07.
  // Source: runtime-architecture.test.ts:715 "admits a fresh actor through an explicit initial snapshot seam".
  // Contract/correction: API-011/API-012; approved correction 1; refactor.md final runtime facade.
  // Frozen outcome: Frozen assembly required callers to supply a private prepared initial snapshot.
  // Required new outcome: Fresh creation derives the complete initial snapshot from machine, input, and context refs.
  // Setup: An authored machine with input and provider context.
  // Action: Call createActor with only typed input/context refs.
  // Observable result: The first public snapshot has the compiled default state, initialized memory, selected context, and correct lifecycle; frozen assembly required a private prepared snapshot.
  // Failure/cleanup: Initializer or selector failure prevents exposure and rolls back admission.
  it.todo("RN-FACADE-003 fresh creation derives its initial snapshot internally");

  // Owner: P07.
  // Source: runtime-integration.test.ts:4216 "uses app-time machine facts despite later exposed-container mutation".
  // Source: runtime-integration.test.ts:4373 "keeps bound-consumer identity and lifecycle edges on captured machine facts".
  // Contract/correction: STD-03/11; refactor.md runtime assembly.
  // Setup: An app and machine whose exposed containers are mutated after app construction.
  // Action: Create actors and dispatch after those mutations.
  // Observable result: Identity, nested state, selectors, and lifecycle edges follow the captured app facts.
  // Failure/cleanup: No caller mutation changes an active actor or a later actor admitted from the same app.
  it.todo("RN-FACADE-004 runtime uses captured app-time machine facts");

  // Owner: P01.
  // Source: actor-engine.test.ts:614 "keeps the public send exact-typed and synchronous".
  // Source: turn-plan.test.ts:252 "rejects a foreign nominal event before callbacks run".
  // Source: turn-plan.test.ts:349 "preserves nominal event and operation action types".
  // Contract/correction: API-012; approved correction 1; refactor.md final actor facade.
  // Frozen outcome: Frozen send could throw synchronously on full or closed mailbox.
  // Required new outcome: The P01 facade signature returns exact-typed synchronous Result data for one machine family.
  // Setup: Two distinct machine event families and the final ActorHandle type.
  // Action: Compile valid send signatures and negative wrong-family event cases.
  // Observable result: The signature is synchronous and returns an exact-typed Result for the matching event family; frozen send could throw.
  // Failure/cleanup: No mailbox or active actor is required for the P01 type proof; runtime rejection is covered by RN-ACTOR-021.
  it.todo("RN-FACADE-005 send is synchronous, exact-typed, and returns Result");

  // Owner: P07.
  // Source: actor-admission.test.ts:1958 "fences a public handle after its actor lease is released".
  // Source: runtime-architecture.test.ts:445 "keeps individual disposal authority on the returned owner lease".
  // Contract/correction: API-011/API-012; approved correction 1; refactor.md final runtime facade.
  // Frozen outcome: Frozen disposal depended on private runtimeOwner methods and mutable handle authority.
  // Required new outcome: Active ensure shares the owner lease, while lookup handles and refs remain non-owning.
  // Setup: An admitted stable actor, a local actor, and a runtime facade.
  // Action: Create, ensure, look up, and dispose through only the owner lease.
  // Observable result: Active ensure shares the lease authority; lookup handles and refs have no disposal authority, and disposal fences their later sends.
  // Failure/cleanup: Repeated disposal joins one cached Exit; runtime close releases surviving leases.
  it.todo("RN-FACADE-006 create and ensure grant one owner lease while lookup stays non-owning");
});

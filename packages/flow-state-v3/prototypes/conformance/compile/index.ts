// Round 12: the compile prototypes' public surface, as the design spells it (machine-design 2.2.1's `Flow` module, 2.3, 2.7.3). Three compilers: operations
// (`operations.ts`), fragments (`fragment.ts`), machines (`machine.ts`), over shared memory (`memory.ts`), events (`events.ts`) and bodies (`body.ts`).
// What the suite boots is their output and nothing else. Where they differ from the design: `round-12/api-changes.md`. Seams (not public API) are marked.
import { deny } from "../fixtures/compiled.ts";
import { state } from "./body.ts";
import { ignore, uncertain } from "./events.ts";
import { Callback, Exit, Guard } from "./fragment.ts";
import { initial, input, privately } from "./memory.ts";
import type { Act, In, OpGuard } from "./operations.ts";

export { deny };
export type { Fields } from "./core.ts";
export { definition, machine, type DomainIn, type StreamIn } from "./machine.ts";
export { subroutine, trait } from "./fragment.ts";
export { notCarried, resource, servicesFor, transaction, type Typed } from "./operations.ts";
export type { FragmentValue, Placed } from "./body.ts";
export { actorRef, ensureArgs, type ActorRefOf, type InputOf } from "./ref.ts"; // round 14: rule 74, 2.7.19
export { changesOf, entity, predictionsOf, type Change, type Delta, type Patch, type Removal, type WholeRow } from "./entity.ts"; // phase 1 E round 3 (Q4 A)

// 2.2.1: one module for what Schema cannot say. `Flow.private` is `privately` here only because `private` is a reserved word for a binding.
export const Flow = {
  initial,
  input,
  private: privately,
  Exit,
  Callback,
  Guard,
  uncertain,
  state,
  ignore, // round 14 (OD28, 2.7.18)
};

// SEAM (D212): NOT public API. A host asking or cancelling its placed fragment's operation, which rule 50 forbids. Edge's IfJob, pay-full's shipping guard,
// Let's Forget (finding F3); counted apart.
export const labHostOp = (op: string): { readonly idle: OpGuard; readonly cancel: Act } => ({ idle: { opGuard: { op, verb: "idle" } }, cancel: { member: "cancel", op } });
// DEVIATION (D208): a module's member (`O.x.bookmark`, `O.x.refetch`, M8, D63) as its data, until the sessions module has handles.
export const moduleMember = <M = never, Ev = never>(op: string, module: string, name: string, f?: (a: In<M, Ev>) => unknown): Act => ({ member: "module", op, module, name, ...(f ? { f } : {}) });

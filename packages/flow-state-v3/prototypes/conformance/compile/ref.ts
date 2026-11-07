// Round 14 (OD30, rule 74, 2.7.19): an actor is its machine plus its input. `actorRef(machine, nameOrValue, options?)` names a shared actor in one
// of two forms. From a value: the value carries the machine's `Flow.input` fields, which are its identity; Flow keeps only those fields, encoded to
// strings in field-name order. A singleton: a literal string name (a runtime `string` is a type error), its input given at ensure.
import { Schema } from "effect";
import type { MemoryFields, MemorySpec } from "./memory.ts";
import type { Typed } from "./operations.ts";

// The input fields of a machine's memory, by their Type and their Encoded side.
type InputKeys<M> = { readonly [K in keyof M]: M[K] extends MemorySpec & { readonly from: "input" } ? K : never }[keyof M];
export type InputOf<M extends MemoryFields> = { readonly [K in InputKeys<M>]: M[K] extends MemorySpec<infer S> ? S["Type"] : never };
type EncodedOf<M extends MemoryFields> = { readonly [K in InputKeys<M>]: M[K] extends MemorySpec<infer S> ? S["Encoded"] : never };
// A value-named machine's identity fields encode to strings (Q6). Any other field set has no value form.
type StringEncoded<M extends MemoryFields> = [InputKeys<M>] extends [never] ? false : EncodedOf<M> extends Readonly<Record<string, string>> ? true : false;
type NameArg<N> = N extends string ? (string extends N ? never : N) : never;

export type ActorRefOf<I, F extends "value" | "singleton"> = {
  readonly machine: string;
  readonly id: string; // the identity, encoded: `field=value` in field-name order, or the singleton's name
  readonly form: F;
  readonly fields: readonly string[]; // the identity's fields (empty for a singleton)
  readonly input: F extends "value" ? I : undefined; // the value is the input
  readonly persist: boolean;
  readonly _I?: (i: I) => I;
};
type MachineTyped<M extends MemoryFields> = { readonly compiled: Typed<never>["compiled"]; readonly _M?: (m: M) => M };

const encodeId = (fields: readonly string[], value: Readonly<Record<string, unknown>>) =>
  fields.map((f) => `${encodeURIComponent(f)}=${encodeURIComponent(String(value[f]))}`).join("&");

export function actorRef<M extends MemoryFields, const N extends string>(
  machine: MachineTyped<M>,
  name: NameArg<N>,
  options?: { readonly persist?: boolean },
): ActorRefOf<InputOf<M>, "singleton">;
export function actorRef<M extends MemoryFields>(
  machine: MachineTyped<M> & (StringEncoded<M> extends true ? unknown : never),
  value: InputOf<M>, // not a type variable: a fresh literal's extra field is an excess property; a wider value is kept to its fields
  options?: { readonly persist?: boolean },
): ActorRefOf<InputOf<M>, "value">;
export function actorRef(machine: { readonly compiled: Typed<never>["compiled"] }, nameOrValue: unknown, options?: { readonly persist?: boolean }): ActorRefOf<any, any> {
  const c = machine.compiled;
  const persist = options?.persist ?? c.persisted;
  if (typeof nameOrValue === "string") return { machine: c.id, id: nameOrValue, form: "singleton", fields: [], input: undefined, persist };
  const fields = [...(c.identityFields ?? [])];
  if (fields.length === 0) throw new Error(`NoIdentityFields: ${c.id} has no Flow.input fields, so it can only be a singleton (rule 74)`);
  const given = nameOrValue as Readonly<Record<string, unknown>>;
  for (const f of fields) if (typeof given[f] !== "string") throw new Error(`IdentityFieldMissing: ${c.id} ${f} (rule 74)`);
  const input = Object.fromEntries(fields.map((f) => [f, given[f]])); // Flow keeps only the input fields
  return { machine: c.id, id: encodeId(fields, input), form: "value", fields, input, persist };
}
// Ensuring (2.7.19): a value ref takes no input, because the value is the input; a singleton takes its input at ensure.
export const ensureArgs = <I, F extends "value" | "singleton">(
  ref: ActorRefOf<I, F>,
  ...rest: F extends "value" ? [] : [options?: { readonly input?: I }]
): { readonly machine: string; readonly id: string; readonly input: unknown; readonly identity?: readonly string[] } =>
  ref.form === "value"
    ? { machine: ref.machine, id: ref.id, input: ref.input, identity: ref.fields }
    : { machine: ref.machine, id: ref.id, input: (rest[0] as { readonly input?: I } | undefined)?.input };
// The identity fields, as the compiler finds them: every `Flow.input` field, sorted by name (the order a reorder cannot change).
export const identityFieldsOf = (m: MemoryFields): readonly string[] =>
  Object.entries(m)
    .filter(([, f]) => !Schema.isSchema(f) && (f as MemorySpec).from === "input")
    .map(([k]) => k)
    .sort();

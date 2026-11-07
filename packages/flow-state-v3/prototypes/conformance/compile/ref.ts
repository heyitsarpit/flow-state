// Round 14 (OD30, rule 74, 2.7.19): an actor is its machine plus its input. `actorRef(machine, nameOrValue, options?)` names a shared actor in one
// of two forms. From a value: the value carries the machine's `Flow.input` fields, which are its identity; Flow keeps only those fields, encoded to
// strings in field-name order. A singleton: a literal string name (a runtime `string` is a type error), for a machine with no input (D4).
import { Schema, SchemaAST } from "effect";
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
  readonly fields: readonly string[]; // the identity's version: each field with its Schema, in name order (empty for a singleton)
  readonly input: F extends "value" ? I : undefined; // the value is the input
  readonly persist: boolean;
  readonly _I?: (i: I) => I;
};
type MachineTyped<M extends MemoryFields> = { readonly compiled: Typed<never>["compiled"]; readonly _M?: (m: M) => M };

const encodeId = (fields: readonly string[], value: Readonly<Record<string, string>>) =>
  fields.map((f) => `${encodeURIComponent(f)}=${encodeURIComponent(value[f]!)}`).join("&");
// OD30 Q6: each identity field encodes, by its own Schema, to a string; that string is the identity's part.
const encodeField = (machine: string, f: string, schema: unknown, v: unknown): string => {
  let out: unknown;
  try {
    out = Schema.encodeUnknownSync(schema as Schema.Top as never)(v);
  } catch (e) {
    throw new Error(`IdentityFieldRefused: ${machine} ${f}: ${String((e as Error).message).split("\n")[0]} (rule 74)`);
  }
  if (typeof out !== "string") throw new Error(`IdentityFieldNotString: ${machine} ${f} encodes to ${typeof out} (OD30 Q6)`);
  return out;
};
// The encoded side's structure: each node's tag and data, in key order, without annotations (a description or a title is no new version).
// Gotcha: a check is seen only as there or not (its kind lives in annotations), so `minLength(1)` and `minLength(2)` read the same.
const structure = (x: unknown, seen: Set<unknown> = new Set()): string => {
  if (x === null || typeof x !== "object") return typeof x === "function" ? "fn" : String(JSON.stringify(x));
  if (seen.has(x)) return "cycle";
  seen.add(x);
  if (Array.isArray(x)) return `[${x.map((y) => structure(y, seen)).join(",")}]`;
  const o = x as Record<string, unknown>;
  const keys = Object.keys(o).filter((k) => k !== "annotations" && typeof o[k] !== "function").sort();
  return `${String(o["_tag"] ?? "")}{${keys.map((k) => `${k}:${structure(o[k], seen)}`).join(",")}}`;
};
// OD30 Q3, rule 74 (fix pass L1): the version of a value-named machine's identity is its field set and each field's **encoded** Schema,
// compared by structure, in field-name order. A field whose type changes over the same encoded side (String to NumberFromString) is no new version.
export const identityVersionOf = (fields: Readonly<Record<string, { readonly schema: unknown }>>, names: readonly string[]): readonly string[] =>
  names.map((f) => {
    const ast = (fields[f]!.schema as Schema.Top).ast;
    return `${f}:${String(SchemaAST.toEncoded(ast))}#${hash(structure(SchemaAST.toEncoded(ast)))}`;
  });
const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h.toString(16).padStart(8, "0");
};

// D4 (the user, after the round 14 review): the form is fixed per machine. A machine with input fields is named only by value; one with no
// input only by a literal name, so a singleton takes no input at ensure.
type NoInput<M extends MemoryFields> = [InputKeys<M>] extends [never] ? unknown : never;
export function actorRef<M extends MemoryFields, const N extends string>(
  machine: MachineTyped<M> & NoInput<M>,
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
  if (typeof nameOrValue === "string") {
    if (c.identityFields?.length) throw new Error(`ValueNamedMachine: ${c.id} has input fields, so it is named only by value (D4)`);
    return { machine: c.id, id: nameOrValue, form: "singleton", fields: [], input: undefined, persist };
  }
  const fields = [...(c.identityFields ?? [])];
  if (fields.length === 0) throw new Error(`NoIdentityFields: ${c.id} has no Flow.input fields, so it can only be a singleton (rule 74)`);
  const given = nameOrValue as Readonly<Record<string, unknown>>;
  for (const f of fields) if (!(f in given)) throw new Error(`IdentityFieldMissing: ${c.id} ${f} (rule 74)`);
  const input = Object.fromEntries(fields.map((f) => [f, given[f]])); // Flow keeps only the input fields
  const encoded = Object.fromEntries(fields.map((f) => [f, encodeField(c.id, f, c.memory.fields![f]!.schema, given[f])]));
  return { machine: c.id, id: encodeId(fields, encoded), form: "value", fields: c.identityVersion ?? fields, input, persist };
}
// Ensuring (2.7.19, D4): a value ref takes no input, because the value is the input; a singleton has none. The ref's `persist` goes with the
// ensure, so two refs of one identity that disagree are `ConflictingActorRef` there.
export const ensureArgs = <I, F extends "value" | "singleton">(
  ref: ActorRefOf<I, F>,
): { readonly machine: string; readonly id: string; readonly input: unknown; readonly identity?: readonly string[]; readonly persist: boolean } =>
  ref.form === "value"
    ? { machine: ref.machine, id: ref.id, input: ref.input, identity: ref.fields, persist: ref.persist }
    : { machine: ref.machine, id: ref.id, input: undefined, persist: ref.persist };
// The identity fields, as the compiler finds them: every `Flow.input` field, sorted by name (the order a reorder cannot change).
export const identityFieldsOf = (m: MemoryFields): readonly string[] =>
  Object.entries(m)
    .filter(([, f]) => !Schema.isSchema(f) && (f as MemorySpec).from === "input")
    .map(([k]) => k)
    .sort();

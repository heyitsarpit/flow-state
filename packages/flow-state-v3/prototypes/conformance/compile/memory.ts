// Round 12, compile prototype: memory fields (machine-design 2.2.2), for machines and fragments alike. Each field has one source, `Flow.input`,
// `Flow.initial` (constant or computed) or absence for an optional key; `Flow.private` hides it from outside. Compiles to `Compiled.memory`: the fields
// as data (D214) and the three Slots the Runtime runs, made from them.
import { Schema } from "effect";
import type { CompiledMemory, MemoryField as CompiledField } from "../fixtures/compiled.ts";
import { isFn, lazy, slotOf } from "./core.ts";

export type MemorySpec<S extends Schema.Top = Schema.Top> = {
  readonly schema: S;
  readonly from: "initial" | "input" | "absent";
  readonly value?: S["Type"];
  readonly computed?: (start: Readonly<Record<string, unknown>>) => S["Type"];
  readonly private?: true;
};
export const initial = <S extends Schema.Top>(schema: S, value: S["Type"] | ((start: Readonly<Record<string, unknown>>) => S["Type"])): MemorySpec<S> =>
  isFn(value) && !Schema.isSchema(value)
    ? { schema, from: "initial", computed: value as (start: Readonly<Record<string, unknown>>) => S["Type"] }
    : { schema, from: "initial", value: value as S["Type"] };
export const input = <S extends Schema.Top>(schema: S): MemorySpec<S> => ({ schema, from: "input" });
export const privately = <S extends Schema.Top>(m: MemorySpec<S>): MemorySpec<S> => ({ ...m, private: true });

// "an optional key starts absent", written as the bare Schema (`Schema.optionalKey(Schema.String)`), with no `Flow` marker (2.2.2).
export type MemoryField = MemorySpec | Schema.Top;
export type MemoryFields = Readonly<Record<string, MemoryField>>;
export type MemoryOf<M extends MemoryFields> = {
  readonly [K in keyof M]: M[K] extends MemorySpec ? M[K]["schema"]["Type"] : M[K] extends Schema.Top ? M[K]["Type"] | undefined : never;
};
const specOf = (f: MemoryField): MemorySpec => (Schema.isSchema(f) ? { schema: f, from: "absent" } : (f as MemorySpec));
const specs = (m: MemoryFields): Readonly<Record<string, MemorySpec>> => Object.fromEntries(Object.entries(m).map(([k, f]) => [k, specOf(f)]));
const missingDefault = (k: string, s: Schema.Top): { readonly has: boolean; readonly v?: unknown } => {
  try {
    const out = Schema.decodeUnknownSync(Schema.Struct({ [k]: s }) as unknown as Schema.Codec<Record<string, unknown>, unknown>)({});
    return k in out ? { has: true, v: out[k] } : { has: false };
  } catch {
    return { has: false };
  }
};
const isOptionalKey = (s: Schema.Top): boolean => (s.ast as { context?: { isOptional?: boolean } }).context?.isOptional === true;
// Written and read by one codec (round 7, review H2). Each field as a one-field struct, so a key modifier means what it means in a struct.
const jsonCodec = (k: string, f: MemorySpec) => Schema.toCodecJson(Schema.Struct({ [k]: f.schema }) as unknown as Schema.Codec<unknown, unknown>);

// Round 13 (D222, replacing the first D222's split by door; mid review M2): **a field has one default, and it applies at creation and at restore alike.**
// It is the Schema's constructor default or its decoding default, whichever it states (both, with different values, is refused at the compile:
// `TwoDefaults`); a `Flow.initial`'s constant is its default, so its Schema may state none. A computed initial is made from the fields, at both doors.
const constructorDefault = (k: string, s: Schema.Top): { readonly has: boolean; readonly v?: unknown } => {
  const o = (Schema.Struct({ [k]: s }) as unknown as { makeOption: (i: unknown) => { _tag: string; value?: Record<string, unknown> } }).makeOption({});
  return o._tag === "Some" && o.value && k in o.value ? { has: true, v: o.value[k] } : { has: false };
};
const defaultOf = (definition: string, k: string, f: MemorySpec): { readonly has: boolean; readonly v?: unknown } => {
  const c = constructorDefault(k, f.schema);
  const d = missingDefault(k, f.schema);
  if (f.from === "initial" && (c.has || d.has)) throw new Error(`TwoDefaults: ${definition} memory ${k} is Flow.initial and its Schema states a default too`);
  if (c.has && d.has && JSON.stringify(c.v) !== JSON.stringify(d.v)) throw new Error(`TwoDefaults: ${definition} memory ${k} states two different defaults`);
  if (f.from === "initial" && !f.computed) return { has: true, v: f.value };
  return c.has ? c : d;
};
// Creation (D214, D219): the creator hands a value in-process, so a present input field is checked by its Schema's type side (refinements kept, no
// transforming decode). An absent one takes the field's default, stays absent if optional, else is refused. Then computed initials over those.
const initialOf = (definition: string, m: Readonly<Record<string, MemorySpec>>) => {
  const built = lazy(() => ({
    defaults: new Map(Object.entries(m).map(([k, s]) => [k, defaultOf(definition, k, s)])),
    checks: new Map(
      Object.entries(m)
        .filter(([, s]) => s.from === "input")
        .map(([k, s]) => [k, Schema.decodeUnknownSync(Schema.toType(Schema.Struct({ [k]: s.schema }) as unknown as Schema.Top) as unknown as Schema.Codec<unknown, unknown>)]),
    ),
  }));
  return slotOf<(input: unknown) => object>(definition, "memory.initial", (input: unknown) => {
    const { defaults, checks } = built();
    const given = (input ?? {}) as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, s] of Object.entries(m)) {
      if (s.computed) continue;
      if (s.from === "input" && k in given) {
        try {
          out[k] = (checks.get(k)!({ [k]: given[k] }) as Record<string, unknown>)[k];
        } catch (e) {
          throw new Error(`InputRefused: ${definition} input ${k}: ${(e as Error).message.split("\n")[0]}`);
        }
      } else if (defaults.get(k)!.has) out[k] = defaults.get(k)!.v;
      else if (s.from === "input" && !isOptionalKey(s.schema)) throw new Error(`InputMissing: ${definition} input ${k}`);
    }
    const start = { ...out };
    for (const [k, s] of Object.entries(m)) if (s.computed) out[k] = s.computed(start);
    return out;
  });
};
// Restore (D214, D222): a stored field decodes by its codec. A field the record lacks (a release added it): the field's one default (a constant initial's
// included); a computed initial, run once over the restored fields; an optional key stays absent; an input with no default refuses the record
// (`RestoreMissingInput`).
const restoreOf = (definition: string, m: Readonly<Record<string, MemorySpec>>) => {
  const built = lazy(() => ({
    defaults: new Map(Object.entries(m).map(([k, f]) => [k, f.computed ? { has: false } : defaultOf(definition, k, f)])),
    codecs: new Map(Object.entries(m).map(([k, f]) => [k, jsonCodec(k, f)])),
  }));
  return slotOf<(stored: unknown) => object>(definition, "memory.restore", (stored: unknown) => {
    const { defaults, codecs } = built();
    const s = stored as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    const later: Array<[string, MemorySpec]> = [];
    for (const [k, f] of Object.entries(m)) {
      if (k in s) out[k] = (Schema.decodeUnknownSync(codecs.get(k)!)({ [k]: s[k] }) as Record<string, unknown>)[k];
      else if (defaults.get(k)!.has) out[k] = defaults.get(k)!.v;
      else if (f.computed) later.push([k, f]);
      else if (f.from === "initial") out[k] = f.value;
      else if (f.from === "input" && !isOptionalKey(f.schema)) throw new Error(`RestoreMissingInput: ${definition} ${k}`);
    }
    const start = { ...out };
    for (const [k, f] of later) out[k] = f.computed!(start);
    return out;
  });
};
const encodeOf = (definition: string, m: Readonly<Record<string, MemorySpec>>) => {
  const codecsOf = lazy(() => new Map(Object.entries(m).map(([k, f]) => [k, jsonCodec(k, f)])));
  return slotOf<(memory: unknown) => object>(definition, "memory.encode", (memory: unknown) => {
    const codecs = codecsOf();
    const v = memory as Record<string, unknown>;
    return Object.fromEntries(Object.keys(v).map((k) => [k, codecs.has(k) ? (Schema.encodeUnknownSync(codecs.get(k)!)({ [k]: v[k] }) as Record<string, unknown>)[k] : v[k]]));
  });
};
const fieldsOf = (m: Readonly<Record<string, MemorySpec>>): Readonly<Record<string, CompiledField>> =>
  Object.fromEntries(Object.entries(m).map(([k, s]) => [k, { source: s.computed ? ("computed" as const) : s.from, schema: s.schema, ...(s.private ? { private: true as const } : {}) }]));
export const compileMemory = (definition: string, fields: MemoryFields): CompiledMemory => {
  const m = specs(fields);
  for (const [k, f] of Object.entries(m)) if (!f.computed) defaultOf(definition, k, f); // D222: `TwoDefaults` at the compile, not at first use
  return { fields: fieldsOf(m), initial: initialOf(definition, m), restore: restoreOf(definition, m), encode: encodeOf(definition, m) };
};

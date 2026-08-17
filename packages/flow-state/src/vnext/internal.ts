export const TypeId: unique symbol = Symbol.for("flow-state/vnext/TypeId");
export const RequirementsTypeId: unique symbol = Symbol.for("flow-state/vnext/RequirementsTypeId");
export const InputTypeId: unique symbol = Symbol.for("flow-state/vnext/InputTypeId");
export const MemoryTypeId: unique symbol = Symbol.for("flow-state/vnext/MemoryTypeId");
export const StateTypeId: unique symbol = Symbol.for("flow-state/vnext/StateTypeId");
export const EventTypeId: unique symbol = Symbol.for("flow-state/vnext/EventTypeId");
export const SelectedTypeId: unique symbol = Symbol.for("flow-state/vnext/SelectedTypeId");
export const RefTypeId: unique symbol = Symbol.for("flow-state/vnext/RefTypeId");
export const DescriptorTypeId: unique symbol = Symbol.for("flow-state/vnext/DescriptorTypeId");
export const BindingTypeId: unique symbol = Symbol.for("flow-state/vnext/BindingTypeId");
export const BindingKeyTypeId: unique symbol = Symbol.for("flow-state/vnext/BindingKeyTypeId");
export const BindingRegistryTypeId: unique symbol = Symbol.for(
  "flow-state/vnext/BindingRegistryTypeId",
);

export type Simplify<T> = { readonly [K in keyof T]: T[K] } & {};

export type TupleOnly<T extends readonly unknown[]> = number extends T["length"] ? never : T;

export type UnionToIntersection<U> = (U extends unknown ? (value: U) => void : never) extends (
  value: infer I,
) => void
  ? I
  : never;

export type RequirementsOf<T> = T extends {
  readonly [RequirementsTypeId]: (_: never) => infer R;
}
  ? Exclude<R, import("effect/Scope").Scope>
  : never;

export type InputOf<T> = T extends { readonly [InputTypeId]: (_: never) => infer Input }
  ? Input
  : never;

export type MemoryOf<T> = T extends { readonly [MemoryTypeId]: (_: never) => infer Memory }
  ? Memory
  : never;

export type StateOf<T> = T extends { readonly [StateTypeId]: (_: never) => infer State }
  ? State
  : never;

export type EventOf<T> = T extends { readonly [EventTypeId]: (_: never) => infer Event }
  ? Event
  : never;

export type SelectedOf<T> = T extends { readonly [SelectedTypeId]: (_: never) => infer Selected }
  ? Selected
  : never;

export type DescriptorOf<T> = T extends {
  readonly [DescriptorTypeId]: (_: never) => infer Descriptor;
}
  ? Descriptor
  : never;

export type BindingRequirements<T> = T extends {
  readonly [BindingTypeId]: (_: never) => infer R;
}
  ? R
  : T extends (...args: readonly unknown[]) => unknown
    ? never
    : T extends readonly (infer Item)[]
      ? BindingRequirements<Item>
      : T extends object
        ? { readonly [K in keyof T]: BindingRequirements<T[K]> }[keyof T]
        : never;

export type BindingDescriptors<T> = T extends {
  readonly [DescriptorTypeId]: (_: never) => infer Descriptor;
}
  ? Descriptor
  : T extends (...args: readonly unknown[]) => unknown
    ? never
    : T extends readonly (infer Item)[]
      ? BindingDescriptors<Item>
      : T extends object
        ? { readonly [K in keyof T]: BindingDescriptors<T[K]> }[keyof T]
        : never;

export type BindingCarriers<T> = T extends { readonly [BindingTypeId]: (_: never) => unknown }
  ? T
  : T extends (...args: readonly unknown[]) => unknown
    ? never
    : T extends readonly (infer Item)[]
      ? BindingCarriers<Item>
      : T extends object
        ? { readonly [K in keyof T]: BindingCarriers<T[K]> }[keyof T]
        : never;

export type NoExtraProperties<Actual, Allowed> = Actual &
  Record<Exclude<keyof Actual, keyof Allowed>, never>;

export const freezeRecord = <T extends object>(value: T): Readonly<T> => Object.freeze(value);

export const freezeArray = <T>(value: readonly T[]): readonly T[] => Object.freeze([...value]);

export const freezeTuple = <const T extends readonly unknown[]>(value: T): T =>
  Object.freeze([...value]) as T;

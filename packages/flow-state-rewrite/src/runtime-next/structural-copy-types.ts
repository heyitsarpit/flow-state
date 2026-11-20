type Reference = Exclude<WeakKey, symbol>;

type StructuralReadonlyArray<
  // oxlint-disable-next-line anti-slop/no-readonly -- The mapper accepts both mutable and readonly array inputs.
  Value extends ReadonlyArray<unknown>,
  Opaque,
> = number extends Value["length"]
  ? // oxlint-disable-next-line anti-slop/no-readonly -- Frozen array copies expose a readonly element view.
    ReadonlyArray<StructuralReadonlyDeep<Value[number], Opaque>>
  : // oxlint-disable-next-line anti-slop/no-readonly -- Frozen tuple copies keep their exact keys and readonly elements.
    Readonly<{ [Index in keyof Value]: StructuralReadonlyDeep<Value[Index], Opaque> }>;

type StructuralReadonlyRecord<Value extends Reference, Opaque> =
  // oxlint-disable-next-line anti-slop/no-readonly -- Frozen plain-record copies expose this readonly projection.
  Readonly<{
    [Key in keyof Value]: StructuralReadonlyDeep<Value[Key], Opaque>;
  }>;

type StructuralReadonlyDeep<Value, Opaque> = Value extends Opaque
  ? Value
  : Value extends (...args: never[]) => unknown
    ? Value
    : // oxlint-disable-next-line anti-slop/no-readonly -- The recursive mapper recognizes readonly-array inputs here.
      Value extends ReadonlyArray<unknown>
      ? StructuralReadonlyArray<Value, Opaque>
      : Value extends Reference
        ? StructuralReadonlyRecord<Value, Opaque>
        : Value;

export type StructuralReadonlyWhenNonempty<Value, Opaque> = Value extends unknown
  ? [keyof Value] extends [never]
    ? Value
    : StructuralReadonlyDeep<Value, Opaque>
  : never;

export type StructuralReadonly<
  Value extends Reference,
  Opaque = never,
  PreservedKey extends PropertyKey = never,
  ConditionallyEmptyKey extends keyof Value = never,
> =
  // oxlint-disable-next-line anti-slop/no-readonly -- This projection is the exact view of the frozen copies produced by structural-copy.ts.
  Readonly<{
    [Key in keyof Value]: Key extends PreservedKey
      ? Value[Key]
      : Key extends ConditionallyEmptyKey
        ? StructuralReadonlyWhenNonempty<Value[Key], Opaque>
        : StructuralReadonlyDeep<Value[Key], Opaque>;
  }>;

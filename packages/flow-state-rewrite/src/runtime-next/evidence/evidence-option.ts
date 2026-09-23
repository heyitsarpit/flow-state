import { Option } from "effect";

/** Own an Effect Option shell before an evidence result is shared. */
export const publishEvidenceOption = <Value>(value: Value | undefined) => {
  const source = Option.fromNullishOr(value);

  // Effect reuses None; copying preserves Option's prototype without freezing its singleton.
  const owned: Option.Option<Value> = Object.create(
    Object.getPrototypeOf(source),
    Object.getOwnPropertyDescriptors(source),
  );

  // oxlint-disable-next-line anti-slop/no-object-freeze -- STD-11: owned Option shell cannot change while Effect's shared None stays writable; P055-OPTION.
  return Object.freeze(owned);
};

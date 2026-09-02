import { Predicate, Result } from "effect";

export type Utf8Failure = "lone-surrogate" | "too-large";

const utf8Encoder = new TextEncoder();

const isHighSurrogate = (code: number): boolean => code >= 0xd800 && code <= 0xdbff;

const isLowSurrogate = (code: number): boolean => code >= 0xdc00 && code <= 0xdfff;

export const isWellFormedFallback = (value: string): boolean => {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (isLowSurrogate(code)) return false;
    if (!isHighSurrogate(code)) continue;
    if (!isLowSurrogate(value.charCodeAt(index + 1))) return false;
    index += 1;
  }
  return true;
};

export const isWellFormedText = (value: string): boolean => {
  const native = Object.getOwnPropertyDescriptor(String.prototype, "isWellFormed")?.value;
  return Predicate.isFunction(native) ? Boolean(native.call(value)) : isWellFormedFallback(value);
};

export const utf8EncodedByteLength = (value: string): number =>
  utf8Encoder.encode(value).byteLength;

export const utf8ByteLength = (
  value: string,
  maximumBytes: number,
): Result.Result<number, Utf8Failure> => {
  if (!isWellFormedText(value)) return Result.fail("lone-surrogate");

  const byteLength = utf8EncodedByteLength(value);
  return byteLength <= maximumBytes ? Result.succeed(byteLength) : Result.fail("too-large");
};

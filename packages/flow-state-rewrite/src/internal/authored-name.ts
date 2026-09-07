import { Result, Schema } from "effect";

import { utf8ByteLength } from "./utf8.js";

const isControlCharacter = (character: string) => {
  const code = character.codePointAt(0);
  return code !== undefined && (code <= 0x1f || code === 0x7f);
};

// RETURN_TYPE: Predicate required by Schema.refine to retain authored-name string narrowing.
const isValidAuthoredText = (value: string): value is string => {
  if (value.length === 0) return false;
  if (Result.isFailure(utf8ByteLength(value, 256))) return false;
  for (const character of value) {
    if (isControlCharacter(character)) return false;
  }
  return true;
};

export const AuthoredName = Schema.String.pipe(
  Schema.refine(isValidAuthoredText, { message: "Expected a valid authored name" }),
);

export const isAuthoredName = Schema.is(AuthoredName);

import { Option } from "effect";

/**
 * A key segment's text: `%`, `/` and `|` escaped, so it splits back at `/` and `|`.
 */
export const escapeSegment = (text: string) =>
  text.replaceAll("%", "%25").replaceAll("/", "%2F").replaceAll("|", "%7C");

/**
 * A segment read back: none when its escaped form is not the text it came from, so one key spells
 * one identity.
 */
export const unescapeSegment = (text: string) =>
  Option.liftPredicate(
    text.replaceAll("%7C", "|").replaceAll("%2F", "/").replaceAll("%25", "%"),
    (plain) => escapeSegment(plain) === text,
  );

/**
 * A contract id as a lane id spells it: `%` and `|` escaped, so it splits back at `|`.
 */
export const escapeContract = (contract: string) =>
  contract.replaceAll("%", "%25").replaceAll("|", "%7C");

/**
 * A contract id read back: none when its escaped form is not the text it came from.
 */
export const unescapeContract = (text: string) =>
  Option.liftPredicate(
    text.replaceAll("%7C", "|").replaceAll("%25", "%"),
    (plain) => escapeContract(plain) === text,
  );

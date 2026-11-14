import { Option } from "effect";

/**
 * The signature of a run that failed nothing.
 */
export const PASSING = "pass";

/**
 * One kept regression's check line (Conformance I49, T32): ok only when it was saved with a
 * red signature and still fails by it. A regression saved as a pass can never fail, so it is
 * refused: re-save it from a real red or delete it.
 */
export const signatureLine = (id: string, saved: Option.Option<string>, now: string) =>
  Option.match(saved, {
    onNone: () => `BAD  ${id}: no signature saved (now ${now})`,
    onSome: (by) => {
      if (by === PASSING) return `BAD  ${id}: saved as a pass, so it can never fail`;

      return by === now ? `ok   ${id}: still ${now}` : `BAD  ${id}: saved ${by}, now ${now}`;
    },
  });

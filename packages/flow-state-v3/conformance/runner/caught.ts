import { Option } from "effect";
import type { CaseVerdict } from "./verdict.ts";

/**
 * What a gate asks was caught: a check (an oracle's name, or `case` for a case's own
 * expectation) and the Invariant it names.
 */
export type CatchKey = { readonly check: string; readonly invariant: string };

/**
 * Whether a verdict caught `key`, or anything at all when no key is asked: the one rule every
 * gate that counts a catch uses (Conformance R6, I43).
 *
 * **Details**
 *
 * - An oracle's catch is one structured violation with exactly the key's check and Invariant; a
 *   case's (`check: "case"`) is a cite its failing expectation declared. With no key, any
 *   violation or failed case expectation is a catch (the liar gate, core mutants).
 * - A Timeout, a defect and an unreadable report carry neither, so they never catch; `why` is
 *   never read.
 */
export const caught = (key: Option.Option<CatchKey>, verdict: CaseVerdict) => {
  if (verdict._tag !== "Fail") return false;

  const violations = verdict.violations ?? [];
  const cites = verdict.cites ?? [];

  return Option.match(key, {
    onNone: () => violations.length > 0 || verdict.expectation !== undefined,
    onSome: (k) =>
      k.check === "case"
        ? cites.includes(k.invariant)
        : violations.some((v) => v.check === k.check && v.invariant === k.invariant),
  });
};

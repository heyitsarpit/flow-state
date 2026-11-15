import { Option } from "effect";
import { Fact } from "../harness/facts.ts";

/**
 * Nothing is invoked from the start of the Runtime's disposal (Actors I30): the server receives no
 * request, write or read, between a `DisposingRuntime` and the next reload.
 */
export const invokedWhileDisposing = (facts: ReadonlyArray<Fact>) =>
  facts.reduce<{ readonly disposing: boolean; readonly found: ReadonlyArray<string> }>(
    (acc, fact) => {
      if (Fact.$is("DisposingRuntime")(fact)) return { ...acc, disposing: true };

      if (Fact.$is("Reloaded")(fact)) return { ...acc, disposing: false };

      if (!acc.disposing || !Fact.$is("Requested")(fact)) return acc;
      const { operation, key } = fact.request;
      const id = Option.match(key, { onNone: () => "", onSome: (k) => ` (${k})` });

      return {
        ...acc,
        found: [
          ...acc.found,
          `Actors I30: the server received a ${operation} request${id} after the Runtime's disposal began; nothing is invoked from its start`,
        ],
      };
    },
    { disposing: false, found: [] },
  ).found;

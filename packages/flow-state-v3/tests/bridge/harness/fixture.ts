import { Data, Schema } from "effect";
import type { Part } from "../../../fixtures/part.ts";
import { cellsPart, payPart } from "../../../fixtures/pay/index.ts";

type Concurrency = "reject" | "latest" | "serialize" | "cancel";

const Progress = Schema.OptionFromOptionalKey(Schema.Json);

const RejectRow = Schema.Struct({
  pending: Schema.Boolean,
  uncertain: Schema.Boolean,
  waiting: Schema.Boolean,
  retryCount: Schema.Number,
  progress: Progress,
});

const ROWS = {
  reject: RejectRow,
  latest: RejectRow,
  serialize: Schema.Struct({ ...RejectRow.fields, outstanding: Schema.Number }),
  cancel: Schema.Struct({ pending: Schema.Boolean, retryCount: Schema.Number, progress: Progress }),
} as const;

const rowFor = <C extends Concurrency>(concurrency: C) => ROWS[concurrency];

const Empty = Schema.Record(Schema.String, Schema.Never);

const JsonKey = Schema.Record(Schema.String, Schema.Json);

const keyOf = (fields: ReadonlyArray<string>) =>
  fields.length === 0
    ? Empty
    : Schema.Struct(Object.fromEntries(fields.map((f) => [f, Schema.Json])));

// FLOW_STATE_ALLOW_UNKNOWN: the bound every fixture's Schemas meet; each is typed per part.
type Codec = Schema.Codec<unknown, unknown>;

/**
 * One machine a case boots, derived from a part's `Compiled`: its machine id, the part, and the
 * Schemas of its events, memory and writes (each write's key, as `O.x.get` takes it, and its row,
 * which its concurrency picks).
 */
export type Fixture<
  Events extends Readonly<Record<string, Codec>> = Readonly<Record<string, Codec>>,
  Memory extends Codec = Codec,
  Keys extends Readonly<Record<string, Codec>> = Readonly<Record<string, Codec>>,
> = {
  readonly machine: string;
  readonly part: Part;
  readonly events: Events;
  readonly memory: Memory;
  readonly states: ReadonlyArray<string>;
  readonly operations: {
    readonly [O in keyof Keys]: { readonly key: Keys[O]; readonly row: Codec };
  };
};

/**
 * A fixture said with a different write policy than its `Compiled` gives: a defect in the fixture.
 */
export class PolicyMismatch extends Data.TaggedError("PolicyMismatch")<{
  readonly operation: string;
}> {}

type DefinitionOf<P extends Part> = P["machine"]["definition"];

type FieldsOfEvent<X> = X extends { readonly fields: infer F extends Schema.Struct.Fields }
  ? F
  : X extends Schema.Struct.Fields
    ? X
    : never;

type EventsOf<P extends Part> = {
  readonly [E in keyof DefinitionOf<P>["events"]]: Schema.Struct<
    FieldsOfEvent<DefinitionOf<P>["events"][E]>
  >;
};

type MemoryOf<P extends Part> = Schema.Struct<{
  readonly [K in keyof DefinitionOf<P>["memory"]]: DefinitionOf<P>["memory"][K]["schema"];
}>;

type TypedPart<P extends Part, R extends Readonly<Record<string, Concurrency>>> = [
  EventsOf<P>,
  MemoryOf<P>,
] extends [infer E extends Readonly<Record<string, Codec>>, infer M extends Codec]
  ? Fixture<E, M, { readonly [O in keyof R]: typeof JsonKey }> & {
      readonly operations: {
        readonly [O in keyof R]: { readonly row: ReturnType<typeof rowFor<R[O]>> };
      };
    }
  : never;

const typedPart = <P extends Part, R extends Readonly<Record<string, Concurrency>>>(
  part: P,
  writes: R,
) => {
  const compiled = part.machine.compiled;

  const operations = [...compiled.operations.values()].flatMap((w) =>
    w._tag === "Write"
      ? [
          [
            w.name,
            {
              key: keyOf(w.keyFields),
              row: rowFor(w.concurrency),
              concurrency: w.concurrency,
            },
          ] as const,
        ]
      : [],
  );

  for (const [operation, concurrency] of Object.entries(writes))
    if (!operations.some(([name, w]) => name === operation && w.concurrency === concurrency))
      throw new PolicyMismatch({ operation });

  const fixture: Fixture = {
    machine: compiled.id,
    part,
    events: Object.fromEntries(compiled.external),
    memory: compiled.memory,
    states: [...compiled.states.keys()],
    operations: Object.fromEntries(operations.map(([name, { key, row }]) => [name, { key, row }])),
  };

  // SAFETY: the fixture is derived from this part's own definition, whose event and memory
  // Schemas these types name, and each write's policy was checked above.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Compiled erases the definition's types; the definition restores them
  return fixture as TypedPart<P, R>;
};

const payWrites = { pay: "reject", place: "reject", void: "reject" } as const;

/**
 * The checkout's Pay, derived from its machine.
 */
export const Pay = typedPart(payPart, payWrites);

/**
 * Pay with `AbortPay`, which cancels the intent's `pay`, derived the same way.
 */
export const Cells = typedPart(cellsPart, payWrites);

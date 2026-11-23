import { Exit, Schema } from "effect";
import { Fake } from "../../../src/host/testing/index.ts";
import { Conflict, Doc, NoResponse, Outline } from "../services.ts";

// What the server answers for a document nobody has written yet.
const UNTITLED = { title: "Untitled", body: "", revision: 0 };

const DocsTruth = Schema.Struct({
  docs: Schema.Record(Schema.String, Doc),
  saves: Schema.Record(Schema.String, Schema.Number),
});

type Truth = typeof DocsTruth.Type;

/**
 * The documents service's truth: each document, and the revision each idempotency key's save
 * made, replayed for a key it has seen. `doc-1` starts at revision 1.
 */
export const Docs = Fake.server("Docs", {
  truth: DocsTruth,
  initial: {
    docs: { "doc-1": { title: "Plan", body: "# Goals\nfirst draft\n# Risks", revision: 1 } },
    saves: {},
  },
  endpoints: {
    document: Fake.call({
      request: { id: Schema.String },
      success: Doc,
      failure: Schema.Never,
      handle: (truth: Truth, { id }) => ({ truth, exit: Exit.succeed(truth.docs[id] ?? UNTITLED) }),
    }),
    outline: Fake.call({
      request: { id: Schema.String },
      success: Outline,
      failure: Schema.Never,
      handle: (truth: Truth, { id }) => ({
        truth,
        exit: Exit.succeed({
          headings: (truth.docs[id] ?? UNTITLED).body.split("\n").filter((l) => l.startsWith("# ")),
        }),
      }),
    }),
    save: Fake.call({
      request: {
        id: Schema.String,
        body: Schema.String,
        revision: Schema.Number,
        key: Schema.String,
      },
      success: Schema.Struct({ revision: Schema.Number }),
      failure: Conflict,
      handle: (truth: Truth, { id, body, revision, key }) => {
        const known = truth.saves[key];

        if (known !== undefined) return { truth, exit: Exit.succeed({ revision: known }) };

        const current = truth.docs[id] ?? UNTITLED;

        if (current.revision !== revision)
          return { truth, exit: Exit.fail(new Conflict({ revision: current.revision })) };

        const next = current.revision + 1;

        return {
          truth: {
            docs: { ...truth.docs, [id]: { ...current, body, revision: next } },
            saves: { ...truth.saves, [key]: next },
          },
          exit: Exit.succeed({ revision: next }),
        };
      },
    }),
  },
  controls: {
    edit: Fake.control({ id: Schema.String, body: Schema.String }, (truth: Truth, { id, body }) => {
      const current = truth.docs[id] ?? UNTITLED;

      return {
        ...truth,
        docs: { ...truth.docs, [id]: { ...current, body, revision: current.revision + 1 } },
      };
    }),
  },
  lost: () => new NoResponse(),
});

// The model provider for Stories: its own `Fake.server` with one `Fake.stream` endpoint (the NDJSON body),
// and the client half that provides `AssistantApi` from it. It shares no truth with `Desk`: a model is a
// separate service from the ticket store, and Stories here need bodies the Desk's endpoint cannot make
// (a body with no `done`, a refusal). Demonstrates 2.10.4 (truth, endpoints, controls) and 2.10.9
// (a streamed `fetch` body as a client half over a stream endpoint).
// Pending merge 6: written against merged/streams/proposal-v2.md revision 7.1, 4.4.
import { Effect, Layer, Schema, Stream } from "effect";
import { Fake } from "flow-state/testing"; // pending merge 6
import { AssistantApi, Refused, SuggestFrame } from "../features/Assistant/assistant-api.js";
import { NoResponse, ServerError } from "../features/Tickets/types.js";

const where = { workspaceId: Schema.String, ticketId: Schema.String };

const at = (key: { workspaceId: string; ticketId: string }) => `${key.workspaceId}/${key.ticketId}`;

// What a model would stream. Fixed, so a Story can name the text after n tokens.
export const TOKENS: ReadonlyArray<string> = [
  "Thanks ",
  "for ",
  "reporting ",
  "the ",
  "flicker. ",
  "A ",
  "technician ",
  "will ",
  "visit ",
  "today.",
];

export const textAfter = (n: number) => TOKENS.slice(0, n).join("");

export const Assistant = Fake.server("Assistant", {
  // `cutAfter`: the body for this ticket ends after n tokens with no `done`. `refuse`: the status to answer.
  truth: {
    cutAfter: Schema.Record(Schema.String, Schema.Number),
    refuse: Schema.Record(Schema.String, Schema.Number),
  },
  initial: { cutAfter: {}, refuse: {} },
  endpoints: {
    suggest: Fake.stream({
      request: { ...where, prompt: Schema.String, key: Schema.String },
      open: (truth, req) => {
        const status = truth.refuse[at(req)];

        if (status !== undefined) return [truth, [], { accept: false, code: status }];

        const cut = truth.cutAfter[at(req)];
        const shown = cut === undefined ? TOKENS : TOKENS.slice(0, cut);

        const frames: ReadonlyArray<SuggestFrame> = [
          ...shown.map((text): SuggestFrame => ({ t: "token", text })),
          ...(cut === undefined
            ? [{ t: "done", usage: { tokens: TOKENS.length } } satisfies SuggestFrame]
            : []),
        ];

        return [truth, frames.map((frame) => `${JSON.stringify(frame)}\n`), { accept: true }];
      },
    }),
  },
  controls: {
    // The next bodies for this ticket end early and cleanly, the way a proxy cuts a response (FC80).
    truncate: Fake.control({ ...where, after: Schema.Int }, (truth, { after, ...key }) => ({
      ...truth,
      cutAfter: { ...truth.cutAfter, [at(key)]: after },
    })),
    // The next requests for this ticket are answered with a 4xx.
    refuse: Fake.control({ ...where, status: Schema.Int }, (truth, { status, ...key }) => ({
      ...truth,
      refuse: { ...truth.refuse, [at(key)]: status },
    })),
  },
});

// The client half, as the real adapter does it (next/http-api.ts): a lost request is `NoResponse`, a 4xx
// `Refused`, a 5xx `ServerError`, and the body's lines decode to frames. It decides nothing about
// completeness: a body that ends without `done` is the commit's business.
export const AssistantFake = Layer.effect(
  AssistantApi,
  Effect.map(Assistant, (server) =>
    AssistantApi.of({
      suggest: (input, { idempotencyKey }) =>
        server.suggest({ ...input, key: idempotencyKey }).pipe(
          Stream.mapError((error) =>
            error._tag === "Fake/Closed" && error.code >= 500
              ? new ServerError({ status: error.code })
              : error._tag === "Fake/Closed"
                ? new Refused({ status: error.code })
                : new NoResponse(),
          ),
          Stream.splitLines,
          Stream.mapEffect((line) =>
            Schema.decodeUnknownEffect(Schema.fromJsonString(SuggestFrame))(line).pipe(
              Effect.orDie,
            ),
          ),
        ),
    }),
  ),
);

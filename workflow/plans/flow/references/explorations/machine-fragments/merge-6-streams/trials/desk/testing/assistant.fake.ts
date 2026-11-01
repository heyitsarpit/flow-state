// TRIAL (fakes-v2.md): the model provider for Stories. Its own `Fake.server` with one `Fake.stream` endpoint (the NDJSON body), and
// the client half that provides `AssistantApi` from it. It shares no truth with `Desk`.
import { Effect, Layer, Schema, Stream } from "effect";
import { Fake } from "flow-state/testing";
import { AssistantApi, Refused, SuggestFrame } from "@desk/features/Assistant/assistant-api.js";
import { NoResponse, ServerError } from "@desk/features/Tickets/types.js";

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

type Truth = {
  readonly cutAfter: Readonly<Record<string, number>>;
  readonly refuse: Readonly<Record<string, number>>;
};

const suggest = Fake.stream({
  request: { ...where, prompt: Schema.String, key: Schema.String },
  // GUESS: the body is NDJSON, and no codec is spelled for "JSON, then a newline". Raw strings: the frames lose their type here.
  frame: Schema.String,
  open: (truth: Truth, req) => {
    const status = truth.refuse[at(req)];

    if (status !== undefined) return { refuse: status }; // NEW: refuse replaces `{ accept: false, code }`

    const cut = truth.cutAfter[at(req)];
    const shown = cut === undefined ? TOKENS : TOKENS.slice(0, cut);

    const frames: ReadonlyArray<typeof SuggestFrame.Type> = [
      ...shown.map((text): typeof SuggestFrame.Type => ({ t: "token", text })),
      ...(cut === undefined
        ? [{ t: "done", usage: { tokens: TOKENS.length } } satisfies typeof SuggestFrame.Type]
        : []),
    ];

    // NEW: `end: true`. A body is finite; without it the connection stays open after the last frame and the commit never finishes.
    return { frames: frames.map((frame) => `${JSON.stringify(frame)}\n`), end: true };
  },
});

export const Assistant = Fake.server("Assistant", {
  // `cutAfter`: the body for this ticket ends after n tokens with no `done`. `refuse`: the status to answer.
  truth: {
    cutAfter: Schema.Record(Schema.String, Schema.Number),
    refuse: Schema.Record(Schema.String, Schema.Number),
  },
  initial: { cutAfter: {}, refuse: {} },
  endpoints: { suggest },
  controls: {
    // The next bodies for this ticket end early and cleanly, the way a proxy cuts a response.
    truncate: Fake.control({ ...where, after: Schema.Int }, (truth: Truth, { after, ...key }) => ({
      truth: { ...truth, cutAfter: { ...truth.cutAfter, [at(key)]: after } },
    })),
    // The next requests for this ticket are answered with a 4xx.
    refuse: Fake.control({ ...where, status: Schema.Int }, (truth: Truth, { status, ...key }) => ({
      truth: { ...truth, refuse: { ...truth.refuse, [at(key)]: status } },
    })),
  },
});

// The client half, as the real adapter does it (next/http-api.ts): a lost request is `NoResponse`, a 4xx `Refused`, a 5xx
// `ServerError`, and the body's lines decode to frames. It decides nothing about completeness.
export const AssistantFake = Layer.effect(
  AssistantApi,
  Effect.map(Assistant, (server) =>
    AssistantApi.of({
      suggest: (input, { idempotencyKey }) =>
        server.suggest({ ...input, key: idempotencyKey }).pipe(
          Stream.mapError((error) =>
            error._tag === "FakeRefused"
              ? error.code >= 500
                ? new ServerError({ status: error.code })
                : new Refused({ status: error.code })
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

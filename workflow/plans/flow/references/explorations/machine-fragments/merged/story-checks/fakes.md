# Fakes: narrow changes to the merged `Fake` module

**Superseded by [fakes-v2.md](fakes-v2.md); kept as prior art.** Status was: proposed, direction approved by the owner 2026-11-01; spellings not final. Amends `machine-design.md` 2.10.4
and 2.10.9. Nothing is merged. Decisions W11–W17 are in [decisions.md](decisions.md).

## Approved so far

- Server and client halves; one server per run (W11). No injected endings (W12). `world` as option and step, controls as
  data (W13).
- `Fake` stands alone. A mocking library is optional: it goes inside a handler or a plain Layer (W17).
- Named Story constructors (W1), steps settle (W2), `HostTimeWait` (W4).

## The gaps this fills

From the dispatch desk and Checkout fakes (`../../../../dispatch-desk/REVIEW.md` gaps 32, 33, 36, 37, 38, and `route` notes
in the `testing/*.fake.ts` files; open item 28):

1. How a write or a control reaches open connections.
2. How a client half reads a stream, and what errors it sees.
3. Routing a web `Request` to an endpoint with its input.
4. Frames that stop after n got through.
5. Three result shapes (`[truth, response]`, and two for `open`).

## The proposal

```ts
export const Chat = Fake.server("Chat", {
  truth: { messages: Schema.Array(Message) },
  initial: { messages: [] },
  endpoints: {
    post: Fake.call({
      request: { text: Schema.String },
      handle: (truth, req) => ({                         // tuple -> object (W14)
        truth: { messages: [...truth.messages, req] },
        response: { ok: true, status: 201 },
        send: { socket: [JSON.stringify(req)] },         // NEW: frames for open connections
      }),
    }),
    socket: Fake.stream({
      request: { room: Schema.String },
      open: (truth) => ({                                // one object shape
        truth,
        frames: ['{"t":"hello"}'],
        accept: true,                                    // or { accept: false, code: 4403 }
      }),
    }),
  },
  controls: {
    expireToken: Fake.control({}, (truth) => ({
      truth,
      close: { socket: 4401 },                           // NEW: close, with a code
    })),
  },
})

// a client half reads a stream the way it makes a call
server.socket({ room: "r1" })   // NEW: Stream of frames, failing with Fake/Lost or Fake/Closed { code }

// routing
Fake.fetch(Stripe, {
  "POST /confirm/:intentId": {                            // NEW: a route table
    endpoint: "confirm",
    input: ({ params, headers, body }) => ({ intentId: params.intentId, key: headers.get("Idempotency-Key") ?? "" }),
  },
  "GET /products": { endpoint: "products" },
})
// a plain function, which may be async, stays for unusual cases

// partial streams
.world(Assistant.suggest.hold({ after: 2 }))              // NEW: two frames arrive, then silence
```

Not added: a server-level `pushes` observer (a shared helper in the fake avoids the repetition).

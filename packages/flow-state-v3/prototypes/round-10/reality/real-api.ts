// The fixtures' `Api` over real `fetch` and a real EventSource: what an author's adapter would be. Flow is not a network library, so this is
// the fixture's side of the seam. A write carries no signal (pay.contracts.ts): aborting our wait leaves it at the server. A read does.
import { Effect } from "effect";
import type { Api } from "../../conformance/fake-world.ts";
import { feedCallback } from "../../conformance/fixtures/compiled.ts";

const read = async (res: Response) => {
  if (res.status === 204) return undefined;
  return res.json(); // a dropped body rejects here, as a real network does
};
export const realApi = (): Api => {
  const call = (op: string, input: unknown, key?: string) =>
    Effect.tryPromise({
      try: async (signal) => {
        const res = await fetch(`/call/${op}`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(key ? { "idempotency-key": key } : {}),
          },
          body: JSON.stringify(input ?? null),
          ...(key ? {} : { signal }),
        });
        const body = await read(res);
        if (!res.ok) throw { refused: body };
        return body;
      },
      catch: (e: any) => (e?.refused ? e.refused : { _tag: "NoResponse", cause: String(e) }),
    });
  const api = {
    call: (op: string, input: unknown, o?: { idempotencyKey?: string }) =>
      call(op, input, o?.idempotencyKey),
    track: () => {
      throw new Error("not on a real server");
    },
    confirm: (i: unknown, o: { idempotencyKey: string }) => call("pay", i, o.idempotencyKey),
    placeOrder: (i: unknown, o: { idempotencyKey: string }) => call("place", i, o.idempotencyKey),
    voidAuthorization: (i: unknown, o: { idempotencyKey: string }) =>
      call("void", i, o.idempotencyKey),
    intent: (i: unknown) => call("intent", i),
    orderFor: (i: unknown) => call("order", i),
    socket: (op: string, _input: unknown, _from: unknown) =>
      feedCallback({
        start: (emit) => {
          const es = new EventSource(`/feed/${op}`);
          es.onmessage = (m) => void emit(JSON.parse(m.data));
          // EventSource would reconnect by itself. T1 says when; so it is closed and reported.
          es.onerror = () => {
            es.close();
            emit.fail({ _tag: "Closed" });
          };
          return () => es.close();
        },
      }),
    pulled: () => {
      throw new Error("not on a real server");
    },
    feed: () => {
      throw new Error("not on a real server");
    },
  };
  return api as unknown as Api;
};

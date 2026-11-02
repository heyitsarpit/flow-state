// A small real HTTP server, a check of reality and not a backend. Real sockets, real aborts, real ordering. Serves the page, Pay's and
// the desk's calls, one SSE feed. Idempotency per key: a replay answers what the first answered. Everything it did is in `journal`.
type J = { t: number; op: string; key?: string; what: string };
const rowOf = (id: string) => ({
  id,
  title: `title ${id}`,
  slug: `title ${id}`,
  archived: false,
  readAt: null as number | null,
  revision: 1,
});
export const startServer = (pageJs: string, port = 0) => {
  const fresh = () => ({
    journal: [] as J[],
    stored: new Map<string, { status: number; body: unknown }>(),
    bodyFor: new Map<string, string>(),
    charged: new Map<string, { intent: string; key: string }>(),
    voided: [] as string[],
    orders: new Map<string, string>(),
    tickets: { t1: rowOf("t1"), t2: rowOf("t2") } as Record<string, any>,
    delay: {} as Record<string, number>,
    drop: {} as Record<string, number>,
    reset: {} as Record<string, number>,
    acks: {} as Record<string, number>,
  });
  let S = fresh();
  const feeds = new Set<ReadableStreamDefaultController<Uint8Array>>();
  const enc = new TextEncoder();
  const sse = (v: unknown) => enc.encode(`data: ${JSON.stringify(v)}\n\n`);
  const broadcast = (v: unknown) => {
    for (const c of feeds)
      try {
        c.enqueue(sse(v));
      } catch {
        feeds.delete(c);
      }
  };
  const log = (op: string, what: string, key?: string) =>
    S.journal.push({ t: Date.now(), op, what, ...(key ? { key } : {}) });
  const json = (status: number, body: unknown) =>
    status === 204
      ? new Response(null, { status })
      : new Response(JSON.stringify(body ?? null), {
          status,
          headers: { "content-type": "application/json" },
        });
  const bump = (id: string, patch: object) => {
    const cur = S.tickets[id];
    if (!cur) return undefined;
    const r = { ...cur, ...patch, revision: cur.revision + 1 };
    S.tickets = { ...S.tickets, [id]: r };
    broadcast({ _tag: "TicketUpdated", ticket: r });
    return r;
  };
  // What a write does, once per key.
  const apply = (op: string, i: any, key: string): { status: number; body: unknown } => {
    switch (op) {
      case "pay": {
        if (i.paymentMethodId === "declined")
          return { status: 402, body: { _tag: "CardDeclined", code: "card_declined" } };
        S.charged.set(key, { intent: i.intentId, key });
        return {
          status: 200,
          body: { intentId: i.intentId, status: "requires_capture", clientSecret: "" },
        };
      }
      case "place": {
        const old = S.orders.get(i.cartId);
        if (old) return { status: 409, body: { _tag: "OrderExists", order: { orderId: old } } };
        const orderId = `o-${i.cartId}`;
        S.orders.set(i.cartId, orderId);
        return { status: 200, body: { orderId } };
      }
      case "void":
        S.voided.push(i.intentId);
        return { status: 204, body: null };
      case "archive":
        return bump(i.id, { archived: true })
          ? { status: 204, body: null }
          : { status: 409, body: { _tag: "Refused" } };
      case "markRead":
        for (const id of i.ids) bump(id, { readAt: i.at });
        return { status: 204, body: null };
      case "rename": {
        const r = bump(i.id, { title: i.title, slug: i.title.toLowerCase() });
        return r ? { status: 200, body: r } : { status: 409, body: { _tag: "Refused" } };
      }
      case "remove": {
        const cur = S.tickets[i.id];
        if (!cur) return { status: 409, body: { _tag: "Refused" } };
        const { [i.id]: _g, ...rest } = S.tickets;
        S.tickets = rest;
        broadcast({ _tag: "TicketRemoved", ticketId: i.id, revision: cur.revision + 1 });
        return { status: 204, body: null };
      }
      default:
        return { status: 400, body: { _tag: "NoSuchOp" } };
    }
  };
  const read = (op: string, i: any, snapshot: Record<string, any>) => {
    if (op === "list") return Object.values(snapshot);
    if (op === "repair") return snapshot[i.ref.split("|")[1]] ?? null;
    if (op === "intent") {
      const any = [...S.charged.values()].some((c) => c.intent === i.intentId);
      return { status: any ? "requires_capture" : "requires_payment_method" };
    }
    if (op === "order") {
      const id = S.orders.get(i.cartId);
      return id ? { orderId: id } : null;
    }
    return null;
  };
  const server = Bun.serve({
    port,
    hostname: "127.0.0.1",
    idleTimeout: 0,
    async fetch(req) {
      const u = new URL(req.url);
      if (u.pathname === "/")
        return new Response("<!doctype html><title>flow</title><script src='/page.js'></script>", {
          headers: { "content-type": "text/html" },
        });
      if (u.pathname === "/page.js")
        return new Response(pageJs, { headers: { "content-type": "text/javascript" } });
      if (u.pathname === "/favicon.ico") return new Response(null, { status: 204 });
      if (u.pathname === "/_ack") {
        const k = u.searchParams.get("k")!;
        S.acks[k] = Math.max(S.acks[k] ?? 0, Number(u.searchParams.get("n")));
        return new Response(null, { status: 204 });
      }
      if (u.pathname === "/_truth")
        return json(200, {
          journal: S.journal,
          charged: [...S.charged.values()],
          voided: S.voided,
          orders: [...S.orders],
          tickets: S.tickets,
          acks: S.acks,
          feeds: feeds.size,
        });
      if (u.pathname === "/_control") {
        const c = (await req.json()) as any;
        if (c.fresh) S = fresh();
        if (c.delay) S.delay = { ...S.delay, ...c.delay };
        if (c.drop) S.drop = { ...S.drop, ...c.drop };
        if (c.reset) S.reset = { ...S.reset, ...c.reset };
        if (c.other) bump(c.other.id, c.other.patch);
        if (c.closeFeeds) {
          for (const f of feeds) f.close();
          feeds.clear();
        }
        return json(200, {});
      }
      if (u.pathname.startsWith("/feed/")) {
        let ctl: ReadableStreamDefaultController<Uint8Array>;
        const body = new ReadableStream<Uint8Array>({
          start(c) {
            ctl = c;
            feeds.add(c);
            c.enqueue(sse({ _feed: "live" })); // no proof: T7's gap on every registration
          },
          cancel() {
            feeds.delete(ctl);
          },
        });
        return new Response(body, {
          headers: { "content-type": "text/event-stream", "cache-control": "no-store" },
        });
      }
      if (!u.pathname.startsWith("/call/")) return new Response("no", { status: 404 });
      const op = u.pathname.slice(6);
      const key = req.headers.get("idempotency-key") ?? undefined;
      const text = await req.text();
      const input = text ? JSON.parse(text) : undefined;
      log(op, "arrived", key);
      req.signal.addEventListener("abort", () => log(op, "client-aborted", key));
      const snapshot = S.tickets; // what this read's transaction would see
      const ms = S.delay[op] ?? 0;
      if (ms > 0) await Bun.sleep(ms);
      let answer: { status: number; body: unknown };
      if (key) {
        const prior = S.stored.get(key);
        if (prior) {
          if (S.bodyFor.get(key) !== text) log(op, "key-with-another-body", key);
          log(op, "replayed", key);
          answer = prior;
        } else {
          answer = apply(op, input, key);
          S.stored.set(key, answer);
          S.bodyFor.set(key, text);
          log(op, answer.status < 300 ? "applied" : `refused ${answer.status}`, key);
        }
      } else answer = { status: 200, body: read(op, input, snapshot) };
      if ((S.drop[op] ?? 0) > 0) {
        S.drop[op]!--;
        log(op, "response-dropped", key);
        // A connection that dies mid-body: some bytes out, then an error. `fetch` sees what a real network failure shows.
        return new Response(
          new ReadableStream({
            async start(c) {
              c.enqueue(enc.encode("{"));
              await Bun.sleep(10);
              c.error(new Error("dropped"));
            },
          }),
          { status: 200 },
        );
      }
      if ((S.reset[op] ?? 0) > 0) {
        // No byte of the response left: a reset. Chrome may send the POST again by itself, and did.
        S.reset[op]!--;
        log(op, "reset-before-any-byte", key);
        return new Response(
          new ReadableStream({
            pull(c) {
              c.error(new Error("reset"));
            },
          }),
          { status: 200 },
        );
      }
      log(op, `answered ${answer.status}`, key);
      return json(answer.status, answer.body);
    },
  });
  return { url: `http://127.0.0.1:${server.port}`, stop: () => server.stop(true) };
};

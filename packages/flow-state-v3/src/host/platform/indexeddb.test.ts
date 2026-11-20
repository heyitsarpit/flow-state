import { Effect, Exit, Option } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { type Connection, loadAll, writeBatch } from "./indexeddb.ts";

// A connection whose every transaction answers when committed: each request in turn by `outcomes`
// (success when unnamed), then the transaction completes, as Safari completes a transaction whose
// requests all failed in the back-forward cache. `commits` counts commit() calls, `begun`
// transactions.
const stubConnection = (outcomes: ReadonlyArray<"success" | "error">) => {
  const counts = { begun: 0, commits: 0 };

  const connection: Connection = {
    transaction: () => {
      counts.begun += 1;
      const heard = new Map<string, () => void>();
      const requests: Array<Map<string, () => void>> = [];

      const request = <A>(result: A) => {
        const own = new Map<string, () => void>();
        requests.push(own);

        return {
          addEventListener: (type: string, l: () => void) => void own.set(type, l),
          error: null,
          result,
        };
      };

      return {
        addEventListener: (type, listener) => void heard.set(type, listener),
        error: null,
        objectStore: () => ({
          put: () => request<IDBValidKey>("k"),
          delete: () => request(undefined),
          getAll: () => request<ReadonlyArray<string>>(["text"]),
          getAllKeys: () => request<ReadonlyArray<IDBValidKey>>([["app", "scope", "k"]]),
        }),
        commit: () => {
          counts.commits += 1;

          for (const [n, own] of requests.entries()) own.get(outcomes[n] ?? "success")?.();
          heard.get("complete")?.();
        },
      };
    },
  };

  return { connection, counts };
};

const place = { app: "app", scope: "scope" };

const writes = [
  { key: "a", value: Option.some("1") },
  { key: "b", value: Option.none() },
];

describe("the IndexedDB adapter's answers (WriteAhead R12; Safari D1)", () => {
  it("WriteAhead R12: a batch whose every request succeeded and whose transaction completed lands", async () => {
    const { connection } = stubConnection([]);

    expect(Exit.isSuccess(await Effect.runPromiseExit(writeBatch(connection, place, writes)))).toBe(
      true,
    );
  });

  it("WriteAhead R12: a batch with a failed request is refused even when its transaction completes", async () => {
    const { connection } = stubConnection(["success", "error"]);
    const exit = await Effect.runPromiseExit(writeBatch(connection, place, writes));

    expect(Exit.isFailure(exit)).toBe(true);
  });
});

describe("every transaction commits at once (Safari D3)", () => {
  it("Safari D3: a write and a load each call commit(), one per transaction", () => {
    Object.defineProperty(globalThis, "IDBKeyRange", {
      configurable: true,
      value: { bound: () => ({}) },
    });
    const { connection, counts } = stubConnection([]);

    // oxlint-disable-next-line lint-bomb/no-effect-runner-in-domain -- the stub answers inside commit(), so an uncommitted transaction fails at once
    Effect.runSync(writeBatch(connection, place, writes));

    // Node has no IDBKeyRange: the load's range is a stand-in there, removed once it ran.
    // oxlint-disable-next-line lint-bomb/no-effect-runner-in-domain -- the stub answers inside commit(), so an uncommitted transaction fails at once
    const loaded = Effect.runSync(
      loadAll(connection, place).pipe(
        Effect.ensuring(Effect.sync(() => Reflect.deleteProperty(globalThis, "IDBKeyRange"))),
      ),
    );

    expect(counts).toEqual({ begun: 2, commits: 2 });
    expect([...loaded]).toEqual([["k", "text"]]);
  });
});

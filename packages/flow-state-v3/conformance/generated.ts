import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Option, Schema } from "effect";
import { type Alphabet, exhaustive, seeded } from "./dsl/generate.ts";
import { Script, scenarioOf } from "./dsl/script.ts";
import { Serialize } from "./fixtures/one-lane.ts";
import { Cells, Pay } from "./fixtures/pay.ts";

const ok = (value: Schema.Json) => ({ _tag: "ok" as const, value });

/**
 * Pay's persistence alphabet: a shopper who starts a cart, pays, leaves, is released, disposed or
 * forgotten, and whose world acks, answers, loses answers, waits, reloads and disposes the Runtime
 * (WriteAhead, Restore, WriteLanes R8, R14, Actors R20 to R22).
 */
export const payAlphabet: Alphabet = {
  fixture: "pay",
  actor: "shopper-1",
  prefix: [
    { _tag: "ensure" },
    { _tag: "send", event: "Start", payload: { cartId: "c1", intentId: "pi1" } },
  ],
  steps: [
    [
      [
        { _tag: "send", event: "PayRequested", payload: { paymentMethodId: "visa" } },
        { _tag: "ack" },
      ],
      4,
    ],
    [[{ _tag: "send", event: "PayRequested", payload: { paymentMethodId: "visa" } }], 1],
    [[{ _tag: "send", event: "Leave", payload: {} }, { _tag: "ack" }], 1],
    [[{ _tag: "ack" }], 5],
    [
      [
        {
          _tag: "answer",
          operation: "pay",
          answer: ok({ status: "requires_capture", clientSecret: "" }),
        },
      ],
      2,
    ],
    [[{ _tag: "answer", operation: "pay", answer: { _tag: "lost" } }], 3],
    [
      [
        {
          _tag: "answer",
          operation: "pay",
          answer: { _tag: "fail", tag: "Busy", fields: { retryAfterMs: 1000 } },
        },
      ],
      1,
    ],
    [[{ _tag: "answer", operation: "place", answer: ok({ orderId: "o1" }) }], 2],
    [[{ _tag: "answer", operation: "place", answer: { _tag: "lost" } }], 1],
    [[{ _tag: "answer", operation: "void", answer: ok({}) }], 1],
    [[{ _tag: "answer", operation: "void", answer: { _tag: "lost" } }], 1],
    [[{ _tag: "answer", operation: "intent", answer: ok({ status: "requires_capture" }) }], 1],
    [
      [{ _tag: "answer", operation: "intent", answer: ok({ status: "requires_payment_method" }) }],
      1,
    ],
    [[{ _tag: "answer", operation: "order", answer: ok({ orderId: "o1" }) }], 1],
    [[{ _tag: "answer", operation: "order", answer: ok(null) }], 1],
    [[{ _tag: "advance", ms: 3000 }], 2],
    [[{ _tag: "advance", ms: 8000 }], 1],
    [[{ _tag: "reload" }], 3],
    [[{ _tag: "ensure" }], 2],
    [[{ _tag: "release" }], 1],
    [[{ _tag: "dispose" }], 1],
    [[{ _tag: "forget" }], 1],
    [[{ _tag: "disposeRuntime" }], 0.5],
    [
      [
        { _tag: "answer", operation: "pay", answer: { _tag: "lost" } },
        { _tag: "ack" },
        { _tag: "reload" },
      ],
      2,
    ],
    [[{ _tag: "disposeRuntime" }, { _tag: "advance", ms: 5000 }, { _tag: "reload" }], 1],
    [[{ _tag: "dispose" }, { _tag: "reload" }, { _tag: "ensure" }], 1],
    [[{ _tag: "forget" }, { _tag: "reload" }, { _tag: "ensure" }], 1],
    [[{ _tag: "release" }, { _tag: "advance", ms: 1000 }], 1],
    [[{ _tag: "release" }, { _tag: "advance", ms: 1000 }, { _tag: "ensure" }], 1],
    [[{ _tag: "advance", ms: 1000 }], 1],
    [
      [
        { _tag: "send", event: "PayRequested", payload: { paymentMethodId: "visa" } },
        { _tag: "ack" },
        { _tag: "reload" },
        { _tag: "advance", ms: 3000 },
        { _tag: "answer", operation: "order", answer: ok(null) },
        { _tag: "answer", operation: "intent", answer: ok({ status: "requires_payment_method" }) },
        { _tag: "ack" },
        {
          _tag: "answer",
          operation: "pay",
          answer: { _tag: "fail", tag: "CardDeclined", fields: { code: "x" } },
        },
      ],
      1,
    ],
    [
      [
        { _tag: "send", event: "PayRequested", payload: { paymentMethodId: "visa" } },
        { _tag: "ack" },
        {
          _tag: "answer",
          operation: "pay",
          answer: { _tag: "fail", tag: "Busy", fields: { retryAfterMs: 500 } },
        },
        { _tag: "advance", ms: 499 },
        { _tag: "advance", ms: 1 },
      ],
      1,
    ],
    [
      [
        { _tag: "dispose" },
        {
          _tag: "answer",
          operation: "pay",
          answer: ok({ status: "requires_capture", clientSecret: "" }),
        },
        { _tag: "ensure" },
      ],
      1,
    ],
    [
      [
        { _tag: "answer", operation: "pay", answer: { _tag: "lost" } },
        { _tag: "advance", ms: 3000 },
        { _tag: "answer", operation: "order", answer: ok(null) },
        { _tag: "answer", operation: "intent", answer: ok({ status: "requires_action" }) },
      ],
      1,
    ],
    [
      [
        { _tag: "answer", operation: "pay", answer: { _tag: "lost" } },
        ...[1, 2, 3, 4].flatMap(() => [
          { _tag: "advance" as const, ms: 3000 },
          { _tag: "answer" as const, operation: "order", answer: ok(null) },
          {
            _tag: "answer" as const,
            operation: "intent",
            answer: ok({ status: "requires_payment_method" }),
          },
          { _tag: "ack" as const },
          { _tag: "answer" as const, operation: "pay", answer: { _tag: "lost" as const } },
        ]),
      ],
      1,
    ],
    [
      [500, 500, 500].flatMap((retryAfterMs) => [
        {
          _tag: "answer" as const,
          operation: "pay",
          answer: { _tag: "fail" as const, tag: "Busy", fields: { retryAfterMs } },
        },
        { _tag: "advance" as const, ms: 600 },
        { _tag: "ack" as const },
      ]),
      1,
    ],
    [
      [
        { _tag: "disposeRuntime" },
        {
          _tag: "answer",
          operation: "pay",
          answer: ok({ status: "requires_capture", clientSecret: "" }),
        },
        { _tag: "advance", ms: 5000 },
        { _tag: "reload" },
      ],
      1,
    ],
    [
      [
        { _tag: "answer", operation: "pay", answer: { _tag: "lost" } },
        { _tag: "ack" },
        { _tag: "answer", operation: "intent", answer: ok({ status: "requires_payment_method" }) },
      ],
      1,
    ],
    [
      [
        {
          _tag: "answer",
          operation: "pay",
          answer: { _tag: "fail", tag: "Busy", fields: { retryAfterMs: 1000 } },
        },
        { _tag: "advance", ms: 1000 },
        { _tag: "ack" },
      ],
      1,
    ],
  ],
};

/**
 * Serialize's alphabet: one unkeyed `serialize` lane, `put`, whose commits queue behind its head,
 * sent, answered, cancelled together (`All`), across a reload and the Runtime's disposal
 * (WriteLanes R8, Actors R22).
 */
export const serializeAlphabet: Alphabet = {
  fixture: "serialize",
  actor: "p1",
  prefix: [{ _tag: "ensure" }],
  steps: [
    [[{ _tag: "send", event: "Go", payload: { n: 1 } }, { _tag: "ack" }], 4],
    [[{ _tag: "send", event: "Go", payload: { n: 2 } }], 2],
    [[{ _tag: "ack" }], 3],
    [[{ _tag: "answer", operation: "put", answer: ok({}) }], 3],
    [[{ _tag: "answer", operation: "put", answer: { _tag: "lost" } }], 2],
    [[{ _tag: "send", event: "All", payload: {} }], 1],
    [[{ _tag: "advance", ms: 3000 }], 1],
    [[{ _tag: "reload" }], 2],
    [[{ _tag: "disposeRuntime" }, { _tag: "advance", ms: 6000 }, { _tag: "reload" }], 2],
    [[{ _tag: "release" }, { _tag: "advance", ms: 1000 }], 1],
    [[{ _tag: "ensure" }], 1],
  ],
};

/**
 * Cells' alphabet: Pay's, with `AbortPay`, which cancels `pay` (WriteLanes R14).
 */
export const cellsAlphabet: Alphabet = {
  ...payAlphabet,
  fixture: "cells",
  steps: [...payAlphabet.steps, [[{ _tag: "send", event: "AbortPay", payload: {} }], 2]],
};

const REGRESSIONS = join(dirname(fileURLToPath(import.meta.url)), "regressions");

/**
 * A regression file: its script and the failure signature it was saved with (`by`, the oracles and
 * Invariants, or the defect's message), which its replay must match.
 */
const Regression = Schema.Struct({ ...Script.fields, by: Schema.optionalKey(Schema.String) });

/**
 * The shrunk regression scripts the generators found (T32), one JSON file each in `regressions/`.
 */
export const regressionFiles = readdirSync(REGRESSIONS)
  .filter((f) => f.endsWith(".json"))
  .toSorted()
  .map((f) => {
    const path = join(REGRESSIONS, f);
    const decoded = Schema.decodeUnknownSync(Regression)(JSON.parse(readFileSync(path, "utf8")));
    const { by, ...script } = decoded;

    return { path, script, by: Option.fromUndefinedOr(by) };
  });

/**
 * The shrunk scripts alone, as the generated set plays them.
 */
export const regressionScripts = regressionFiles.map((r) => r.script);

/**
 * Every generated script, in run order: the small exhaustive search, the seeded runs, and the
 * regressions they left.
 */
export const generatedScripts = [
  ...exhaustive(payAlphabet, 2),
  ...seeded(payAlphabet, 1, 300, 8),
  ...seeded(cellsAlphabet, 1001, 100, 8),
  ...seeded(serializeAlphabet, 2001, 100, 8),
  ...regressionScripts,
];

/**
 * The generated scripts as cases the runner plays (`suite --generated`), judged by the oracles
 * alone.
 */
export const generatedScenarios = generatedScripts.map((s) =>
  scenarioOf(s, [Pay, Cells, Serialize]),
);

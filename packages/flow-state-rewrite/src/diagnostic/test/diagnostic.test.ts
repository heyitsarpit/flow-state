import { assert, describe, it } from "@effect/vitest";
import { Cause, Effect, Exit, Result, Schema } from "effect";

import * as Diagnostic from "../diagnostic.js";

describe("diagnostic", () => {
  it("exposes the exact Code schema and derived type", () => {
    const code: Diagnostic.Code = "Panic";
    assert.strictEqual(code, "Panic");
    assert.deepStrictEqual(Diagnostic.Code.literals, [
      "InvalidMachineConfiguration",
      "SchemaValidation",
      "Panic",
    ]);

    for (const expected of Diagnostic.Code.literals) {
      const accepted = Schema.decodeUnknownResult(Diagnostic.Code)(expected);
      assert.ok(Result.isSuccess(accepted));
      if (Result.isSuccess(accepted)) assert.strictEqual(accepted.success, expected);
    }

    const rejected = Schema.decodeUnknownResult(Diagnostic.Code)("UnknownCode");
    assert.ok(Result.isFailure(rejected));
  });

  it("is a native Error and Schema.TaggedError with stable fields", () => {
    const error = new Diagnostic.Error({
      code: "InvalidMachineConfiguration",
      path: ["states", "ready"],
      details: { reason: "ExpectedFunction", index: 2 },
      summary: "Invalid machine configuration",
      help: "Provide a function.",
    });
    const expected = {
      _tag: "Diagnostic",
      code: "InvalidMachineConfiguration",
      path: ["states", "ready"],
      details: { reason: "ExpectedFunction", index: 2 },
      summary: "Invalid machine configuration",
      help: "Provide a function.",
    } as const;

    assert.ok(error instanceof globalThis.Error);
    assert.ok(error instanceof Diagnostic.Error);
    assert.strictEqual(error._tag, "Diagnostic");
    assert.strictEqual(Diagnostic.Error.identifier, "Diagnostic");
    assert.deepStrictEqual(Schema.encodeSync(Diagnostic.Error)(error), expected);

    const decoded = Schema.decodeUnknownSync(Diagnostic.Error)(expected);
    assert.ok(decoded instanceof Diagnostic.Error);
    assert.deepStrictEqual(
      {
        _tag: decoded._tag,
        code: decoded.code,
        path: decoded.path,
        details: decoded.details,
        summary: decoded.summary,
        help: decoded.help,
      },
      expected,
    );
    assert.strictEqual(error.message, Diagnostic.print(error));
    assert.strictEqual(error.toString(), Diagnostic.print(error));
  });

  it.effect("carries Error in Result and as a directly yieldable Effect failure", () => {
    const error = new Diagnostic.Error({
      code: "SchemaValidation",
      path: ["input"],
      details: { issue: "InvalidType" },
      summary: "Schema validation failed",
      help: "Fix the input.",
    });
    const failed: Diagnostic.Result<never> = Result.fail(error);
    assert.ok(Result.isFailure(failed));
    if (Result.isFailure(failed)) assert.strictEqual(failed.failure, error);

    return Effect.gen(function* () {
      yield* error;
      return "unreachable";
    }).pipe(
      Effect.flip,
      Effect.map((failure) => assert.strictEqual(failure, error)),
    );
  });

  it("renders exact paths, escaped text, and ordered details", () => {
    const error = new Diagnostic.Error({
      code: "SchemaValidation",
      path: ["users", 0, "name", "line\n", "\u200b"],
      details: { z: "last\t", a: "first\n" },
      summary: "Invalid\nvalue\u200b",
      help: "Use\tfield\u2028",
    });

    assert.strictEqual(
      Diagnostic.print(error),
      'SchemaValidation: Invalid\\nvalue\\u200b\n  at $.users[0].name["line\\n"]["\\u200b"]\n  details:\n    a: "first\\n"\n    z: "last\\t"\n  help: Use\\tfield\\u2028',
    );
  });

  it("projects nested schema failures with their path and issue", () => {
    const schema = Schema.Struct({
      users: Schema.Array(Schema.Struct({ name: Schema.String })),
    });
    const decoded = Schema.decodeUnknownResult(schema)({ users: [{ name: 42 }] });

    assert.ok(Result.isFailure(decoded));
    if (Result.isFailure(decoded)) {
      const diagnostic = Diagnostic.fromSchemaError(decoded.failure);
      assert.deepStrictEqual(
        {
          code: diagnostic.code,
          path: diagnostic.path,
          details: diagnostic.details,
          summary: diagnostic.summary,
          help: diagnostic.help,
        },
        {
          code: "SchemaValidation",
          path: ["users", 0, "name"],
          details: { issue: "Composite" },
          summary: "Schema validation failed",
          help: "Fix the value at the reported path.",
        },
      );
    }
  });

  it("preserves nested symbol-keyed schema paths in the rendered diagnostic", () => {
    const outer = Symbol("outer");
    const inner = Symbol("inner");
    const schema = Schema.Struct({
      [outer]: Schema.Struct({ [inner]: Schema.String }),
    });
    const decoded = Schema.decodeUnknownResult(schema)({ [outer]: { [inner]: 42 } });

    assert.ok(Result.isFailure(decoded));
    if (Result.isFailure(decoded)) {
      const diagnostic = Diagnostic.fromSchemaError(decoded.failure);
      assert.deepStrictEqual(diagnostic.path, [String(outer), String(inner)]);
      assert.strictEqual(
        Diagnostic.print(diagnostic),
        'SchemaValidation: Schema validation failed\n  at $["Symbol(outer)"]["Symbol(inner)"]\n  details:\n    issue: "Composite"\n  help: Fix the value at the reported path.',
      );
    }
  });

  it("keeps Panic safe, generic, and outside the encoded fields", () => {
    const defect = { token: Symbol() };
    const panic = Diagnostic.panic(defect);
    const encoded = Schema.encodeSync(Diagnostic.Error)(panic);

    assert.strictEqual(panic.code, "Panic");
    assert.deepStrictEqual(panic.path, []);
    assert.deepStrictEqual(panic.details, {});
    assert.strictEqual(panic.cause, defect);
    assert.strictEqual(Object.prototype.propertyIsEnumerable.call(panic, "cause"), false);
    assert.deepStrictEqual(encoded, {
      _tag: "Diagnostic",
      code: "Panic",
      path: [],
      details: {},
      summary: "Unexpected runtime defect",
      help: "Inspect the original cause at the host boundary.",
    });
    assert.strictEqual(
      Diagnostic.print(panic),
      "Panic: Unexpected runtime defect\n  at $\n  help: Inspect the original cause at the host boundary.",
    );
  });

  it.effect("preserves typed failures, defects, and interruption in Cause", () => {
    const typed = new Diagnostic.Error({
      code: "SchemaValidation",
      path: [],
      details: {},
      summary: "typed",
      help: "help",
    });
    const defect = new globalThis.Error("unexpected");

    return Effect.gen(function* () {
      const typedExit = yield* Effect.exit(Diagnostic.catchPanic(Effect.fail(typed)));
      const defectExit = yield* Effect.exit(
        Diagnostic.catchPanic(
          Effect.sync(() => {
            // oxlint-disable-next-line anti-slop/no-throw-in-effect-gen -- this fixture creates a defect for catchPanic.
            throw defect;
          }),
        ),
      );
      const diedExit = yield* Effect.exit(Diagnostic.catchPanic(Effect.die(defect)));
      const mixedCause = Cause.combine(Cause.fail(typed), Cause.die(defect));
      const mixedExit = yield* Effect.exit(Diagnostic.catchPanic(Effect.failCause(mixedCause)));
      const interrupted = yield* Effect.exit(Diagnostic.catchPanic(Effect.interrupt));

      assert.ok(Exit.isFailure(typedExit));
      if (Exit.isFailure(typedExit)) {
        const typedFailure = typedExit.cause.reasons.find(Cause.isFailReason);
        assert.strictEqual(typedFailure?.error, typed);
        assert.strictEqual(Cause.hasDies(typedExit.cause), false);
      }

      assert.ok(Exit.isFailure(defectExit));
      if (Exit.isFailure(defectExit)) {
        assert.ok(Cause.hasDies(defectExit.cause));
        const defectFailure = Cause.findDefect(defectExit.cause);
        assert.ok(Result.isSuccess(defectFailure));
        if (Result.isSuccess(defectFailure)) assert.strictEqual(defectFailure.success, defect);
      }

      assert.ok(Exit.isFailure(diedExit));
      if (Exit.isFailure(diedExit)) {
        assert.ok(Cause.hasDies(diedExit.cause));
        const diedFailure = Cause.findDefect(diedExit.cause);
        assert.ok(Result.isSuccess(diedFailure));
        if (Result.isSuccess(diedFailure)) assert.strictEqual(diedFailure.success, defect);
      }

      assert.ok(Exit.isFailure(mixedExit));
      if (Exit.isFailure(mixedExit)) {
        assert.deepStrictEqual(mixedExit.cause.reasons, mixedCause.reasons);
        assert.strictEqual(mixedExit.cause.reasons.find(Cause.isFailReason)?.error, typed);
        assert.strictEqual(mixedExit.cause.reasons.find(Cause.isDieReason)?.defect, defect);
      }

      assert.ok(Exit.isFailure(interrupted));
      assert.ok(Exit.hasInterrupts(interrupted));
      assert.strictEqual(Exit.hasDies(interrupted), false);
    });
  });
});

import { assert, describe, it } from "@effect/vitest";
import { Cause, Effect, Exit, Result, Schema, SchemaIssue, Stream } from "effect";

import {
  executeOperationProgram,
  isConstructedOperation,
  isOperationPlanForDescriptor,
  readOperationAdapter,
} from "../operation.js";
import { resource } from "../resource.js";
import { stream } from "../stream.js";
import { transaction } from "../transaction.js";
import { firstConfigurationField } from "../configuration.js";
import type { CanonicalKeyInput } from "../key.js";
import type { OperationOptions, OperationProgram } from "../operation.js";

/*
 * Proof organization:
 *
 * Fixtures and local builders
 * Type relationships and negative authoring cases
 * Behavior suites grouped by observable law
 *
 * Mutable setup remains local to its scenario.
 */

type ProjectInput = { readonly id: string };

type ParameterlessAdapter = (
  options: OperationOptions,
) => OperationProgram<{ readonly refreshed: boolean }, never, never>;

// RETURN_TYPE: Predicate return narrows retained adapters to the parameterless callable shape before invocation.
const isParameterlessAdapter = (value: unknown): value is ParameterlessAdapter =>
  typeof value === "function";

const expectInvalidOperation = (construct: () => void) => {
  let error: unknown;
  try {
    construct();
  } catch (cause) {
    error = cause;
  }
  assert.strictEqual(error instanceof TypeError, true);
};

const expectInvalidOperationMessage = (construct: () => void, message: string) => {
  let error: unknown;
  try {
    construct();
  } catch (cause) {
    error = cause;
  }
  assert.strictEqual(error instanceof TypeError, true);
  if (error instanceof TypeError) assert.strictEqual(error.message, message);
};

describe("operation declarations", () => {
  describe("execution and deferred ownership", () => {
    it("projects the first field through nested schema issues", () => {
      const leaf = new SchemaIssue.InvalidType(Schema.String.ast);
      const first = new SchemaIssue.Pointer(["first", 0], leaf);
      const second = new SchemaIssue.Pointer(["second"], leaf);
      const ordered = new SchemaIssue.Composite(Schema.String.ast, [leaf, second]);
      const nested = new SchemaIssue.Encoding(
        Schema.String.ast,
        new SchemaIssue.Composite(Schema.String.ast, [first, second]),
      );
      const empty = new SchemaIssue.Composite(Schema.String.ast, [leaf]);
      Object.defineProperty(empty, "issues", { value: [] });

      assert.strictEqual(firstConfigurationField(nested), "first");
      assert.strictEqual(firstConfigurationField(ordered), undefined);
      assert.strictEqual(firstConfigurationField(new SchemaIssue.Pointer([], leaf)), undefined);
      assert.strictEqual(
        firstConfigurationField(new SchemaIssue.Pointer([Symbol("field")], leaf)),
        undefined,
      );
      assert.strictEqual(firstConfigurationField(empty), undefined);
    });

    it.effect("executes direct and Effect programs at the execution boundary", () => {
      const signal = new AbortController().signal;
      const options = { signal };
      const expectedFailure = { kind: "expected" } as const;
      const expectedDefect = new Error("unexpected");
      let directCalls = 0;
      let effectCalls = 0;

      // RETURN_TYPE: Preserves the direct-program channels expected by the execution-boundary proof.
      const directAdapter = (
        _input: string,
        _options: OperationOptions,
      ): OperationProgram<number, never, never> => {
        directCalls += 1;
        return 7;
      };
      const effectAdapter = (_input: string, _options: OperationOptions) => {
        effectCalls += 1;
        return Effect.succeed(11);
      };
      const failureAdapter = (_input: string, _options: OperationOptions) =>
        Effect.fail(expectedFailure);
      // RETURN_TYPE: Preserves never success/error/requirements channels while the fixture proves sync throws become defects.
      const defectAdapter = (
        _input: string,
        _options: OperationOptions,
      ): OperationProgram<never, never, never> => {
        // oxlint-disable-next-line anti-slop/no-throw-in-effect-gen -- this adapter fixture proves sync throws become defects.
        throw expectedDefect;
      };
      const direct = executeOperationProgram(() => directAdapter("project-1", options));
      const effect = executeOperationProgram(() => effectAdapter("project-1", options));
      const failure = executeOperationProgram(() => failureAdapter("project-1", options));
      const defect = executeOperationProgram(() => defectAdapter("project-1", options));

      assert.strictEqual(directCalls, 0);
      assert.strictEqual(effectCalls, 0);
      return Effect.gen(function* () {
        assert.strictEqual(yield* direct, 7);
        assert.strictEqual(yield* effect, 11);
        assert.strictEqual(directCalls, 1);
        assert.strictEqual(effectCalls, 1);

        const failureExit = yield* Effect.exit(failure);
        assert.ok(Exit.isFailure(failureExit));
        if (Exit.isFailure(failureExit)) {
          const failureReason = failureExit.cause.reasons.find(Cause.isFailReason);
          assert.strictEqual(failureReason?.error, expectedFailure);
        }

        const defectExit = yield* Effect.exit(defect);
        assert.ok(Exit.isFailure(defectExit));
        if (Exit.isFailure(defectExit)) {
          const defectResult = Cause.findDefect(defectExit.cause);
          assert.ok(Result.isSuccess(defectResult));
          if (Result.isSuccess(defectResult))
            assert.strictEqual(defectResult.success, expectedDefect);
        }
      });
    });

    it.effect("executes a retained Resource adapter lazily", () => {
      let lookupCalls = 0;
      let receivedParams: ProjectInput | undefined;
      let receivedOptions: OperationOptions | undefined;
      const lookup = (params: ProjectInput, options: OperationOptions) => {
        lookupCalls += 1;
        receivedParams = params;
        receivedOptions = options;
        return params.id.length;
      };
      const project = resource({
        id: "projects.lazy-resource",
        key: (params: ProjectInput) => [params.id] as const,
        lookup,
      });
      const storedAdapter = readOperationAdapter(project);
      // RETURN_TYPE: Predicate return narrows the stored adapter to the captured Resource lookup callable before invocation.
      const isLookup = (value: unknown): value is typeof lookup => value === lookup;
      const options = { signal: new AbortController().signal };

      assert.ok(isLookup(storedAdapter));
      if (!isLookup(storedAdapter)) throw new Error("Resource adapter was not retained");
      const program = executeOperationProgram<number, never, never>(() =>
        storedAdapter({ id: "project-1" }, options),
      );
      assert.strictEqual(lookupCalls, 0);
      return Effect.gen(function* () {
        assert.strictEqual(yield* program, 9);
        assert.strictEqual(lookupCalls, 1);
        assert.deepStrictEqual(receivedParams, { id: "project-1" });
        assert.strictEqual(receivedOptions, options);
      });
    });

    it.effect("preserves an authored parameterless adapter for thunk execution", () => {
      let receivedOptions: OperationOptions | undefined;
      const authoredAdapter: ParameterlessAdapter = (options: OperationOptions) => {
        receivedOptions = options;
        return { refreshed: true };
      };
      const refresh = transaction({
        id: "projects.runtime-refresh",
        commit: authoredAdapter,
        persist: true,
        concurrency: "serialize",
      });
      const storedAdapter = readOperationAdapter(refresh);
      assert.strictEqual(storedAdapter, authoredAdapter);
      assert.ok(isParameterlessAdapter(storedAdapter));
      if (!isParameterlessAdapter(storedAdapter)) return Effect.void;
      const options = { signal: new AbortController().signal };
      assert.deepStrictEqual(refresh.key(undefined), []);
      assert.deepStrictEqual(refresh.commit(undefined).key, []);
      assert.strictEqual(refresh.persist, true);
      assert.strictEqual(refresh.concurrency, "serialize");
      return Effect.gen(function* () {
        const refreshed = yield* executeOperationProgram(() => storedAdapter(options));
        assert.deepStrictEqual(refreshed, { refreshed: true });
        assert.strictEqual(receivedOptions, options);
      });
    });

    it.effect("preserves a keyed adapter with a default-parameter key projector", () => {
      const defaultParams = { id: "default" } as const;
      const options = { signal: new AbortController().signal };
      let receivedParams: ProjectInput | undefined;
      let receivedOptions: OperationOptions | undefined;
      // RETURN_TYPE: Preserves the authored keyed transaction's OperationProgram success channel while accepting optional input for default-key invocation.
      const authoredAdapter = (
        params: ProjectInput | undefined,
        adapterOptions: OperationOptions,
      ): OperationProgram<ProjectInput, never, never> => {
        receivedParams = params;
        receivedOptions = adapterOptions;
        return params ?? defaultParams;
      };
      const projectKey = (params: ProjectInput = defaultParams) => [params.id] as const;
      const save = transaction({
        id: "projects.runtime-keyed",
        key: projectKey,
        commit: authoredAdapter,
      });
      const storedAdapter = readOperationAdapter(save);
      // RETURN_TYPE: Predicate return preserves the exact authored adapter function type required for stored-adapter invocation.
      const isAuthoredAdapter = (value: unknown): value is typeof authoredAdapter =>
        value === authoredAdapter;

      assert.strictEqual(storedAdapter, authoredAdapter);
      assert.ok(isAuthoredAdapter(storedAdapter));
      if (!isAuthoredAdapter(storedAdapter)) return Effect.void;
      assert.deepStrictEqual(save.key({ id: "project-1" }), ["project-1"]);
      return Effect.gen(function* () {
        const result = yield* executeOperationProgram(() =>
          storedAdapter({ id: "project-1" }, options),
        );
        assert.deepStrictEqual(result, { id: "project-1" });
        assert.deepStrictEqual(receivedParams, { id: "project-1" });
        assert.strictEqual(receivedOptions, options);
      });
    });

    it("retain adapters without executing them during construction or planning", () => {
      let lookupCalls = 0;
      const lookup = (params: ProjectInput, _options: OperationOptions) => {
        lookupCalls += 1;
        return Effect.succeed({ id: params.id });
      };
      const project = resource({
        id: "projects.by-id",
        key: (params: ProjectInput) => [params.id] as const,
        lookup,
      });

      assert.strictEqual(lookupCalls, 0);
      const lookupOptions = {};
      const subscribeOptions = {};
      const refetchOptions = {};
      const plan = project.lookup({ id: "project-1" }, lookupOptions);
      const subscribePlan = project.subscribe({ id: "project-1" }, subscribeOptions);
      const refetchPlan = project.refetch({ id: "project-1" }, refetchOptions);
      assert.strictEqual(lookupCalls, 0);
      assert.deepStrictEqual(plan.key, ["project-1"]);
      assert.strictEqual(plan.options, lookupOptions);
      assert.strictEqual(subscribePlan.options, subscribeOptions);
      assert.strictEqual(refetchPlan.options, refetchOptions);
      assert.deepStrictEqual(
        project.lookup({ id: "project-1" }),
        project.lookup({ id: "project-1" }, undefined),
      );
      assert.deepStrictEqual(
        project.subscribe({ id: "project-1" }),
        project.subscribe({ id: "project-1" }, undefined),
      );
      assert.deepStrictEqual(
        project.refetch({ id: "project-1" }),
        project.refetch({ id: "project-1" }, undefined),
      );
      const write = project.setData(["project-1"], { id: "project-1" });
      const cancellation = project.cancel(["project-1"]);
      assert.strictEqual(write.descriptor, "projects.by-id");
      assert.strictEqual(write.family, "resource");
      assert.strictEqual(cancellation.descriptor, "projects.by-id");
      assert.strictEqual(cancellation.family, "resource");
      assert.deepStrictEqual(project.getData(["project-1"]), undefined);
      assert.deepStrictEqual(project.getState(["project-1"]), {
        status: "missing",
        key: ["project-1"],
      });
      assert.strictEqual("staleTime" in project, false);
      assert.strictEqual("gcTime" in project, false);

      const configuredProject = resource({
        id: "projects.configured",
        key: (params: ProjectInput) => [params.id] as const,
        lookup,
        staleTime: 1_000,
        gcTime: 2_000,
        persist: true,
      });
      assert.strictEqual(configuredProject.staleTime, 1_000);
      assert.strictEqual(configuredProject.gcTime, 2_000);
      assert.strictEqual(configuredProject.persist, true);
    });
  });

  describe("declaration admission and precedence", () => {
    it("admits only constructed descriptor identities", () => {
      const constructed = resource({
        id: "projects.identity",
        key: (projectId: string) => [projectId] as const,
        lookup: (projectId: string) => Effect.succeed(projectId),
      });
      const forged = { ...constructed };
      const structural = { kind: "resource", id: constructed.id };

      assert.strictEqual(isConstructedOperation(constructed), true);
      assert.strictEqual(isConstructedOperation(forged), false);
      assert.strictEqual(isConstructedOperation(structural), false);

      const plan = constructed.subscribe("project-1");
      const sameIdForeign = resource({
        id: constructed.id,
        key: (projectId: string) => [projectId] as const,
        lookup: (projectId: string) => Effect.succeed(projectId),
      });
      assert.strictEqual(isOperationPlanForDescriptor(plan, constructed), true);
      assert.strictEqual(isOperationPlanForDescriptor(plan, sameIdForeign), false);
      assert.strictEqual(isOperationPlanForDescriptor({ ...plan }, constructed), false);
    });

    it("rejects malformed constructor inputs synchronously", () => {
      const key = (id: string) => [id] as const;
      const lookup = (id: string, _options: OperationOptions) => Effect.succeed(id);
      const commit = (_options: OperationOptions) => Effect.succeed(true);
      const subscribe = (id: string, _options: OperationOptions) => Stream.make(id);
      const malformedResource = {
        id: "projects.invalid-resource",
        key,
        lookup,
      };
      Object.defineProperty(malformedResource, "lookup", { value: undefined });
      const malformedTransaction = {
        id: "projects.invalid-transaction",
        commit,
      };
      Object.defineProperty(malformedTransaction, "commit", { value: undefined });
      const malformedStream = {
        id: "projects.invalid-stream",
        key,
        subscribe,
      };
      Object.defineProperty(malformedStream, "subscribe", { value: undefined });
      const malformedKeyedTransaction = {
        id: "projects.invalid-key",
        commit,
      };
      Object.defineProperty(malformedKeyedTransaction, "key", { value: undefined });
      const malformedCallbacks: ReadonlyArray<() => void> = [
        () => resource(malformedResource),
        () => transaction(malformedTransaction),
        () => stream(malformedStream),
        () => transaction(malformedKeyedTransaction),
      ];

      for (const construct of malformedCallbacks) expectInvalidOperation(construct);
      const malformedId = {
        id: "projects.invalid-id",
        key,
        lookup,
      };
      Object.defineProperty(malformedId, "id", { value: 42 });
      expectInvalidOperation(() => resource(malformedId));
    });

    it("projects Resource configuration failures in declaration order", () => {
      const key = (id: string) => [id] as const;
      const lookup = (id: string, _options: OperationOptions) => Effect.succeed(id);
      const invalidId = { id: "projects.invalid", key, lookup };
      Object.defineProperty(invalidId, "id", { value: 42 });
      const invalidKey = { id: "projects.invalid", key, lookup };
      Object.defineProperty(invalidKey, "key", { value: undefined });
      const invalidLookup = { id: "projects.invalid", key, lookup };
      Object.defineProperty(invalidLookup, "lookup", { value: undefined });
      const invalidIdAndKey = { id: "projects.invalid", key, lookup };
      Object.defineProperties(invalidIdAndKey, {
        id: { value: 42 },
        key: { value: undefined },
      });
      const invalidKeyAndLookup = { id: "projects.invalid", key, lookup };
      Object.defineProperties(invalidKeyAndLookup, {
        key: { value: undefined },
        lookup: { value: undefined },
      });
      const excess = { id: "projects.invalid", key, lookup, extra: true };

      expectInvalidOperationMessage(
        () => resource(invalidId),
        "Operation id must be a valid authored name",
      );
      expectInvalidOperationMessage(() => resource(invalidKey), "Resource key must be callable");
      expectInvalidOperationMessage(
        () => resource(invalidLookup),
        "Resource lookup adapter must be callable",
      );
      expectInvalidOperationMessage(
        () => resource(invalidIdAndKey),
        "Operation id must be a valid authored name",
      );
      expectInvalidOperationMessage(
        () => resource(invalidKeyAndLookup),
        "Resource key must be callable",
      );
      expectInvalidOperationMessage(() => resource(excess), "Invalid Resource configuration");
    });

    it("rejects a Resource with an omitted id before later fields", () => {
      const key = (id: string) => [id] as const;
      const lookup = (id: string, _options: OperationOptions) => Effect.succeed(id);
      const config = { id: "projects.omitted-id", key, lookup };
      Reflect.deleteProperty(config, "id");
      Reflect.deleteProperty(config, "key");

      expectInvalidOperation(() => resource(config));
    });

    it("rejects a Resource with an omitted key before lookup", () => {
      const key = (id: string) => [id] as const;
      const lookup = (id: string, _options: OperationOptions) => Effect.succeed(id);
      const config = { id: "projects.omitted-key", key, lookup };
      Reflect.deleteProperty(config, "key");
      Reflect.deleteProperty(config, "lookup");

      expectInvalidOperation(() => resource(config));
    });

    it("rejects a Resource with an omitted lookup", () => {
      const key = (id: string) => [id] as const;
      const lookup = (id: string, _options: OperationOptions) => Effect.succeed(id);
      const config = { id: "projects.omitted-lookup", key, lookup };
      Reflect.deleteProperty(config, "lookup");

      expectInvalidOperation(() => resource(config));
    });

    it("admits Resource shape and optional fields without callback execution", () => {
      let keyCalls = 0;
      let lookupCalls = 0;
      const key = (id: string) => {
        keyCalls += 1;
        return [id] as const;
      };
      const lookup = (id: string, _options: OperationOptions) => {
        lookupCalls += 1;
        return Effect.succeed(id);
      };
      const base = { id: "projects.schema-resource", key, lookup };
      const omitted = resource(base);
      const explicitUndefined = { ...base };
      Object.defineProperties(explicitUndefined, {
        staleTime: { value: undefined },
        gcTime: { value: undefined },
        persist: { value: undefined },
      });
      const explicit = resource(explicitUndefined);
      const excess = { ...base, extra: true };
      const wrongPersist = { ...base };
      Object.defineProperty(wrongPersist, "persist", { value: "yes" });

      assert.strictEqual(keyCalls, 0);
      assert.strictEqual(lookupCalls, 0);
      assert.strictEqual(omitted.persist, false);
      assert.strictEqual(explicit.persist, false);
      assert.strictEqual("staleTime" in explicit, false);
      assert.strictEqual("gcTime" in explicit, false);
      expectInvalidOperation(() => resource(excess));
      expectInvalidOperation(() => resource(wrongPersist));
    });

    it("admits Transaction shape and optional fields without callback execution", () => {
      let keyCalls = 0;
      let commitCalls = 0;
      const key = (id: string) => {
        keyCalls += 1;
        return [id] as const;
      };
      const commit = (id: string, _options: OperationOptions) => {
        commitCalls += 1;
        return Effect.succeed(id);
      };
      const base = { id: "projects.schema-transaction", key, commit };
      const keyed = transaction(base);
      const explicitUndefined = { ...base };
      Object.defineProperties(explicitUndefined, {
        persist: { value: undefined },
        concurrency: { value: undefined },
      });
      const explicit = transaction(explicitUndefined);
      const excess = { ...base, extra: true };
      const wrongPersist = { ...base };
      Object.defineProperty(wrongPersist, "persist", { value: "yes" });
      const wrongConcurrency = { ...base };
      Object.defineProperty(wrongConcurrency, "concurrency", { value: "parallel" });

      assert.strictEqual(keyCalls, 0);
      assert.strictEqual(commitCalls, 0);
      assert.strictEqual(keyed.persist, false);
      assert.strictEqual(keyed.concurrency, "cancel");
      assert.strictEqual(explicit.persist, false);
      assert.strictEqual(explicit.concurrency, "cancel");
      expectInvalidOperation(() => transaction(excess));
      expectInvalidOperation(() => transaction(wrongPersist));
      expectInvalidOperation(() => transaction(wrongConcurrency));
    });

    it("admits Stream shape and optional fields without callback execution", () => {
      let keyCalls = 0;
      let subscribeCalls = 0;
      const key = (id: string) => {
        keyCalls += 1;
        return [id] as const;
      };
      const subscribe = (id: string, _options: OperationOptions) => {
        subscribeCalls += 1;
        return Stream.make(id);
      };
      const base = { id: "projects.schema-stream", key, subscribe };
      const omitted = stream(base);
      const explicitUndefined = { ...base };
      Object.defineProperty(explicitUndefined, "persist", { value: undefined });
      const explicit = stream(explicitUndefined);
      const excess = { ...base, extra: true };
      const wrongPersist = { ...base };
      Object.defineProperty(wrongPersist, "persist", { value: "yes" });

      assert.strictEqual(keyCalls, 0);
      assert.strictEqual(subscribeCalls, 0);
      assert.strictEqual(omitted.persist, false);
      assert.strictEqual(explicit.persist, false);
      expectInvalidOperation(() => stream(excess));
      expectInvalidOperation(() => stream(wrongPersist));
    });

    it("keeps omitted and explicit undefined Transaction keys distinct", () => {
      const commit = (_options: OperationOptions) => Effect.succeed(true);
      const parameterless = transaction({
        id: "projects.omitted-transaction-key",
        commit,
      });
      const explicitUndefined = {
        id: "projects.explicit-undefined-transaction-key",
        commit,
      };
      Object.defineProperty(explicitUndefined, "key", { value: undefined });

      assert.deepStrictEqual(parameterless.key(undefined), []);
      expectInvalidOperation(() => transaction(explicitUndefined));
    });

    it("projects Stream configuration failures in declaration order", () => {
      const key = (id: string) => [id] as const;
      const subscribe = (id: string, _options: OperationOptions) => Stream.make(id);
      const invalidId = { id: "projects.invalid", key, subscribe };
      Object.defineProperty(invalidId, "id", { value: 42 });
      const invalidKey = { id: "projects.invalid", key, subscribe };
      Object.defineProperty(invalidKey, "key", { value: undefined });
      const invalidSubscribe = { id: "projects.invalid", key, subscribe };
      Object.defineProperty(invalidSubscribe, "subscribe", { value: undefined });
      const invalidIdAndKey = { id: "projects.invalid", key, subscribe };
      Object.defineProperties(invalidIdAndKey, {
        id: { value: 42 },
        key: { value: undefined },
      });
      const invalidKeyAndSubscribe = { id: "projects.invalid", key, subscribe };
      Object.defineProperties(invalidKeyAndSubscribe, {
        key: { value: undefined },
        subscribe: { value: undefined },
      });
      const excess = { id: "projects.invalid", key, subscribe, extra: true };
      const missingId = { id: "projects.missing-id", key, subscribe };
      Reflect.deleteProperty(missingId, "id");
      const missingKey = { id: "projects.missing-key", key, subscribe };
      Reflect.deleteProperty(missingKey, "key");
      const missingSubscribe = { id: "projects.missing-subscribe", key, subscribe };
      Reflect.deleteProperty(missingSubscribe, "subscribe");

      expectInvalidOperationMessage(
        () => stream(invalidId),
        "Operation id must be a valid authored name",
      );
      expectInvalidOperationMessage(() => stream(invalidKey), "Stream key must be callable");
      expectInvalidOperationMessage(
        () => stream(invalidSubscribe),
        "Stream subscribe adapter must be callable",
      );
      expectInvalidOperationMessage(
        () => stream(invalidIdAndKey),
        "Operation id must be a valid authored name",
      );
      expectInvalidOperationMessage(
        () => stream(invalidKeyAndSubscribe),
        "Stream key must be callable",
      );
      expectInvalidOperation(() => stream(missingId));
      expectInvalidOperation(() => stream(missingKey));
      expectInvalidOperation(() => stream(missingSubscribe));
      expectInvalidOperationMessage(() => stream(excess), "Invalid Stream configuration");
    });

    it("projects Transaction configuration failures in declaration order", () => {
      const key = (id: string) => [id] as const;
      const commit = (id: string, _options: OperationOptions) => Effect.succeed(id);
      const invalidId = { id: "projects.invalid", key, commit };
      Object.defineProperty(invalidId, "id", { value: 42 });
      const invalidKey = { id: "projects.invalid", key, commit };
      Object.defineProperty(invalidKey, "key", { value: undefined });
      const invalidCommit = { id: "projects.invalid", key, commit };
      Object.defineProperty(invalidCommit, "commit", { value: undefined });
      const invalidIdAndKey = { id: "projects.invalid", key, commit };
      Object.defineProperties(invalidIdAndKey, {
        id: { value: 42 },
        key: { value: undefined },
      });
      const invalidKeyAndCommit = { id: "projects.invalid", key, commit };
      Object.defineProperties(invalidKeyAndCommit, {
        key: { value: undefined },
        commit: { value: undefined },
      });
      const excess = { id: "projects.invalid", key, commit, extra: true };
      const missingId = { id: "projects.missing-id", key, commit };
      Reflect.deleteProperty(missingId, "id");
      const missingCommit = { id: "projects.missing-commit", key, commit };
      Reflect.deleteProperty(missingCommit, "commit");

      expectInvalidOperationMessage(
        () => transaction(invalidId),
        "Operation id must be a valid authored name",
      );
      expectInvalidOperationMessage(
        () => transaction(invalidKey),
        "Transaction key must be callable",
      );
      expectInvalidOperationMessage(
        () => transaction(invalidCommit),
        "Transaction commit adapter must be callable",
      );
      expectInvalidOperationMessage(
        () => transaction(invalidIdAndKey),
        "Operation id must be a valid authored name",
      );
      expectInvalidOperationMessage(
        () => transaction(invalidKeyAndCommit),
        "Transaction key must be callable",
      );
      expectInvalidOperation(() => transaction(missingId));
      expectInvalidOperation(() => transaction(missingCommit));
      expectInvalidOperationMessage(() => transaction(excess), "Invalid Transaction configuration");
    });

    it("captures resource required config fields before validation", () => {
      const firstKey = (params: string) => ["resource-first", params] as const;
      const secondKey = (params: string) => ["resource-second", params] as const;
      const firstLookup = (params: string, _options: OperationOptions) => Effect.succeed(params);
      const secondLookup = (params: string, _options: OperationOptions) => Effect.succeed(params);
      let idReads = 0;
      let keyReads = 0;
      let lookupReads = 0;
      const config = new Proxy(
        {
          id: "projects.flapping-resource" as const,
          key: firstKey,
          lookup: firstLookup,
        },
        {
          get(target, property) {
            if (property === "id") return idReads++ === 0 ? target.id : "projects.changed";
            if (property === "key") return keyReads++ === 0 ? target.key : secondKey;
            if (property === "lookup") return lookupReads++ === 0 ? target.lookup : secondLookup;
            if (property === "staleTime" || property === "gcTime" || property === "persist") {
              return undefined;
            }
            throw new Error(`Unexpected resource config property: ${String(property)}`);
          },
        },
      );
      const admitted = resource(config);

      assert.strictEqual(idReads, 1);
      assert.strictEqual(keyReads, 1);
      assert.strictEqual(lookupReads, 1);
      assert.strictEqual(admitted.id, "projects.flapping-resource");
      assert.deepStrictEqual(admitted.key("project-1"), ["resource-first", "project-1"]);
    });

    it("captures transaction required config fields before validation", () => {
      const firstKey = (params: string) => ["transaction-first", params] as const;
      const secondKey = (params: string) => ["transaction-second", params] as const;
      const firstCommit = (params: string, _options: OperationOptions) => Effect.succeed(params);
      const secondCommit = (params: string, _options: OperationOptions) => Effect.succeed(params);
      let idReads = 0;
      let keyReads = 0;
      let commitReads = 0;
      const config = new Proxy(
        {
          id: "projects.flapping-transaction" as const,
          key: firstKey,
          commit: firstCommit,
        },
        {
          get(target, property) {
            if (property === "id") return idReads++ === 0 ? target.id : "projects.changed";
            if (property === "key") return keyReads++ === 0 ? target.key : secondKey;
            if (property === "commit") return commitReads++ === 0 ? target.commit : secondCommit;
            if (property === "persist" || property === "concurrency") return undefined;
            throw new Error(`Unexpected transaction config property: ${String(property)}`);
          },
        },
      );
      const admitted = transaction(config);

      assert.strictEqual(idReads, 1);
      assert.strictEqual(keyReads, 1);
      assert.strictEqual(commitReads, 1);
      assert.strictEqual(admitted.id, "projects.flapping-transaction");
      assert.deepStrictEqual(admitted.key("project-1"), ["transaction-first", "project-1"]);
    });

    it("captures stream required config fields before validation", () => {
      const firstKey = (params: string) => ["stream-first", params] as const;
      const secondKey = (params: string) => ["stream-second", params] as const;
      const firstSubscribe = (params: string, _options: OperationOptions) => Stream.make(params);
      const secondSubscribe = (params: string, _options: OperationOptions) => Stream.make(params);
      let idReads = 0;
      let keyReads = 0;
      let subscribeReads = 0;
      const config = new Proxy(
        {
          id: "projects.flapping-stream" as const,
          key: firstKey,
          subscribe: firstSubscribe,
        },
        {
          get(target, property) {
            if (property === "id") return idReads++ === 0 ? target.id : "projects.changed";
            if (property === "key") return keyReads++ === 0 ? target.key : secondKey;
            if (property === "subscribe") {
              return subscribeReads++ === 0 ? target.subscribe : secondSubscribe;
            }
            if (property === "persist") return undefined;
            throw new Error(`Unexpected stream config property: ${String(property)}`);
          },
        },
      );
      const admitted = stream(config);

      assert.strictEqual(idReads, 1);
      assert.strictEqual(keyReads, 1);
      assert.strictEqual(subscribeReads, 1);
      assert.strictEqual(admitted.id, "projects.flapping-stream");
      assert.deepStrictEqual(admitted.key("project-1"), ["stream-first", "project-1"]);
    });
  });

  describe("plan publication and identity laws", () => {
    it("carries the exact key on parameterized and constant-key commit plans", () => {
      let commitCalls = 0;
      const commit = (params: ProjectInput, _options: OperationOptions) => {
        commitCalls += 1;
        return Effect.succeed({ id: params.id });
      };
      const save = transaction({
        id: "projects.save",
        key: (params: ProjectInput) => [params.id] as const,
        commit,
        persist: true,
        concurrency: "serialize",
      });
      const refreshCommit = () => Effect.succeed({ refreshed: true });
      const keyedPlan = save.commit({ id: "project-1" });
      const refresh = transaction({
        id: "projects.refresh",
        key: () => ["refresh"] as const,
        commit: refreshCommit,
      });

      assert.strictEqual(commitCalls, 0);
      assert.strictEqual(readOperationAdapter(refresh), refreshCommit);
      assert.strictEqual(save.persist, true);
      assert.strictEqual(save.concurrency, "serialize");
      assert.deepStrictEqual(keyedPlan.key, ["project-1"]);
      assert.strictEqual("options" in keyedPlan, false);
      const keyedCancellation = save.cancel(["project-1"]);
      assert.strictEqual(keyedCancellation.descriptor, "projects.save");
      assert.strictEqual(keyedCancellation.family, "transaction");
      assert.deepStrictEqual(refresh.key(undefined), ["refresh"]);
      assert.deepStrictEqual(refresh.commit(undefined).key, ["refresh"]);
      assert.deepStrictEqual(refresh.commit(undefined), refresh.commit(undefined, undefined));
      const refreshOptions = {};
      const refreshPlan = refresh.commit(undefined, refreshOptions);
      assert.strictEqual(refreshPlan.params, undefined);
      assert.strictEqual(refreshPlan.options, refreshOptions);
      assert.deepStrictEqual(save.getState(["project-1"]), {
        status: "idle",
        key: ["project-1"],
      });
    });

    it("retains stream subscriptions and exposes no cancel action", () => {
      let subscribeCalls = 0;
      const subscribe = (params: ProjectInput, _options: OperationOptions) => {
        subscribeCalls += 1;
        return Stream.make({ id: params.id });
      };
      const updates = stream({
        id: "projects.updates",
        key: (params: ProjectInput) => [params.id] as const,
        subscribe,
        persist: true,
      });
      const options = {};
      const plan = updates.subscribe({ id: "project-1" }, options);

      assert.strictEqual(subscribeCalls, 0);
      assert.deepStrictEqual(plan.key, ["project-1"]);
      assert.strictEqual(plan.options, options);
      assert.deepStrictEqual(
        updates.subscribe({ id: "project-1" }),
        updates.subscribe({ id: "project-1" }, undefined),
      );
      assert.deepStrictEqual(updates.getState(["project-1"]), {
        status: "idle",
        key: ["project-1"],
        generation: null,
        hasValue: false,
        emissionCount: 0,
      });
      assert.strictEqual(updates.persist, true);
      assert.strictEqual("cancel" in updates, false);
    });

    it("publishes and locks only descriptor identity for each family", () => {
      const resourceKey = (projectId: string) => [projectId] as const;
      const resourceLookup = (projectId: string) => Effect.succeed(projectId);
      const project = resource({
        id: "projects.identity-resource",
        key: resourceKey,
        lookup: resourceLookup,
      });
      const transactionKey = (projectId: string) => [projectId] as const;
      const transactionCommit = (projectId: string) => Effect.succeed(projectId);
      const save = transaction({
        id: "projects.identity-transaction",
        key: transactionKey,
        commit: transactionCommit,
      });
      const streamKey = (projectId: string) => [projectId] as const;
      const streamSubscribe = (projectId: string) => Stream.make(projectId);
      const updates = stream({
        id: "projects.identity-stream",
        key: streamKey,
        subscribe: streamSubscribe,
      });

      const assertIdentity = (
        descriptor: { readonly kind: string; readonly id: string },
        kind: string,
        id: string,
        adapter: unknown,
      ) => {
        assert.deepStrictEqual(
          {
            kind: Object.getOwnPropertyDescriptor(descriptor, "kind"),
            id: Object.getOwnPropertyDescriptor(descriptor, "id"),
          },
          {
            kind: { configurable: false, enumerable: true, value: kind, writable: false },
            id: { configurable: false, enumerable: true, value: id, writable: false },
          },
        );
        assert.strictEqual(Object.isFrozen(descriptor), false);
        assert.strictEqual(Reflect.set(descriptor, "kind", "changed"), false);
        assert.strictEqual(Reflect.set(descriptor, "id", "changed"), false);
        assert.throws(
          () => Object.defineProperty(descriptor, "kind", { value: "changed" }),
          TypeError,
        );
        assert.throws(
          () => Object.defineProperty(descriptor, "id", { value: "changed" }),
          TypeError,
        );
        assert.strictEqual(descriptor.kind, kind);
        assert.strictEqual(descriptor.id, id);

        const adapterSymbol = Object.getOwnPropertySymbols(descriptor).find(
          (symbol) => Object.getOwnPropertyDescriptor(descriptor, symbol)?.enumerable === false,
        );
        assert.ok(adapterSymbol !== undefined);
        assert.deepStrictEqual(Object.getOwnPropertyDescriptor(descriptor, adapterSymbol), {
          configurable: false,
          enumerable: false,
          value: adapter,
          writable: false,
        });
        assert.strictEqual(Reflect.set(descriptor, adapterSymbol, undefined), false);
        assert.throws(
          () => Object.defineProperty(descriptor, adapterSymbol, { value: undefined }),
          TypeError,
        );
      };

      assertIdentity(project, "resource", "projects.identity-resource", resourceLookup);
      assertIdentity(save, "transaction", "projects.identity-transaction", transactionCommit);
      assertIdentity(updates, "stream", "projects.identity-stream", streamSubscribe);
      assert.strictEqual(readOperationAdapter(project), resourceLookup);
      assert.strictEqual(readOperationAdapter(save), transactionCommit);
      assert.strictEqual(readOperationAdapter(updates), streamSubscribe);
    });

    it("publishes readonly auxiliary plans without runtime freezing", () => {
      const project = resource({
        id: "projects.immutable-plans",
        key: (projectId: string) => [projectId] as const,
        lookup: () => Effect.succeed({ mutable: true }),
      });
      const refresh = transaction({
        id: "projects.immutable-plan-transaction",
        commit: (_options: OperationOptions) => Effect.succeed(true),
      });
      const value = { mutable: true };
      const write = project.setData(["project-1"], value);
      const resourceCancellation = project.cancel(["project-1"]);
      const transactionCancellation = refresh.cancel([]);

      const assertAuxiliaryPlan = (
        plan: Readonly<{ kind: "cache-write" | "cancel" }>,
        kind: "cache-write" | "cancel",
      ) => {
        assert.strictEqual(Object.isFrozen(plan), false);
        assert.strictEqual(plan.kind, kind);
      };

      assertAuxiliaryPlan(write, "cache-write");
      assertAuxiliaryPlan(resourceCancellation, "cancel");
      assertAuxiliaryPlan(transactionCancellation, "cancel");
      assert.strictEqual(write.descriptor, "projects.immutable-plans");
      assert.strictEqual(resourceCancellation.descriptor, "projects.immutable-plans");
      assert.strictEqual(transactionCancellation.descriptor, "projects.immutable-plan-transaction");
      assert.deepStrictEqual(write.key, ["project-1"]);
      assert.deepStrictEqual(resourceCancellation.key, ["project-1"]);
      assert.deepStrictEqual(transactionCancellation.key, []);
      assert.strictEqual(Object.isFrozen(value), false);
      value.mutable = false;
      assert.strictEqual(write.value, value);
      assert.strictEqual(value.mutable, false);
    });

    it("captures descriptor config and publishes copied canonical keys", () => {
      const rawKey: CanonicalKeyInput[] = [-0, { z: "last", a: "first" }];
      const config = {
        id: "projects.captured",
        key: (_params: ProjectInput) => rawKey,
        lookup: (params: ProjectInput, _options: OperationOptions) =>
          Effect.succeed({ id: params.id }),
      };
      const captured = resource(config);
      const plan = captured.lookup({ id: "project-1" });

      rawKey[0] = 1;
      config.id = "projects.changed";
      config.key = () => ["changed"];

      const invalidKey: readonly [string] = ["valid"];
      Object.defineProperty(invalidKey, 0, {
        configurable: true,
        enumerable: true,
        value: undefined,
        writable: true,
      });

      assert.strictEqual(plan.descriptor, "projects.captured");
      assert.deepStrictEqual(plan.key, [0, { a: "first", z: "last" }]);
      assert.strictEqual(Object.isFrozen(plan.key), true);
      assert.strictEqual(Object.isFrozen(plan.key[1]), true);
      assert.throws(
        () =>
          resource({
            id: "projects.invalid-key",
            key: (_params: ProjectInput) => invalidKey,
            lookup: (params: ProjectInput, _options: OperationOptions) =>
              Effect.succeed({ id: params.id }),
          }).lookup({ id: "project-1" }),
        TypeError,
      );
    });
  });
});

import { invalidResourceKeyDiagnostic } from "../../shared/diagnostics.js";
import type { FlowKey, FlowResourceRef } from "./types.js";

type EncodeMode = "runtime" | "durable";

const maxDepth = 32;
const maxNodes = 2_048;
const maxArrayLength = 1_024;
const maxStringLength = 8_192;
const maxEncodedLength = 65_536;

type RuntimeLocalIdentityState = {
  readonly localObjectTokens: WeakMap<object, string>;
  readonly localSymbolTokens: Map<symbol, string>;
  readonly resourceIdentities: WeakMap<object, string>;
  nextLocalToken: number;
};

export type FlowKeyIdentityScope = Readonly<{
  readonly flowKeyIdentity: (key: FlowKey) => string;
  readonly resourceIdentityFor: (ref: FlowResourceRef) => string;
}>;

type EncodeState = {
  readonly mode: EncodeMode;
  readonly runtimeLocalIdentity?: RuntimeLocalIdentityState;
  readonly seen: WeakSet<object>;
  nodes: number;
  encodedLength: number;
};

function createRuntimeLocalIdentityState(): RuntimeLocalIdentityState {
  return {
    localObjectTokens: new WeakMap(),
    localSymbolTokens: new Map(),
    resourceIdentities: new WeakMap(),
    nextLocalToken: 0,
  };
}

function nextToken(kind: string, runtimeLocalIdentity: RuntimeLocalIdentityState): string {
  runtimeLocalIdentity.nextLocalToken += 1;
  return `local:${kind}:${runtimeLocalIdentity.nextLocalToken}`;
}

function sized(text: string, state: EncodeState): string {
  state.encodedLength += text.length;
  if (state.encodedLength > maxEncodedLength) {
    throw invalidResourceKeyDiagnostic({
      field: "key",
      reason: "encoded-size-limit",
    });
  }
  return text;
}

function countNode(state: EncodeState): void {
  state.nodes += 1;
  if (state.nodes > maxNodes) {
    throw invalidResourceKeyDiagnostic({
      field: "key",
      reason: "node-limit",
    });
  }
}

function stringToken(value: string, state: EncodeState): string {
  if (value.length > maxStringLength) {
    throw invalidResourceKeyDiagnostic({
      field: "key",
      reason: "string-limit",
    });
  }
  return sized(`s${value.length}:${value}`, state);
}

function localTokenFor(value: object | symbol, state: EncodeState): string {
  if (state.mode === "durable") {
    throw invalidResourceKeyDiagnostic({
      field: "key",
      reason: "runtime-local-value",
    });
  }

  if (typeof value === "symbol") {
    const runtimeLocalIdentity = state.runtimeLocalIdentity;
    if (runtimeLocalIdentity === undefined) {
      throw invalidResourceKeyDiagnostic({
        field: "key",
        reason: "runtime-local-value",
      });
    }
    const existing = runtimeLocalIdentity.localSymbolTokens.get(value);
    if (existing !== undefined) {
      return sized(existing, state);
    }
    const token = nextToken("symbol", runtimeLocalIdentity);
    runtimeLocalIdentity.localSymbolTokens.set(value, token);
    return sized(token, state);
  }

  const runtimeLocalIdentity = state.runtimeLocalIdentity;
  if (runtimeLocalIdentity === undefined) {
    throw invalidResourceKeyDiagnostic({
      field: "key",
      reason: "runtime-local-value",
    });
  }
  const existing = runtimeLocalIdentity.localObjectTokens.get(value);
  if (existing !== undefined) {
    return sized(existing, state);
  }
  const token = nextToken(
    typeof value === "function" ? "function" : "object",
    runtimeLocalIdentity,
  );
  runtimeLocalIdentity.localObjectTokens.set(value, token);
  return sized(token, state);
}

function isPlainRecord(value: object): boolean {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function encodeNumber(value: number, state: EncodeState): string {
  if (Object.is(value, -0)) {
    return sized("num:-0", state);
  }
  if (Number.isNaN(value)) {
    return sized("num:NaN", state);
  }
  if (value === Infinity) {
    return sized("num:+Infinity", state);
  }
  if (value === -Infinity) {
    return sized("num:-Infinity", state);
  }
  return sized(`num:${value}`, state);
}

function encodeArray(value: ReadonlyArray<unknown>, state: EncodeState, depth: number): string {
  if (value.length > maxArrayLength) {
    throw invalidResourceKeyDiagnostic({
      field: "key",
      reason: "array-limit",
    });
  }
  const entries: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, index);
    if (descriptor === undefined) {
      throw invalidResourceKeyDiagnostic({
        field: "key",
        reason: "sparse-array",
      });
    }
    if (!("value" in descriptor)) {
      throw invalidResourceKeyDiagnostic({
        field: "key",
        reason: "accessor-property",
      });
    }
    entries.push(encodeValue(descriptor.value, state, depth + 1));
  }

  return sized(`a${entries.length}[${entries.join("")}]`, state);
}

function encodeRecord(value: object, state: EncodeState, depth: number): string {
  if (!isPlainRecord(value)) {
    return localTokenFor(value, state);
  }

  const symbolKeys = Object.getOwnPropertySymbols(value);
  if (symbolKeys.length > 0) {
    throw invalidResourceKeyDiagnostic({
      field: "key",
      reason: "symbol-key",
    });
  }

  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Object.keys(descriptors).sort((left, right) => left.localeCompare(right));
  const entries: string[] = [];
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (descriptor === undefined || !("value" in descriptor)) {
      throw invalidResourceKeyDiagnostic({
        field: "key",
        reason: "accessor-property",
      });
    }
    if (key === "__proto__" || key === "prototype" || key === "constructor") {
      throw invalidResourceKeyDiagnostic({
        field: "key",
        reason: "reserved-property",
      });
    }
    entries.push(`${stringToken(key, state)}${encodeValue(descriptor.value, state, depth + 1)}`);
  }

  return sized(`o${entries.length}{${entries.join("")}}`, state);
}

function encodeValue(value: unknown, state: EncodeState, depth: number): string {
  if (depth > maxDepth) {
    throw invalidResourceKeyDiagnostic({
      field: "key",
      reason: "depth-limit",
    });
  }

  countNode(state);

  if (value === undefined) {
    return sized("u", state);
  }
  if (value === null) {
    return sized("n", state);
  }

  switch (typeof value) {
    case "string":
      return stringToken(value, state);
    case "boolean":
      return sized(value ? "bool:1" : "bool:0", state);
    case "number":
      return encodeNumber(value, state);
    case "bigint":
      return sized(`bigint:${value.toString()}`, state);
    case "symbol":
      return localTokenFor(value, state);
    case "function":
      return localTokenFor(value, state);
    case "object": {
      if (state.seen.has(value)) {
        throw invalidResourceKeyDiagnostic({
          field: "key",
          reason: "cycle",
        });
      }
      state.seen.add(value);
      try {
        return Array.isArray(value)
          ? encodeArray(value, state, depth)
          : encodeRecord(value, state, depth);
      } finally {
        state.seen.delete(value);
      }
    }
    default:
      throw invalidResourceKeyDiagnostic({
        field: "key",
        reason: `unsupported-${typeof value}`,
      });
  }
}

function encodeFlowKey(
  key: FlowKey,
  mode: EncodeMode,
  runtimeLocalIdentity?: RuntimeLocalIdentityState,
): string {
  return encodeArray(
    key,
    {
      mode,
      ...(runtimeLocalIdentity === undefined ? {} : { runtimeLocalIdentity }),
      seen: new WeakSet<object>(),
      nodes: 0,
      encodedLength: 0,
    },
    0,
  );
}

export function createFlowKeyIdentityScope(): FlowKeyIdentityScope {
  const runtimeLocalIdentity = createRuntimeLocalIdentityState();

  const flowKeyIdentity = (key: FlowKey): string =>
    encodeFlowKey(key, "runtime", runtimeLocalIdentity);

  const resourceIdentityFor = (ref: FlowResourceRef): string => {
    const existing = runtimeLocalIdentity.resourceIdentities.get(ref);
    if (existing !== undefined) {
      return existing;
    }

    const identity = `${stringToken(ref.id, {
      mode: "runtime",
      runtimeLocalIdentity,
      seen: new WeakSet<object>(),
      nodes: 0,
      encodedLength: 0,
    })}|${flowKeyIdentity(ref.key)}`;
    runtimeLocalIdentity.resourceIdentities.set(ref, identity);
    return identity;
  };

  return {
    flowKeyIdentity,
    resourceIdentityFor,
  };
}

const defaultFlowKeyIdentityScope = createFlowKeyIdentityScope();

export function flowKeyIdentity(key: FlowKey): string {
  return defaultFlowKeyIdentityScope.flowKeyIdentity(key);
}

export function assertDurableFlowKey(key: FlowKey): void {
  encodeFlowKey(key, "durable");
}

export function durableFlowKeyIdentity(key: FlowKey): string {
  return encodeFlowKey(key, "durable");
}

export function resourceIdentityFor(ref: FlowResourceRef): string {
  return defaultFlowKeyIdentityScope.resourceIdentityFor(ref);
}
